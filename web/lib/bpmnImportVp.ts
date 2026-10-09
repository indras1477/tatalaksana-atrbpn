// Impor Proses Bisnis dari proyek Visual Paradigm (.vpp) → BPMN 2.0 XML.
//
// Berkas .vpp adalah basis data SQLite. Agar tidak menambah dependensi (sql.js/wasm),
// berkas dibaca dengan pembaca SQLite mini (hanya-baca, tabel b-tree + overflow).
// Setiap DIAGRAM bertipe BusinessProcessDiagram menjadi satu pilihan impor.
//
// Aturan geometri Visual Paradigm (diverifikasi pada contoh proyek BPN):
//  • x/y bentuk RELATIF terhadap induknya (_parent) → posisi absolut = jumlah rantai induk.
//  • _points panah: semua titik kecuali terakhir relatif thd pojok kiri-atas bentuk ASAL,
//    titik terakhir relatif thd pojok kiri-atas bentuk TUJUAN.
//  • Pool orientation=1 = vertikal (lajur berjajar ke samping).

// ─────────────────────────────── Pembaca SQLite mini ───────────────────────────────

type Nilai = string | number | Uint8Array | null;

function bacaSqlite(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  const magic = new TextDecoder().decode(b.subarray(0, 15));
  if (magic !== 'SQLite format 3') throw new Error('Berkas bukan proyek Visual Paradigm (.vpp) yang valid.');
  let pageSize = dv.getUint16(16);
  if (pageSize === 1) pageSize = 65536;
  const usable = pageSize - b[20];
  const td = new TextDecoder('utf-8');

  const varint = (p: number): [number, number] => {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const c = b[p + i];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return [v, i + 1];
    }
    return [v * 256 + b[p + 8], 9];
  };

  const payload = (p: number, total: number): Uint8Array => {
    const X = usable - 35;
    if (total <= X) return b.subarray(p, p + total);
    const M = Math.floor(((usable - 12) * 32) / 255) - 23;
    const K = M + ((total - M) % (usable - 4));
    const lokal = K <= X ? K : M;
    const out = new Uint8Array(total);
    out.set(b.subarray(p, p + lokal), 0);
    let isi = lokal;
    let hal = dv.getUint32(p + lokal);
    let jaga = 0;
    while (hal && isi < total && jaga++ < 1e6) {
      const off = (hal - 1) * pageSize;
      const n = Math.min(usable - 4, total - isi);
      out.set(b.subarray(off + 4, off + 4 + n), isi);
      isi += n;
      hal = dv.getUint32(off);
    }
    return out;
  };

  const record = (r: Uint8Array): Nilai[] => {
    const rdv = new DataView(r.buffer, r.byteOffset, r.byteLength);
    const vi = (p: number): [number, number] => {
      let v = 0;
      for (let i = 0; i < 8; i++) {
        const c = r[p + i];
        v = v * 128 + (c & 0x7f);
        if (!(c & 0x80)) return [v, i + 1];
      }
      return [v * 256 + r[p + 8], 9];
    };
    const [hdrLen, n0] = vi(0);
    const tipe: number[] = [];
    for (let p = n0; p < hdrLen;) { const [t, n] = vi(p); tipe.push(t); p += n; }
    const out: Nilai[] = [];
    let p = hdrLen;
    for (const t of tipe) {
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) {
        const len = [0, 1, 2, 3, 4, 6, 8][t];
        let u = 0;
        for (let i = 0; i < len; i++) u = u * 256 + r[p + i];
        if (r[p] & 0x80) u -= Math.pow(2, 8 * len); // bilangan bertanda big-endian
        out.push(u); p += len;
      } else if (t === 7) { out.push(rdv.getFloat64(p)); p += 8; }
      else if (t === 8) out.push(0);
      else if (t === 9) out.push(1);
      else if (t >= 12 && t % 2 === 0) { const len = (t - 12) / 2; out.push(r.slice(p, p + len)); p += len; }
      else if (t >= 13) { const len = (t - 13) / 2; out.push(td.decode(r.subarray(p, p + len))); p += len; }
      else out.push(null);
    }
    return out;
  };

  const scan = (root: number): Nilai[][] => {
    const rows: Nilai[][] = [];
    const tumpuk = [root];
    const dikunjungi = new Set<number>();
    while (tumpuk.length) {
      const hal = tumpuk.pop()!;
      if (dikunjungi.has(hal)) continue;
      dikunjungi.add(hal);
      const base = (hal - 1) * pageSize;
      const h = hal === 1 ? 100 : 0;
      const jenis = b[base + h];
      const nSel = dv.getUint16(base + h + 3);
      if (jenis === 0x05) {
        const ptr0 = base + h + 12;
        const anak: number[] = [];
        for (let i = 0; i < nSel; i++) anak.push(dv.getUint32(base + dv.getUint16(ptr0 + i * 2)));
        anak.push(dv.getUint32(base + h + 8));
        for (let i = anak.length - 1; i >= 0; i--) tumpuk.push(anak[i]);
      } else if (jenis === 0x0d) {
        const ptr0 = base + h + 8;
        for (let i = 0; i < nSel; i++) {
          let p = base + dv.getUint16(ptr0 + i * 2);
          const [len, a] = varint(p); p += a;
          const [, c] = varint(p); p += c;
          rows.push(record(payload(p, len)));
        }
      }
    }
    return rows;
  };

  const master = scan(1); // type, name, tbl_name, rootpage, sql
  const tabel = (nama: string): Record<string, Nilai>[] => {
    const m = master.find(r => r[0] === 'table' && String(r[1]).toUpperCase() === nama.toUpperCase());
    if (!m) return [];
    const sql = String(m[4] || '');
    const isi = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
    const kolom: string[] = [];
    let dalam = 0, awal = 0;
    for (let i = 0; i <= isi.length; i++) {
      const c = isi[i];
      if (c === '(') dalam++;
      else if (c === ')') dalam--;
      else if ((c === ',' && dalam === 0) || i === isi.length) {
        const nm = isi.slice(awal, i).trim().split(/\s+/)[0].replace(/["`[\]]/g, '');
        if (nm && !/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)$/i.test(nm)) kolom.push(nm);
        awal = i + 1;
      }
    }
    return scan(Number(m[3])).map(r => Object.fromEntries(kolom.map((k, i) => [k, r[i] ?? null])));
  };
  return { tabel };
}

