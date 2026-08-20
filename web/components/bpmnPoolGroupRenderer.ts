// Custom renderer: menggambar bpmn:Group sebagai Pool/Swimlane, lengkap dengan Lane.
//
// Latar belakang: bpmn:Participant (Pool) & bpmn:Lane TIDAK boleh berada di dalam
// bpmn:SubProcess (dilarang standar BPMN & aturan bpmn-js). Satu-satunya container
// yang sah bersarang di SubProcess dan ter-serialisasi bersih adalah bpmn:Group.
//
// Model:
//   • POOL  = bpmn:Group yang TIDAK berada di dalam Group lain.
//   • LANE  = bpmn:Group yang berada (secara geometri) di dalam sebuah Pool.
// Deteksi Pool vs Lane memakai containment geometri (posisi/ukuran) sehingga tetap
// benar setelah simpan/muat — bpmn:Group adalah artifact "flat" di XML (bukan nested),
// jadi kita tidak bisa mengandalkan parent tree yang hilang saat reload.
//
// Orientasi (dibaca dari DI isHorizontal, fallback rasio dimensi):
//   • Horizontal → pita judul Pool di KIRI, Lane = pita mendatar bertumpuk.
//   • Vertikal   → pita judul Pool di ATAS, Lane = kolom bertumpuk.
//
// Nama Pool/Lane disimpan di categoryValueRef (round-trip). Renderer didaftarkan di
// editor DAN viewer read-only agar tampil sama di mode lihat.

import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getLabel } from 'bpmn-js/lib/util/LabelUtil';
import { create as svgCreate, append as svgAppend } from 'tiny-svg';

const RENDER_PRIORITY = 1500; // > default BpmnRenderer (1000)
const BAND = 28;              // lebar/tinggi pita judul Pool (px)
const LANE_BAND = 22;         // lebar/tinggi pita label Lane (px)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type El = any;

// Samakan dengan gaya pool (bpmn:Participant) proses utama: warna "black" bawaan
// bpmn-js adalah hsl(225,10%,15%) dengan tebal garis 1.5 (lihat BpmnRenderer).
const BPMN_BLACK = 'hsl(225, 10%, 15%)';
const POOL_STROKE = BPMN_BLACK;
const LANE_STROKE = BPMN_BLACK;
const FONT_FAMILY = "'URW Bookman', 'Bookman Old Style', Bookman, Georgia, serif";

// Apakah orientasi elemen vertikal (dibaca dari DI, fallback rasio dimensi).
function isVertical(el: El): boolean {
  const isH = el?.di?.isHorizontal;
  return isH === false || (isH == null && (el.height || 0) > (el.width || 0));
}

// Warna kustom hasil "Warnai Elemen" (modeling.setColor) tersimpan di DI.
function diFill(el: El): string | undefined {
  const di = el?.di;
  if (!di) return undefined;
  try { return di.get('color:background-color') || di.get('bioc:fill') || undefined; } catch { return undefined; }
}
function diStroke(el: El): string | undefined {
  const di = el?.di;
  if (!di) return undefined;
  try { return di.get('color:border-color') || di.get('bioc:stroke') || undefined; } catch { return undefined; }
}

class PoolGroupRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'elementRegistry'];

  private _elementRegistry: El;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(eventBus: any, elementRegistry: El) {
    super(eventBus, RENDER_PRIORITY);
    this._elementRegistry = elementRegistry;
  }

  canRender(element: El): boolean {
    return is(element, 'bpmn:Group') ||
      (!!element.labelTarget && is(element.labelTarget, 'bpmn:Group'));
  }

  // Pool terkecil yang membungkus (secara geometri) elemen ini; null bila elemen
  // adalah Pool. Hanya mempertimbangkan Group dalam FLOW-CONTAINER (proses/sub-proses
  // non-Group terdekat) yang SAMA — registry memuat semua plane dengan koordinat yang
  // tumpang-tindih; sub-proses expanded berbagi root dgn kanvas utama, jadi pool di
  // sub-proses harus dibedakan lewat flow-container-nya, bukan sekadar root/geometri.
  private _containerPool(element: El): El | null {
    const reg = this._elementRegistry;
    if (element.width == null || element.x == null) return null;
    const flowContainer = (el: { parent?: { type?: string } } | undefined): unknown => {
      let t = el?.parent as { type?: string; parent?: unknown } | undefined;
      while (t && t.type === 'bpmn:Group') t = t.parent as { type?: string; parent?: unknown };
      return t || null;
    };
    const elFC = flowContainer(element as unknown as { parent?: { type?: string } });
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const area = element.width * element.height;
    let best: El | null = null;
    let bestArea = Infinity;
    reg.forEach((other: El) => {
      if (other === element || !is(other, 'bpmn:Group')) return;
      if (other.width == null || other.x == null) return;
      if (flowContainer(other as unknown as { parent?: { type?: string } }) !== elFC) return;
      const oa = other.width * other.height;
      if (oa <= area) return;
      if (cx > other.x && cx < other.x + other.width && cy > other.y && cy < other.y + other.height) {
        if (oa < bestArea) { best = other; bestArea = oa; }
      }
    });
    return best;
  }

  drawShape(parentGfx: SVGElement, element: El): SVGElement {
    // Sembunyikan label eksternal Group — nama digambar di pita.
    if (element.labelTarget) {
      return svgCreate('g');
    }

    const pool = this._containerPool(element);
    if (pool) {
      return this._drawLane(parentGfx, element, pool);
    }
    return this._drawPool(parentGfx, element);
  }

  // Jumlah maksimum baris label di antara lane-lane sebuah pool (biar pita header
  // semua lane sejajar rapi meski hanya sebagian lane yang labelnya multi-baris).
  private _maxLaneLines(pool: El): number {
    const reg = this._elementRegistry;
    let max = 1;
    reg.forEach((o: El) => {
      if (o === pool || !is(o, 'bpmn:Group')) return;
      if (this._containerPool(o) === pool) {
        const n = lineCount(getLabel(o));
        if (n > max) max = n;
      }
    });
    return max;
  }

  private _drawPool(parentGfx: SVGElement, element: El): SVGElement {
    const w = element.width || 300;
    const h = element.height || 160;
    const vertical = isVertical(element);
    const name = getLabel(element) || '';
    const stroke = diStroke(element) || POOL_STROKE;
    const bandFill = diFill(element) || undefined; // hanya diisi bila diwarnai pengguna
    // Pita tumbuh mengikuti jumlah baris judul agar tidak menabrak garis pemisah.
    const band = bandSize(BAND, lineCount(name), 12);

    // Interior TRANSPARAN (fill:none) — dulu putih 0.2 yang, bila pool salah lapisan
    // (tergambar di atas), meredupkan elemen di dalamnya jadi abu-abu. Transparan =
    // elemen selalu terlihat penuh, sekaligus tampilan pool BPMN standar.
    const outer = svgCreate('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: 'none', stroke, 'stroke-width': 1.5,
    });
    svgAppend(parentGfx, outer);

    if (vertical) {
      if (bandFill) appendRect(parentGfx, 0, 0, w, band, bandFill, stroke, 1.5);
      appendLine(parentGfx, 0, band, w, band, stroke, 1.5);
      if (name) appendText(parentGfx, name, w / 2, band / 2);
    } else {
      if (bandFill) appendRect(parentGfx, 0, 0, band, h, bandFill, stroke, 1.5);
      appendLine(parentGfx, band, 0, band, h, stroke, 1.5);
      if (name) appendText(parentGfx, name, band / 2, h / 2, -90);
    }
    return outer;
  }

  private _drawLane(parentGfx: SVGElement, element: El, pool: El): SVGElement {
    const vertical = isVertical(pool);
    const w = element.width || 200;
    const h = element.height || 80;
    const name = getLabel(element) || '';
    const stroke = diStroke(element) || LANE_STROKE;
    const bandFill = diFill(element) || undefined;
    // Pita seragam untuk semua lane pool ini = baris terbanyak di antara mereka.
    const band = bandSize(LANE_BAND, this._maxLaneLines(pool), 11);

    // Interior transparan (lihat _drawPool) — cegah elemen di dalam lane jadi abu-abu.
    const rect = svgCreate('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: 'none', stroke, 'stroke-width': 1.5,
    });
    svgAppend(parentGfx, rect);

    if (vertical) {
      // Lane = kolom → pita label di ATAS, teks mendatar
      if (bandFill) appendRect(parentGfx, 0, 0, w, band, bandFill, stroke, 1.5);
      appendLine(parentGfx, 0, band, w, band, stroke, 1.5);
      if (name) appendText(parentGfx, name, w / 2, band / 2, 0, BPMN_BLACK, 11);
    } else {
      // Lane = pita mendatar → pita label di KIRI, teks rotasi -90°
      if (bandFill) appendRect(parentGfx, 0, 0, band, h, bandFill, stroke, 1.5);
      appendLine(parentGfx, band, 0, band, h, stroke, 1.5);
      if (name) appendText(parentGfx, name, band / 2, h / 2, -90, BPMN_BLACK, 11);
    }
    return rect;
  }

  getShapePath(shape: El): string {
    const { x, y, width, height } = shape;
    return `M${x},${y} l${width},0 l0,${height} l${-width},0 z`;
  }
}

