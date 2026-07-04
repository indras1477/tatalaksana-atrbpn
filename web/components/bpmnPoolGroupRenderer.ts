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

// Apakah orientasi elemen vertikal (dibaca dari DI, fallback rasio dimensi).
function isVertical(el: El): boolean {
  const isH = el?.di?.isHorizontal;
  return isH === false || (isH == null && (el.height || 0) > (el.width || 0));
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
  // adalah Pool (tidak dibungkus Group lain).
  private _containerPool(element: El): El | null {
    const reg = this._elementRegistry;
    if (element.width == null || element.x == null) return null;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const area = element.width * element.height;
    let best: El | null = null;
    let bestArea = Infinity;
    reg.forEach((other: El) => {
      if (other === element || !is(other, 'bpmn:Group')) return;
      if (other.width == null || other.x == null) return;
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
      return this._drawLane(parentGfx, element, isVertical(pool));
    }
    return this._drawPool(parentGfx, element);
  }

  private _drawPool(parentGfx: SVGElement, element: El): SVGElement {
    const w = element.width || 300;
    const h = element.height || 160;
    const vertical = isVertical(element);
    const name = getLabel(element) || '';

    const outer = svgCreate('rect', {
      x: 0, y: 0, width: w, height: h, rx: 3, ry: 3,
      fill: '#ffffff', 'fill-opacity': 0.2, stroke: '#475569', 'stroke-width': 2,
    });
    svgAppend(parentGfx, outer);

    if (vertical) {
      appendRect(parentGfx, 0, 0, w, BAND, '#eef2ff', '#475569', 2);
      appendRect(parentGfx, 0, BAND - 4, w, 4, '#eef2ff');
      appendLine(parentGfx, 0, BAND, w, BAND, '#475569', 2);
      if (name) appendText(parentGfx, name, w / 2, BAND / 2);
    } else {
      appendRect(parentGfx, 0, 0, BAND, h, '#eef2ff', '#475569', 2);
      appendRect(parentGfx, BAND - 4, 0, 4, h, '#eef2ff');
      appendLine(parentGfx, BAND, 0, BAND, h, '#475569', 2);
      if (name) appendText(parentGfx, name, BAND / 2, h / 2, -90);
    }
    return outer;
  }

  private _drawLane(parentGfx: SVGElement, element: El, vertical: boolean): SVGElement {
    const w = element.width || 200;
    const h = element.height || 80;
    const name = getLabel(element) || '';

    // Kotak lane (garis tipis)
    const rect = svgCreate('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: '#ffffff', 'fill-opacity': 0.35, stroke: '#94a3b8', 'stroke-width': 1,
    });
    svgAppend(parentGfx, rect);

    if (vertical) {
      // Lane = kolom → pita label di ATAS, teks mendatar
      appendRect(parentGfx, 0, 0, w, LANE_BAND, '#f1f5f9', '#94a3b8', 1);
      appendLine(parentGfx, 0, LANE_BAND, w, LANE_BAND, '#94a3b8', 1);
      if (name) appendText(parentGfx, name, w / 2, LANE_BAND / 2, 0, '#334155', 11);
    } else {
      // Lane = pita mendatar → pita label di KIRI, teks rotasi -90°
      appendRect(parentGfx, 0, 0, LANE_BAND, h, '#f1f5f9', '#94a3b8', 1);
      appendLine(parentGfx, LANE_BAND, 0, LANE_BAND, h, '#94a3b8', 1);
      if (name) appendText(parentGfx, name, LANE_BAND / 2, h / 2, -90, '#334155', 11);
    }
    return rect;
  }

  getShapePath(shape: El): string {
    const { x, y, width, height } = shape;
    return `M${x},${y} l${width},0 l0,${height} l${-width},0 z`;
  }
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
function appendText(gfx: SVGElement, text: string, x: number, y: number, rotate = 0, fill = '#1e293b', size = 12) {
  const attrs: Record<string, string | number> = {
    x, y, 'text-anchor': 'middle', fill,
    'font-size': `${size}px`, 'font-weight': '700',
    'font-family': 'IBM Plex Sans, Arial, sans-serif',
  };
  // dominant-baseline agar teks vertikal (mendatar) tetap center; tiny-svg attr ok
  attrs['dominant-baseline'] = 'central';
  if (rotate) attrs.transform = `rotate(${rotate} ${x} ${y})`;
  const t = svgCreate('text', attrs);
  t.textContent = text;
  svgAppend(gfx, t);
  return t;
}

const poolGroupRendererModule = {
  __init__: ['poolGroupRenderer'],
  poolGroupRenderer: ['type', PoolGroupRenderer],
};

export default poolGroupRendererModule;