// ─────────────────────────────── Parser definisi VP ───────────────────────────────

const teks = (v: Nilai): string =>
  v == null ? '' : typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder('utf-8').decode(v) : String(v);

const esc = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const angka = (s: string, k: string): number | null => {
  const m = s.match(new RegExp('\\n\\t' + esc(k) + '=(-?\\d+(?:\\.\\d+)?);'));
  return m ? Number(m[1]) : null;
};
const rujukan = (s: string, k: string): string | null => {
  const m = s.match(new RegExp('\\n\\t' + esc(k) + '=<([^>]+)>;'));
  return m ? m[1].split(':').pop() || null : null;
};
const subTipe = (s: string, k: string): string | null => {
  const m = s.match(new RegExp('\\n\\t' + esc(k) + '=\\{[^:]*:(?:NULL|"[^"]*"):(\\w+)'));
  return m ? m[1] : null;
};
const keterangan = (s: string) => {
  const m = s.match(/_captionUIModel=\(\s*@x=(-?\d+);,\s*@y=(-?\d+);,\s*@width=(-?\d+);,\s*@height=(-?\d+);/);
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
};

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // karakter kendali selain tab/baris-baru tidak sah di XML
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r?\n/g, '&#10;');

// ─────────────────────────────── Konversi ───────────────────────────────

