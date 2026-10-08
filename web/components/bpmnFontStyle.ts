// Tebal / miring untuk teks elemen BPMN (label tugas, event, gateway, pool/lane, dst).
//
// bpmn-js tidak punya format teks per-elemen: label digambar sebagai <text> SVG
// polos. Di sini gaya disimpan sebagai atribut DI milik aplikasi
// (simpel:bold / simpel:italic pada BPMNShape/BPMNEdge) melalui ekstensi moddle —
// sehingga tersimpan di XML, bisa di-undo (updateModdleProperties = command), dan
// dibaca juga oleh viewer mode baca / link berbagi. Setelah elemen dirender ulang,
// gaya diterapkan ke seluruh <text> di visualnya; saveSVG menyalin gaya inline
// tersebut sehingga ekspor SVG/PDF ikut tebal/miring.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

export const simpelModdleDescriptor = {
  name: 'SIMPEL',
  uri: 'http://simpel.atrbpn.go.id/schema/bpmn',
  prefix: 'simpel',
  // JANGAN pakai xml.tagAlias 'lowerCase': opsi itu ikut mengubah nama tag tipe yang
  // diperluas → XML jadi <bpmndi:bPMNShape> dan dokumen tak bisa dibuka lagi.
  types: [
    {
      name: 'FontStyled',
      isAbstract: true,
      extends: ['bpmndi:BPMNShape', 'bpmndi:BPMNEdge'],
      properties: [
        { name: 'bold', isAttr: true, type: 'Boolean' },
        { name: 'italic', isAttr: true, type: 'Boolean' },
      ],
    },
  ],
};

// DI pemilik gaya: label eksternal memakai DI elemen induknya.
export function styleDi(el: El): El | undefined {
  const target = el?.labelTarget || el;
  return target?.di;
}

export function readFontStyle(el: El): { bold: boolean; italic: boolean } {
  const di = styleDi(el);
  if (!di) return { bold: false, italic: false };
  let bold = false, italic = false;
  try { bold = !!di.get('simpel:bold'); italic = !!di.get('simpel:italic'); } catch { /* abaikan */ }
  return { bold, italic };
}

function paintText(gfx: SVGElement | undefined | null, style: { bold: boolean; italic: boolean }) {
  if (!gfx) return;
  gfx.querySelectorAll('.djs-visual text').forEach((t) => {
    const s = (t as SVGTextElement).style;
    s.fontWeight = style.bold ? 'bold' : '';
    s.fontStyle = style.italic ? 'italic' : '';
  });
}

// Modul didi: terapkan gaya setiap kali elemen / label-nya digambar atau berubah.
class FontStylePainter {
  static $inject = ['eventBus', 'elementRegistry', 'textRenderer', 'injector'];
  constructor(eventBus: El, elementRegistry: El, textRenderer: El, injector: El) {
    // Saat menyunting teks label, kotak ketik bawaan bpmn-js selalu tampil normal
    // walau elemennya tebal/miring → pengguna mengira gayanya hilang. Samakan.
    const directEditing = injector?.get?.('directEditing', false);
    if (directEditing) {
      eventBus.on('directEditing.activate', (e: { active?: { element?: El } }) => {
        const content = directEditing._textbox?.content as HTMLElement | undefined;
        if (!content || !e.active?.element) return;
        const st = readFontStyle(e.active.element);
        content.style.fontWeight = st.bold ? 'bold' : '';
        content.style.fontStyle = st.italic ? 'italic' : '';
      });
    }

    // Pemenggalan baris label dihitung saat render memakai gaya yang diberikan ke
    // textRenderer. Tanpa ini baris dipenggal dgn metrik huruf NORMAL, sehingga teks
    // tebal/miring (lebih lebar) mepet/meluber keluar kotak. Catat gaya elemen yang
    // sedang digambar (prioritas tinggi = sebelum BpmnRenderer), lalu sisipkan ke
    // style createText.
    let current: { bold: boolean; italic: boolean } | null = null;
    eventBus.on(['render.shape', 'render.connection'], 3000, (e: { element: El }) => {
      current = readFontStyle(e.element);
    });
    if (textRenderer && typeof textRenderer.createText === 'function') {
      const orig = textRenderer.createText.bind(textRenderer);
      textRenderer.createText = (text: string, options: El = {}) => {
        if (current && (current.bold || current.italic)) {
          options = {
            ...options,
            style: {
              ...(options.style || {}),
              ...(current.bold ? { fontWeight: 'bold' } : {}),
              ...(current.italic ? { fontStyle: 'italic' } : {}),
            },
          };
        }
        return orig(text, options);
      };
    }

    const apply = (element: El, gfx?: SVGElement) => {
      if (!element) return;
      const style = readFontStyle(element);
      paintText(gfx || elementRegistry.getGraphics(element), style);
      // Label eksternal punya gfx sendiri — ikut dicat.
      if (element.label) paintText(elementRegistry.getGraphics(element.label), style);
    };
    // Prioritas rendah: berjalan SETELAH GraphicsFactory menggambar ulang visual.
    ['shape.added', 'connection.added', 'shape.changed', 'connection.changed'].forEach((ev) =>
      eventBus.on(ev, 250, (e: { element: El; gfx?: SVGElement }) => apply(e.element, e.gfx)));
  }
}

export const fontStyleModule = {
  __init__: ['fontStylePainter'],
  fontStylePainter: ['type', FontStylePainter],
};

// Toggle gaya pada seleksi. Satu perintah per elemen → Ctrl+Z membatalkan.
// Bila teks label SEDANG disunting: sasaran = elemen yang disunting. Suntingan
// diselesaikan dulu — bpmn-js MEMBATALKAN ketikan begitu ada perintah lain
// (commandStack.changed → directEditing.cancel) — lalu kotak sunting dibuka
// lagi dengan kursor di akhir teks agar pengguna bisa lanjut mengetik.
export function toggleFontStyle(modeler: El, key: 'bold' | 'italic'): void {
  if (!modeler) return;
  const selection = modeler.get('selection');
  const modeling = modeler.get('modeling');
  let directEditing: El = null;
  try { directEditing = modeler.get('directEditing'); } catch { /* viewer */ }
  let sedangSunting: El = null;
  if (directEditing?.isActive?.()) {
    sedangSunting = directEditing._active?.element || null;
    directEditing.complete();
  }
  const sumber: El[] = sedangSunting ? [sedangSunting] : (selection.get() as El[]);
  const seen = new Set<El>();
  const targets: El[] = [];
  sumber.forEach((el) => {
    const t = el?.labelTarget || el;
    if (!t || !t.di || !t.parent || seen.has(t)) return; // lewati root
    seen.add(t); targets.push(t);
  });
  if (!targets.length) return;
  // Bila SEMUA sudah bergaya → matikan; selain itu → nyalakan untuk semua.
  const allOn = targets.every((t) => readFontStyle(t)[key]);
  const prop = `simpel:${key}`;
  targets.forEach((t) => {
    modeling.updateModdleProperties(t, t.di, { [prop]: allOn ? undefined : true });
  });
  if (sedangSunting) {
    try { selection.select(sedangSunting); directEditing.activate(sedangSunting); } catch { /* abaikan */ }
  }
}

// Apakah teks label sedang disunting (kotak ketik bpmn-js aktif)?
export function isEditingLabel(modeler: El): boolean {
  try { return !!modeler?.get('directEditing')?.isActive(); } catch { return false; }
}