// Jumlah baris sebuah label (dipisah Enter/\n saat pengguna mengetik).
function lineCount(name: string | null | undefined): number {
  if (!name) return 1;
  return String(name).split(/\r?\n/).length;
}
// Tinggi/lebar pita header: base bila ≤1 baris; tumbuh mengikuti jumlah baris +
// padding agar garis pemisah tidak menabrak teks (bug header 2–3 baris).
function bandSize(base: number, lines: number, fontSize: number): number {
  if (lines <= 1) return base;
  return Math.round(Math.max(base, lines * fontSize * 1.25 + 10));
}

// helpers SVG //////////
function appendRect(gfx: SVGElement, x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number) {
  const attrs: Record<string, string | number> = { x, y, width: w, height: h, rx: 3, ry: 3, fill };
  if (stroke) { attrs.stroke = stroke; attrs['stroke-width'] = sw || 1; }
  const r = svgCreate('rect', attrs);
  svgAppend(gfx, r);
  return r;
}
function appendLine(gfx: SVGElement, x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number) {
  svgAppend(gfx, svgCreate('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw }));
}
function appendText(gfx: SVGElement, text: string, x: number, y: number, rotate = 0, fill = BPMN_BLACK, size = 12) {
  const attrs: Record<string, string | number> = {
    x, y, 'text-anchor': 'middle', fill,
    'font-size': `${size}px`, 'font-weight': '400',
    'font-family': FONT_FAMILY,
  };
  // dominant-baseline agar teks vertikal (mendatar) tetap center; tiny-svg attr ok
  attrs['dominant-baseline'] = 'central';
  if (rotate) attrs.transform = `rotate(${rotate} ${x} ${y})`;
  const t = svgCreate('text', attrs);
  // Dukung label multi-baris: setiap "\n" (dari Enter saat edit) jadi <tspan> baru,
  // ditumpuk vertikal & tetap ter-center terhadap titik (x, y).
  const lines = String(text).split(/\r?\n/);
  if (lines.length <= 1) {
    t.textContent = text;
  } else {
    const lh = size * 1.25;
    const startDy = -((lines.length - 1) / 2) * lh;
    lines.forEach((line, i) => {
      const ts = svgCreate('tspan', { x, dy: i === 0 ? startDy : lh });
      ts.textContent = line || ' ';
      svgAppend(t, ts);
    });
  }
  svgAppend(gfx, t);
  return t;
}

const poolGroupRendererModule = {
  __init__: ['poolGroupRenderer'],
  poolGroupRenderer: ['type', PoolGroupRenderer],
};

export default poolGroupRendererModule;