interface Bentuk {
  id: string; tipe: string; modelId: string | null; induk: string | null;
  x: number; y: number; w: number; h: number; ax: number; ay: number;
  nama: string; def: string; modelDef: string;
  orientasi: number | null; cap: { x: number; y: number; w: number; h: number } | null;
  dari?: string | null; ke?: string | null; titik?: [number, number][];
}

export interface RingkasanImporBpmn {
  pool: number; lane: number; task: number; gateway: number; event: number;
  subProses: number; alur: number; pesan: number; lain: number; dilewati: string[];
}
export interface DiagramImpor { id: string; nama: string; xml: string; ringkasan: RingkasanImporBpmn }
export interface HasilImporBpmn { namaProyek: string; diagram: DiagramImpor[] }

const TIPE_TASK: Record<string, string> = {
  BPUserTask: 'bpmn:userTask', BPSendTask: 'bpmn:sendTask', BPReceiveTask: 'bpmn:receiveTask',
  BPManualTask: 'bpmn:manualTask', BPServiceTask: 'bpmn:serviceTask', BPScriptTask: 'bpmn:scriptTask',
  BPBusinessRuleTask: 'bpmn:businessRuleTask',
};
const DEF_EVENT: Record<string, string> = {
  Message: 'messageEventDefinition', Timer: 'timerEventDefinition', Error: 'errorEventDefinition',
  Signal: 'signalEventDefinition', Terminate: 'terminateEventDefinition', Conditional: 'conditionalEventDefinition',
  Escalation: 'escalationEventDefinition', Compensation: 'compensateEventDefinition', Cancel: 'cancelEventDefinition',
  Link: 'linkEventDefinition',
};

function konversiDiagram(diagramId: string, shapes: Bentuk[]): { xml: string; ringkasan: RingkasanImporBpmn } {
  const peta = new Map(shapes.map(s => [s.id, s]));
  // Posisi absolut = jumlah x/y rantai induk.
  for (const s of shapes) {
    let x = s.x, y = s.y, p = s.induk ? peta.get(s.induk) : undefined, jaga = 0;
    while (p && jaga++ < 50) { x += p.x; y += p.y; p = p.induk ? peta.get(p.induk) : undefined; }
    s.ax = x; s.ay = y;
  }
  const leluhur = (s: Bentuk, tipe: string[]): Bentuk | null => {
    let p = s.induk ? peta.get(s.induk) : undefined, jaga = 0;
    while (p && jaga++ < 50) { if (tipe.includes(p.tipe)) return p; p = p.induk ? peta.get(p.induk) : undefined; }
    return null;
  };

  let seq = 0;
  const idBaru = new Map<string, string>();
  const nid = (s: Bentuk, awalan: string) => {
    if (!idBaru.has(s.id)) idBaru.set(s.id, `${awalan}_${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    return idBaru.get(s.id)!;
  };

  const ring: RingkasanImporBpmn = { pool: 0, lane: 0, task: 0, gateway: 0, event: 0, subProses: 0, alur: 0, pesan: 0, lain: 0, dilewati: [] };
  const lewati = new Map<string, number>();

  const pools = shapes.filter(s => s.tipe === 'BPPool');
  const vertikal = (pool: Bentuk) => {
    if (pool.orientasi != null) return pool.orientasi === 1;
    const lanes = shapes.filter(l => l.tipe === 'BPLane' && l.induk === pool.id);
    return lanes.length > 0 && lanes.every(l => l.h >= pool.h * 0.8);
  };

  // Simpul alur (task/gateway/event/subproses/data) — milik pool/subproses terdekat.
  const SIMPUL = ['BPTask', 'BPSubProcess', 'BPGateway', 'BPStartEvent', 'BPEndEvent', 'BPIntermediateEvent',
    'BPDataObject', 'BPDataStore', 'BPTextAnnotation'];
  const simpul = shapes.filter(s => SIMPUL.includes(s.tipe));
  const wadahDari = (s: Bentuk): string => {
    const w = leluhur(s, ['BPSubProcess', 'BPPool']);
    return w ? w.id : '';
  };
  const di: string[] = [];
  const bounds = (x: number, y: number, w: number, h: number) =>
    `<dc:Bounds x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}" />`;
  const labelDi = (s: Bentuk) => s.cap && s.cap.w > 0 && s.cap.h > 0
    ? `<bpmndi:BPMNLabel>${bounds(s.ax + s.cap.x, s.ay + s.cap.y, s.cap.w, s.cap.h)}</bpmndi:BPMNLabel>` : '';

  // Alur: dipisah sequence (dalam satu wadah) vs message (beda pool).
  const masuk = new Map<string, string[]>(), keluar = new Map<string, string[]>();
  const alurXml: { wadah: string; xml: string }[] = [];
  const pesanXml: string[] = [];
  const asosiasi: { wadah: string; xml: string }[] = [];

  const titikAlur = (f: Bentuk, a: Bentuk, t: Bentuk): [number, number][] => {
    const pts = f.titik || [];
    if (pts.length >= 2) {
      return pts.map(([x, y], i) => i < pts.length - 1 ? [a.ax + x, a.ay + y] : [t.ax + x, t.ay + y]);
    }
    return [[a.ax + a.w / 2, a.ay + a.h / 2], [t.ax + t.w / 2, t.ay + t.h / 2]];
  };

  // ID akhir tiap simpul ditetapkan di muka agar rujukan panah langsung benar.
  const AWALAN: Record<string, string> = {
    BPTask: 'Activity', BPSubProcess: 'Activity', BPGateway: 'Gateway', BPStartEvent: 'Event', BPEndEvent: 'Event',
    BPIntermediateEvent: 'Event', BPDataObject: 'DataObjectReference', BPDataStore: 'DataStoreReference', BPTextAnnotation: 'TextAnnotation',
  };
  for (const s of simpul) nid(s, AWALAN[s.tipe] || 'Node');
  for (const p of pools) nid(p, 'Participant');

  for (const f of shapes.filter(s => s.tipe === 'BPSequenceFlow' || s.tipe === 'BPMessageFlow' || s.tipe === 'BPAssociation')) {
    // Panah yang menempel ke Lane diperlakukan menempel ke Pool-nya (Lane bukan ujung sah).
    const keUjung = (s?: Bentuk) => s && s.tipe === 'BPLane' ? (leluhur(s, ['BPPool']) || undefined) : s;
    const a = keUjung(f.dari ? peta.get(f.dari) : undefined), t = keUjung(f.ke ? peta.get(f.ke) : undefined);
    if (!a || !t) { lewati.set('Panah tanpa ujung', (lewati.get('Panah tanpa ujung') || 0) + 1); continue; }
    const pts = titikAlur(f, a, t);
    const wp = pts.map(([x, y]) => `<di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />`).join('');
    // Label panah ("ya"/"tidak") ditaruh di dekat pangkal segmen pertama (koordinat
    // keterangan VP tidak konsisten antar-versi).
    let lbl = '';
    if (f.nama && pts.length >= 2) {
      const [[x0, y0], [x1, y1]] = pts;
      const lw = Math.max(24, 7 * f.nama.length), lh = 14;
      const lx = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? (x1 >= x0 ? x0 + 8 : x0 - 8 - lw) : x0 + 6;
      const ly = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? y0 - lh - 3 : (y1 >= y0 ? y0 + 6 : y0 - 6 - lh);
      lbl = `<bpmndi:BPMNLabel>${bounds(lx, ly, lw, lh)}</bpmndi:BPMNLabel>`;
    }
    const nm = f.nama ? ` name="${xmlEsc(f.nama)}"` : '';
    const poolA = leluhur(a, ['BPPool']) || (a.tipe === 'BPPool' ? a : null);
    const poolT = leluhur(t, ['BPPool']) || (t.tipe === 'BPPool' ? t : null);
    if (f.tipe === 'BPAssociation') {
      const id = nid(f, 'Association');
      asosiasi.push({ wadah: wadahDari(a), xml: `<bpmn:association id="${id}" sourceRef="${nid(a, 'Node')}" targetRef="${nid(t, 'Node')}" />` });
      di.push(`<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${wp}</bpmndi:BPMNEdge>`);
      continue;
    }
    const pesan = f.tipe === 'BPMessageFlow' || (poolA?.id || '') !== (poolT?.id || '') || a.tipe === 'BPPool' || t.tipe === 'BPPool';
    if (pesan) {
      const id = nid(f, 'MessageFlow');
      const src = nid(a, 'Node'), tgt = nid(t, 'Node');
      pesanXml.push(`<bpmn:messageFlow id="${id}"${nm} sourceRef="${src}" targetRef="${tgt}" />`);
      di.push(`<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${wp}${lbl}</bpmndi:BPMNEdge>`);
      ring.pesan++;
    } else {
      const id = nid(f, 'Flow');
      const src = nid(a, 'Node'), tgt = nid(t, 'Node');
      if (!keluar.has(a.id)) keluar.set(a.id, []); keluar.get(a.id)!.push(id);
      if (!masuk.has(t.id)) masuk.set(t.id, []); masuk.get(t.id)!.push(id);
      // Wadah alur = wadah bersama terdekat (subproses bila keduanya di dalamnya).
      const wa = wadahDari(a), wt = wadahDari(t);
      alurXml.push({ wadah: wa === wt ? wa : (poolA?.id || ''), xml: `<bpmn:sequenceFlow id="${id}"${nm} sourceRef="${src}" targetRef="${tgt}" />` });
      di.push(`<bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${wp}${lbl}</bpmndi:BPMNEdge>`);
      ring.alur++;
    }
  }

  // Tulis simpul. Subproses ditulis sebagai elemen pembungkus anak-anaknya.
  const subProses = new Map<string, Bentuk>();
  for (const s of simpul) if (s.tipe === 'BPSubProcess') subProses.set(s.id, s);
  const ioRef = (s: Bentuk) =>
    (masuk.get(s.id) || []).map(i => `<bpmn:incoming>${i}</bpmn:incoming>`).join('') +
    (keluar.get(s.id) || []).map(i => `<bpmn:outgoing>${i}</bpmn:outgoing>`).join('');

  const elemenXml = new Map<string, string>(); // id VP → xml (tanpa anak subproses)
  for (const s of simpul) {
    const nm = s.nama ? ` name="${xmlEsc(s.nama)}"` : '';
    let tag = '', isi = ioRef(s);
    switch (s.tipe) {
      case 'BPTask': {
        tag = TIPE_TASK[subTipe(s.modelDef, 'taskType') || ''] || 'bpmn:task';
        ring.task++; break;
      }
      case 'BPSubProcess': tag = 'bpmn:subProcess'; ring.subProses++; break;
      case 'BPGateway': {
        const g = subTipe(s.modelDef, 'gatewayType') || '';
        tag = /AND|Parallel/i.test(g) ? 'bpmn:parallelGateway' : /OR$|Inclusive/i.test(g) && !/XOR/i.test(g) ? 'bpmn:inclusiveGateway'
          : /Complex/i.test(g) ? 'bpmn:complexGateway' : /EventBased/i.test(g) ? 'bpmn:eventBasedGateway' : 'bpmn:exclusiveGateway';
        ring.gateway++; break;
      }
      case 'BPStartEvent': case 'BPEndEvent': case 'BPIntermediateEvent': {
        const tr = subTipe(s.modelDef, 'trigger') || subTipe(s.modelDef, 'result') || '';
        const jenis = Object.keys(DEF_EVENT).find(k => tr.includes(k));
        tag = s.tipe === 'BPStartEvent' ? 'bpmn:startEvent' : s.tipe === 'BPEndEvent' ? 'bpmn:endEvent'
          : (/throw/i.test(s.modelDef) || /Result/.test(tr) ? 'bpmn:intermediateThrowEvent' : 'bpmn:intermediateCatchEvent');
        if (jenis) isi += `<bpmn:${DEF_EVENT[jenis]} id="${nid({ ...s, id: s.id + '#def' }, 'EventDef')}" />`;
        ring.event++; break;
      }
      case 'BPDataObject': tag = 'bpmn:dataObjectReference'; ring.lain++; break;
      case 'BPDataStore': tag = 'bpmn:dataStoreReference'; ring.lain++; break;
      case 'BPTextAnnotation': {
        const id = nid(s, 'TextAnnotation');
        elemenXml.set(s.id, `<bpmn:textAnnotation id="${id}"><bpmn:text>${xmlEsc(s.nama)}</bpmn:text></bpmn:textAnnotation>`);
        di.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">${bounds(s.ax, s.ay, s.w, s.h)}</bpmndi:BPMNShape>`);
        ring.lain++; continue;
      }
    }
    const idAkhir = nid(s, 'Node');
    if (s.tipe === 'BPDataObject') {
      // dataObjectReference wajib merujuk dataObject (tanpa itu bpmn-js gagal saat disunting).
      elemenXml.set(s.id, `<bpmn:dataObject id="${idAkhir}_obj" /><${tag} id="${idAkhir}"${nm} dataObjectRef="${idAkhir}_obj">${isi}</${tag}>`);
    } else elemenXml.set(s.id, `<${tag} id="${idAkhir}"${nm}>${isi}</${tag}>`);
    const tambahan = s.tipe === 'BPGateway' && tag === 'bpmn:exclusiveGateway' ? ' isMarkerVisible="true"' : '';
    const ekspansi = s.tipe === 'BPSubProcess' ? ` isExpanded="${simpul.some(c => c.induk === s.id)}"` : '';
    di.push(`<bpmndi:BPMNShape id="${idAkhir}_di" bpmnElement="${idAkhir}"${tambahan}${ekspansi}>${bounds(s.ax, s.ay, s.w, s.h)}${s.tipe === 'BPTask' || s.tipe === 'BPSubProcess' ? '' : labelDi(s)}</bpmndi:BPMNShape>`);
  }
  // Rakit wadah: subproses berisi anak (rekursif), pool → process.
  const isiWadah = (k: string): string => {
    const bagian: string[] = [];
    for (const s of simpul) {
      if (wadahDari(s) !== k) continue;
      let x = elemenXml.get(s.id) || '';
      if (s.tipe === 'BPSubProcess') {
        const dalam = isiWadah(s.id);
        x = x.replace(/<\/bpmn:subProcess>$/, dalam + '</bpmn:subProcess>');
      }
      bagian.push(x);
    }
    for (const a of alurXml) if (a.wadah === k) bagian.push(a.xml);
    for (const a of asosiasi) if (a.wadah === k) bagian.push(a.xml);
    return bagian.join('');
  };

  // Lajur (rekursif utk lajur bersarang).
  const laneSet = (indukId: string, pool: Bentuk, vert: boolean): string => {
    const lanes = shapes.filter(l => l.tipe === 'BPLane' && l.induk === indukId);
    if (!lanes.length) return '';
    return `<bpmn:laneSet id="${nid({ ...pool, id: indukId + '#ls' }, 'LaneSet')}">` + lanes.map(l => {
      const id = nid(l, 'Lane');
      ring.lane++;
      // Selaraskan dgn kepala pool bpmn-js (30px): lajur dimulai tepat setelah kepala pool.
      const KEPALA = 30;
      let { ax: x, ay: y, w, h } = l;
      if (l.induk === pool.id) {
        if (vert) { y = pool.ay + KEPALA; h = pool.h - KEPALA; } else { x = pool.ax + KEPALA; w = pool.w - KEPALA; }
      }
      di.push(`<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}" isHorizontal="${!vert}">${bounds(x, y, w, h)}</bpmndi:BPMNShape>`);
      const refs = simpul.filter(s => s.tipe !== 'BPTextAnnotation' && leluhur(s, ['BPLane'])?.id === l.id && !leluhur(s, ['BPSubProcess']))
        .map(s => `<bpmn:flowNodeRef>${idBaru.get(s.id)}</bpmn:flowNodeRef>`).join('');
      const anak = laneSet(l.id, pool, vert).replace('<bpmn:laneSet', '<bpmn:childLaneSet xsi:type="bpmn:tLaneSet"').replace(/<\/bpmn:laneSet>$/, '</bpmn:childLaneSet>');
      return `<bpmn:lane id="${id}" name="${xmlEsc(l.nama)}">${refs}${anak}</bpmn:lane>`;
    }).join('') + '</bpmn:laneSet>';
  };

  const prosesXml: string[] = [];
  const peserta: string[] = [];
  const defId = 'Definitions_' + Math.random().toString(36).slice(2, 9);
  for (const pool of pools) {
    const vert = vertikal(pool);
    const pid = nid(pool, 'Participant');
    const prid = nid({ ...pool, id: pool.id + '#proc' }, 'Process');
    ring.pool++;
    peserta.push(`<bpmn:participant id="${pid}" name="${xmlEsc(pool.nama)}" processRef="${prid}" />`);
    di.unshift(`<bpmndi:BPMNShape id="${pid}_di" bpmnElement="${pid}" isHorizontal="${!vert}">${bounds(pool.ax, pool.ay, pool.w, pool.h)}</bpmndi:BPMNShape>`);
    prosesXml.push(`<bpmn:process id="${prid}" isExecutable="false">${laneSet(pool.id, pool, vert)}${isiWadah(pool.id)}</bpmn:process>`);
  }
  // Elemen di luar pool.
  const lepas = isiWadah('');
  let planeRef: string;
  if (pools.length) {
    const colId = 'Collaboration_' + Math.random().toString(36).slice(2, 9);
    if (lepas) {
      const prid = 'Process_lepas_' + Math.random().toString(36).slice(2, 6);
      prosesXml.push(`<bpmn:process id="${prid}" isExecutable="false">${lepas}</bpmn:process>`);
      ring.dilewati.push('Sebagian elemen berada di luar Pool (dimuat tanpa Pool).');
    }
    prosesXml.unshift(`<bpmn:collaboration id="${colId}">${peserta.join('')}${pesanXml.join('')}</bpmn:collaboration>`);
    planeRef = colId;
  } else {
    const prid = 'Process_' + Math.random().toString(36).slice(2, 9);
    prosesXml.push(`<bpmn:process id="${prid}" isExecutable="false">${lepas}</bpmn:process>`);
    planeRef = prid;
  }

  for (const [k, n] of lewati) ring.dilewati.push(`${k}: ${n}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="${defId}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="SIMPEL (impor Visual Paradigm)" exporterVersion="1.0">
${prosesXml.join('\n')}
<bpmndi:BPMNDiagram id="BPMNDiagram_${diagramId.replace(/[^A-Za-z0-9]/g, '')}"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${planeRef}">${di.join('')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  return { xml, ringkasan: ring };
}

const DIDUKUNG = new Set(['BPPool', 'BPLane', 'BPTask', 'BPSubProcess', 'BPGateway', 'BPStartEvent', 'BPEndEvent',
  'BPIntermediateEvent', 'BPSequenceFlow', 'BPMessageFlow', 'BPDataObject', 'BPDataStore', 'BPTextAnnotation', 'BPAssociation']);

export async function imporBpmnDariVpp(buf: ArrayBuffer): Promise<HasilImporBpmn> {
  const db = bacaSqlite(buf);
  const diagrams = db.tabel('DIAGRAM').filter(d => teks(d.DIAGRAM_TYPE) === 'BusinessProcessDiagram');
  if (!diagrams.length) throw new Error('Tidak ditemukan diagram Proses Bisnis (BPMN) di dalam proyek ini.');
  const model = new Map<string, { nama: string; def: string }>();
  for (const m of db.tabel('MODEL_ELEMENT')) model.set(teks(m.ID), { nama: teks(m.NAME), def: teks(m.DEFINITION) });
  const semua = db.tabel('DIAGRAM_ELEMENT');
  const proyek = db.tabel('PROJECT_INFO')[0];

  // Diagram isi Sub-Proses (DIAGRAM.PARENT_MODEL_ID = model Sub-Proses) muncul sebagai
  // pilihan tersendiri; diagram induknya diberi catatan agar diimpor terpisah.
  const namaModel = (id: string) => model.get(id)?.nama || '';
  const anakDari = new Map<string, string[]>();
  for (const d of diagrams) {
    const pm = teks(d.PARENT_MODEL_ID);
    if (pm && model.has(pm)) { if (!anakDari.has(pm)) anakDari.set(pm, []); anakDari.get(pm)!.push(teks(d.NAME)); }
  }

  const hasil: DiagramImpor[] = [];
  for (const d of diagrams) {
    const did = teks(d.ID);
    const dilewati = new Map<string, number>();
    const shapes: Bentuk[] = [];
    for (const r of semua) {
      if (teks(r.DIAGRAM_ID) !== did) continue;
      const tipe = teks(r.SHAPE_TYPE);
      if (!DIDUKUNG.has(tipe)) { dilewati.set(tipe, (dilewati.get(tipe) || 0) + 1); continue; }
      const def = teks(r.DEFINITION);
      const mid = teks(r.MODEL_ELEMENT_ID) || null;
      const m = mid ? model.get(mid) : undefined;
      const namaDef = def.match(/^[^:]*:"([\s\S]*?)":\w+ \{/);
      const ptsRaw = def.match(/_points="([^"]*)"/);
      shapes.push({
        id: teks(r.ID), tipe, modelId: mid,
        induk: rujukan(def, '_parent') || teks(r.PARENT_ID) || null,
        x: angka(def, 'x') || 0, y: angka(def, 'y') || 0, w: angka(def, 'width') || 0, h: angka(def, 'height') || 0,
        ax: 0, ay: 0,
        nama: (m?.nama || (namaDef ? namaDef[1] : '')).trim(), def, modelDef: m?.def || '',
        orientasi: angka(def, 'orientation'), cap: keterangan(def),
        dari: rujukan(def, '_fromShape'), ke: rujukan(def, '_toShape'),
        titik: ptsRaw ? ptsRaw[1].split(';').filter(Boolean).map(p => p.split(',').map(Number) as [number, number]) : undefined,
      });
    }
    if (!shapes.length) continue;
    const { xml, ringkasan } = konversiDiagram(did, shapes);
    for (const [k, n] of dilewati) ringkasan.dilewati.push(`${k.replace(/^BP/, '')} (belum didukung): ${n}`);
    for (const s of shapes) {
      if (s.tipe === 'BPSubProcess' && s.modelId && anakDari.has(s.modelId)) {
        ringkasan.dilewati.push(`Isi Sub-Proses "${s.nama}" ada di diagram tersendiri — tidak ikut; impor diagram tsb secara terpisah.`);
      }
    }
    const pm = teks(d.PARENT_MODEL_ID);
    const induk = pm && model.get(pm)?.def.includes(':BPSubProcess {') ? namaModel(pm) : '';
    hasil.push({ id: did, nama: (teks(d.NAME) || 'Proses Bisnis') + (induk && induk !== teks(d.NAME) ? ` (isi Sub-Proses ${induk})` : ''), xml, ringkasan });
  }
  if (!hasil.length) throw new Error('Diagram Proses Bisnis di proyek ini kosong.');
  return { namaProyek: proyek ? teks(proyek.NAME) : '', diagram: hasil };
}
