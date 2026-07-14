"use client";
import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { Undo2, Redo2, ChevronRight, Save, LayoutGrid, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import OrderingProvider from 'diagram-js/lib/features/ordering/OrderingProvider';
import poolGroupRendererModule from './bpmnPoolGroupRenderer';
import { enableTouchInteraction } from './bpmnTouch';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js/dist/assets/bpmn-js.css';

// Font seluruh dokumen BPMN (kanvas + ekspor SVG/PDF).
const BPMN_FONT = "'Bookman Old Style', 'URW Bookman', Bookman, Georgia, serif";

// === XML REPAIR ===
// Fixes BPMN XML corrupted by placing a Pool (bpmn:Participant) inside a SubProcess.
// bpmn-js serializes Pool elements into a separate top-level bpmn:process — either an
// orphaned one (not in any Collaboration) or one properly referenced by a Participant.
// Either way, on import bpmn-js tries updateSemanticParent to move elements into the
// SubProcess plane, but SubProcess.flowElements is undefined → TypeError.
// Fix: for EVERY bpmn:process (regardless of Collaboration membership), if its elements
// appear in a SubProcess plane, move them into that SubProcess's flowElements.
function repairBpmnXml(xml: string): string {
  const cleaned = xml.replace(/<!--\s*sopext:subprocess-pools[\s\S]*?-->/g, '');

  if (typeof DOMParser === 'undefined') {
    return cleaned.replace(/<bpmndi:BPMNShape[^>]*>\s*<dc:Bounds\s*\/>\s*<\/bpmndi:BPMNShape>\s*/g, '');
  }

  const BPMN  = 'http://www.omg.org/spec/BPMN/20100524/MODEL';
  const BPMNDI = 'http://www.omg.org/spec/BPMN/20100524/DI';
  const DC     = 'http://www.omg.org/spec/DD/20100524/DC';

  const doc = new DOMParser().parseFromString(cleaned, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return cleaned.replace(/<bpmndi:BPMNShape[^>]*>\s*<dc:Bounds\s*\/>\s*<\/bpmndi:BPMNShape>\s*/g, '');
  }

  const defs = doc.documentElement;

  // Remove BPMNShape with empty Bounds (Pool placed inside SubProcess plane gets no position)
  for (const shape of Array.from(defs.getElementsByTagNameNS(BPMNDI, 'BPMNShape'))) {
    const bounds = shape.getElementsByTagNameNS(DC, 'Bounds')[0];
    if (!bounds || !bounds.hasAttribute('x')) shape.parentElement?.removeChild(shape);
  }

  // Map direct-child element IDs → their parent bpmn:process.
  // NOTE: getElementsByTagNameNS(BPMN, 'process') finds <bpmn:process> only (not
  // <bpmn:subProcess> — different tag name), so we only see top-level process elements.
  // proc.children (direct children) avoids descending into nested subProcess elements.
  const elToProc = new Map<string, Element>();
  for (const proc of Array.from(defs.getElementsByTagNameNS(BPMN, 'process'))) {
    for (const child of Array.from(proc.children)) {
      const id = child.getAttribute('id');
      if (id) elToProc.set(id, proc);
    }
  }

  if (elToProc.size > 0) {
    for (const sp of Array.from(defs.getElementsByTagNameNS(BPMN, 'subProcess'))) {
      const spId = sp.getAttribute('id');
      if (!spId) continue;

      // Find the BPMNPlane for this SubProcess
      let plane: Element | null = null;
      for (const p of Array.from(defs.getElementsByTagNameNS(BPMNDI, 'BPMNPlane'))) {
        if (p.getAttribute('bpmnElement') === spId) { plane = p; break; }
      }
      if (!plane) continue;

      // IDs already present as SubProcess flowElements
      const spChildIds = new Set<string>();
      for (const child of Array.from(sp.children)) {
        const id = child.getAttribute('id');
        if (id) spChildIds.add(id);
      }

      // Find top-level processes whose direct-child elements appear in this plane
      // but are not already SubProcess flowElements
      const procsToMerge = new Set<Element>();
      for (const shape of Array.from(plane.getElementsByTagNameNS(BPMNDI, 'BPMNShape'))) {
        const bpmnEl = shape.getAttribute('bpmnElement');
        if (!bpmnEl || spChildIds.has(bpmnEl)) continue;
        const proc = elToProc.get(bpmnEl);
        if (proc) procsToMerge.add(proc);
      }

      // Move ALL children from those processes into this SubProcess
      for (const proc of procsToMerge) {
        for (const child of Array.from(proc.children)) {
          if (child.parentElement === proc) sp.appendChild(child);
        }
      }

      // Remove now-empty processes and their Participants
      for (const proc of procsToMerge) {
        if (proc.children.length > 0) continue;
        const procId = proc.getAttribute('id') || '';
        for (const p of Array.from(defs.getElementsByTagNameNS(BPMN, 'participant'))) {
          if (p.getAttribute('processRef') === procId) p.parentElement?.removeChild(p);
        }
        defs.removeChild(proc);
      }
    }
  }

  return new XMLSerializer().serializeToString(doc);
}

// === INTERFACES ===
interface BpmnElement {
  id: string;
  type?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  isFrame?: boolean;
  businessObject: { name?: string; id: string; $parent?: BpmnElement; };
}

interface BpmnPalette { registerProvider: (priorityOrProvider: number | CustomPaletteProvider, provider?: CustomPaletteProvider) => void; }
interface BpmnCreate { start: (event: React.DragEvent | MouseEvent | React.MouseEvent, shape: BpmnElement) => void; }
interface BpmnElementFactory {
  createShape: (descriptor: Record<string, unknown>) => BpmnElement;
  createParticipantShape: (attrs?: { isExpanded?: boolean; di?: { isHorizontal?: boolean } }) => BpmnElement;
}
interface ElementPickerItem {
  type: string; icon: string; label: string;
  isExpanded?: boolean; eventDefinitionType?: string; triggeredByEvent?: boolean;
  width?: number; height?: number;
}
interface BpmnEventBus { on: (event: string, callback: (event: { element: BpmnElement }) => void) => void; }

interface BpmnCommandStack {
  undo: () => void; redo: () => void;
  canUndo: () => boolean; canRedo: () => boolean;
  clear: () => void;
}

interface BpmnShapeElement extends BpmnElement {
  x: number; y: number; width: number; height: number;
  parent?: BpmnElement; di?: { isHorizontal?: boolean };
}
interface BpmnElementRegistry {
  forEach: (fn: (el: BpmnShapeElement) => void) => void;
  filter: (fn: (el: BpmnShapeElement) => boolean) => BpmnShapeElement[];
  get: (id: string) => BpmnShapeElement | undefined;
}
interface BpmnCanvas {
  zoom: (scale: string | number, center?: boolean) => void;
  resized: () => void;
  setRootElement: (element: BpmnElement) => void;
  getRootElement: () => BpmnElement;
  findRoot?: (id: string) => BpmnElement | undefined;
}

interface BpmnModeling {
  createShape: (shape: BpmnElement, position: { x: number; y: number }, target: BpmnElement, hints?: unknown) => BpmnElement;
  updateLabel: (element: BpmnElement, newLabel: string) => void;
  resizeShape: (shape: BpmnElement, newBounds: { x: number; y: number; width: number; height: number }) => void;
  removeElements: (elements: BpmnElement[]) => void;
}

interface BpmnContextPad {
  registerProvider: (priority: number, provider: CustomContextPadProvider) => void;
  _current: { html: HTMLElement } | null;
  getPad: (element: BpmnElement) => { html: HTMLElement };
}

interface BpmnPopupMenu {
  open: (element: BpmnElement, menuId: string, position: { x: number; y: number; cursor?: { x: number; y: number } }, options?: unknown) => void;
  isEmpty: (element: BpmnElement, menuId: string) => boolean;
}

interface BreadcrumbItem { id: string; name: string; element: BpmnElement; }


// === 1. CUSTOM PALETTE — tambahan entri (pool vertikal, area proses, layanan ATR) ===
type PaletteEntries = Record<string, unknown>;

class CustomPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory'];

  private _create: BpmnCreate;
  private _elementFactory: BpmnElementFactory;

  constructor(palette: BpmnPalette, create: BpmnCreate, elementFactory: BpmnElementFactory) {
    this._create = create;
    this._elementFactory = elementFactory;
    // Priority 500 < default 1000, sehingga provider ini dijalankan SETELAH
    // default bpmn-js PaletteProvider — kita bisa hapus/tambah entries-nya
    palette.registerProvider(500, this);
  }

  // Mengembalikan fungsi agar bisa hapus entry default bawaan bpmn-js
  getPaletteEntries(): (entries: PaletteEntries) => PaletteEntries {
    const create = this._create;
    const elementFactory = this._elementFactory;

    return function(entries: PaletteEntries) {
      // Tetap pertahankan create.participant-expanded (Pool horizontal bawaan bpmn-js)

      // Layanan ATR/BPN (UserTask)
      entries['create.atr-service'] = {
        group: 'activity',
        className: 'bpmn-icon-user-task',
        title: 'Tambah Layanan ATR/BPN',
        action: {
          dragstart: (event: React.DragEvent | MouseEvent) => {
            const shape = elementFactory.createShape({ type: 'bpmn:UserTask' });
            shape.businessObject.name = '';
            create.start(event, shape);
          },
          click: (event: React.MouseEvent) => {
            const shape = elementFactory.createShape({ type: 'bpmn:UserTask' });
            shape.businessObject.name = '';
            create.start(event, shape);
          }
        }
      };

      // Pool Vertikal
      entries['create.pool-vertical'] = {
        group: 'collaboration',
        className: 'bpmn-icon-participant',
        title: 'Pool/Participant Vertikal',
        action: {
          dragstart: (event: React.DragEvent | MouseEvent) => {
            const shape = elementFactory.createParticipantShape({ isExpanded: true, di: { isHorizontal: false } });
            create.start(event, shape);
          },
          click: (event: React.MouseEvent) => {
            const shape = elementFactory.createParticipantShape({ isExpanded: true, di: { isHorizontal: false } });
            create.start(event, shape);
          }
        }
      };

      // Group sudah ada di default, biarkan tetap

      return entries;
    };
  }
}

// === 2. CUSTOM CONTEXT PAD — tombol "..." untuk memilih/ganti elemen ===
class CustomContextPadProvider {
  static $inject = ['contextPad', 'popupMenu', 'modeling', 'elementFactory', 'canvas', 'elementRegistry'];

  private _contextPad: BpmnContextPad;
  private _popupMenu: BpmnPopupMenu;
  private _modeling: BpmnModeling;
  private _elementFactory: BpmnElementFactory;
  private _canvas: BpmnCanvas;
  private _elementRegistry: BpmnElementRegistry;

  constructor(contextPad: BpmnContextPad, popupMenu: BpmnPopupMenu, modeling: BpmnModeling, elementFactory: BpmnElementFactory, canvas: BpmnCanvas, elementRegistry: BpmnElementRegistry) {
    this._contextPad = contextPad;
    this._popupMenu = popupMenu;
    this._modeling = modeling;
    this._elementFactory = elementFactory;
    this._canvas = canvas;
    this._elementRegistry = elementRegistry;
    contextPad.registerProvider(500, this);
  }

  // Pool terkecil yang membungkus (geometri) elemen ini; null bila elemen adalah Pool.
  private _containerPool(element: BpmnShapeElement): BpmnShapeElement | null {
    const reg = this._elementRegistry;
    if (element.width == null || element.x == null) return null;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const area = element.width * element.height;
    let best: BpmnShapeElement | null = null;
    let bestArea = Infinity;
    reg.forEach((other) => {
      if (other === element || other.type !== 'bpmn:Group') return;
      if (other.width == null || other.x == null) return;
      const oa = other.width * other.height;
      if (oa <= area) return;
      if (cx > other.x && cx < other.x + other.width && cy > other.y && cy < other.y + other.height) {
        if (oa < bestArea) { best = other; bestArea = oa; }
      }
    });
    return best;
  }

  // Tambah Lane ke sebuah Pool (bpmn:Group). Lane = bpmn:Group anak yang membagi
  // area isi Pool. Menata ulang semua lane agar terbagi rata. Round-trip via geometri.
  private _addLane(pool: BpmnShapeElement) {
    const reg = this._elementRegistry;
    const modeling = this._modeling;
    const ef = this._elementFactory;
    const isH = (pool as BpmnShapeElement & { di?: { isHorizontal?: boolean } }).di?.isHorizontal;
    const vertical = isH === false || (isH == null && pool.height > pool.width);

    // Area isi (di luar pita judul Pool).
    const cx0 = vertical ? pool.x : pool.x + 28;
    const cy0 = vertical ? pool.y + 28 : pool.y;
    const cw = vertical ? pool.width : pool.width - 28;
    const ch = vertical ? pool.height - 28 : pool.height;

    // Lane yang sudah ada = Group yang berada di dalam Pool.
    const lanes = reg.filter((el) =>
      el.type === 'bpmn:Group' && el !== pool && this._containerPool(el) === pool
    ).sort((a, b) => (vertical ? a.x - b.x : a.y - b.y));

    const target = lanes.length === 0 ? 2 : lanes.length + 1;

    for (let i = 0; i < target; i++) {
      const bounds = vertical
        ? { x: Math.round(cx0 + (i * cw) / target), y: cy0, width: Math.round(cw / target), height: ch }
        : { x: cx0, y: Math.round(cy0 + (i * ch) / target), width: cw, height: Math.round(ch / target) };
      if (i < lanes.length) {
        modeling.resizeShape(lanes[i] as unknown as BpmnElement, bounds);
      } else {
        const lane = ef.createShape({ type: 'bpmn:Group' });
        lane.isFrame = false;
        lane.width = bounds.width;
        lane.height = bounds.height;
        modeling.createShape(lane, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, pool as unknown as BpmnElement);
        modeling.updateLabel(lane, `Lane ${i + 1}`);
      }
    }
  }

  // Tambah Pool/Swimlane (bpmn:Group) DI DALAM sebuah SubProcess.
  // Menggunakan modeling.createShape dengan parent eksplisit — cara paling andal
  // untuk menempatkan container di dalam SubProcess (menghindari CreateParticipantBehavior
  // yang memaksa Pool ke root & mengubah proses menjadi Collaboration).
  private _addSwimlaneInside(element: BpmnShapeElement, horizontal = true) {
    const canvas = this._canvas;
    const ef = this._elementFactory;
    const modeling = this._modeling;

    // Buat Group dengan dimensi yang mencerminkan orientasi:
    // horizontal → lebih lebar dari tinggi (pita di kiri),
    // vertikal   → lebih tinggi dari lebar (pita di atas).
    // shape.added listener menetapkan di.isHorizontal dari dimensi ini agar
    // orientasi round-trip di XML dan renderer menggambar pita di sisi yang benar.

    // SubProcess collapsed punya plane tersendiri (id + '_plane'). Bila ada,
    // masuk (drill-in) ke plane itu lalu buat Group di sana.
    const planeRoot = canvas.findRoot ? canvas.findRoot(element.id + '_plane') : undefined;
    if (planeRoot) {
      canvas.setRootElement(planeRoot);
      const root = canvas.getRootElement();
      const group = ef.createShape({ type: 'bpmn:Group' });
    group.isFrame = false; // hit 'all' (bukan 'stroke') → Pool mudah diklik/dipilih
      if (horizontal) { group.width = 320; group.height = 180; }
      else            { group.width = 180; group.height = 320; }
      modeling.createShape(group, { x: 300, y: 240 }, root);
      modeling.updateLabel(group, 'Pool');
      return;
    }

    // SubProcess expanded — buat Group langsung di dalam shape-nya.
    const availW = Math.max(120, (element.width || 350) - 60);
    const availH = Math.max(80, (element.height || 200) - 70);
    const group = ef.createShape({ type: 'bpmn:Group' });
    group.isFrame = false; // hit 'all' (bukan 'stroke') → Pool mudah diklik/dipilih
    if (horizontal) {
      group.width = availW; group.height = availH;
    } else {
      // Vertikal: sempit & tinggi, tetap muat di dalam SubProcess.
      group.width = Math.max(90, Math.min(availW, Math.round(availH * 0.7)));
      group.height = availH;
    }
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    modeling.createShape(group, { x: cx, y: cy }, element);
    modeling.updateLabel(group, 'Pool');
  }

  getContextPadEntries(element: BpmnElement): Record<string, unknown> {
    const contextPad = this._contextPad;
    const popupMenu = this._popupMenu;

    if (element.type === 'label') return {};

    const entries: Record<string, unknown> = {};

    // "•••" (ganti tipe elemen) hanya bila menu replace tidak kosong.
    if (!popupMenu.isEmpty(element, 'bpmn-replace')) {
      entries['more-replace'] = {
        group: 'edit',
        html: '<div class="entry" title="Pilih / Ganti Tipe Elemen" style="display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;letter-spacing:1px;color:#374151;">•••</div>',
        action: {
          click: (event: MouseEvent) => {
            const pad = (contextPad._current && contextPad._current.html) || contextPad.getPad(element).html;
            const rect = pad.getBoundingClientRect();
            popupMenu.open(element, 'bpmn-replace', {
              x: rect.left,
              y: rect.bottom + 5,
              cursor: { x: event.x, y: event.y }
            }, {
              title: 'Ganti Tipe Elemen',
              width: 300,
              search: true
            });
          }
        }
      };
    }

    // Tombol pewarnaan elemen (ala bpmn-js-color-picker) — semua elemen non-label.
    entries['set-color'] = {
      group: 'edit',
      html: '<div class="entry" title="Warnai Elemen" style="display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="6.5" height="6.5" rx="1.5" fill="#BBDEFB" stroke="#1E88E5"/><rect x="8.5" y="1" width="6.5" height="6.5" rx="1.5" fill="#C8E6C9" stroke="#43A047"/><rect x="1" y="8.5" width="6.5" height="6.5" rx="1.5" fill="#FFE0B2" stroke="#FB8C00"/><rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1.5" fill="#FFCDD2" stroke="#E53935"/></svg></div>',
      action: {
        click: (event: MouseEvent) => {
          const pad = (contextPad._current && contextPad._current.html) || contextPad.getPad(element).html;
          const rect = pad.getBoundingClientRect();
          popupMenu.open(element, 'element-colors', {
            x: rect.left,
            y: rect.bottom + 5,
            cursor: { x: event.x, y: event.y }
          }, {
            title: 'Warnai Elemen',
            width: 200
          });
        }
      }
    };

    // Pada POOL (bpmn:Group yang bukan Lane): tombol tambah Lane.
    if (element.type === 'bpmn:Group' && !this._containerPool(element as BpmnShapeElement)) {
      entries['add-lane'] = {
        group: 'edit',
        className: 'bpmn-icon-lane-insert-below',
        title: 'Tambah Lane di dalam Pool',
        action: {
          click: () => this._addLane(element as BpmnShapeElement)
        }
      };
    }

    // Pada SubProcess: tombol tambah Pool/Swimlane di dalamnya (horizontal & vertikal).
    if (element.type === 'bpmn:SubProcess') {
      entries['add-swimlane'] = {
        group: 'edit',
        className: 'bpmn-icon-participant',
        title: 'Tambah Pool/Swimlane horizontal di dalam Sub-Proses',
        action: {
          click: () => this._addSwimlaneInside(element as BpmnShapeElement, true)
        }
      };
      entries['add-swimlane-vertical'] = {
        group: 'edit',
        // Ikon diputar 90° via CSS (lihat blok <style>) agar beda dari horizontal.
        className: 'bpmn-icon-participant ctx-pool-vertical',
        title: 'Tambah Pool/Swimlane vertikal di dalam Sub-Proses',
        action: {
          click: () => this._addSwimlaneInside(element as BpmnShapeElement, false)
        }
      };
    }

    return entries;
  }
}

// === 3. CUSTOM RULES ===
class CustomRules extends (RuleProvider as unknown as { new(eb: BpmnEventBus): RuleProvider }) {
  static $inject = ['eventBus'];

  constructor(eventBus: BpmnEventBus) {
    super(eventBus);
  }

  init() {
    this.addRule('shape.resize', 1500, (context: { shape: { type: string } }): boolean | void => {
      const shape = context.shape;
      if (
        shape && shape.type && (
          shape.type.includes('Task') ||
          shape.type === 'bpmn:SubProcess' ||
          shape.type === 'bpmn:CallActivity' ||
          shape.type === 'bpmn:Participant' ||
          shape.type === 'bpmn:Lane' ||
          shape.type === 'bpmn:Group'
        )
      ) {
        return true;
      }
    });

    // Pool/Lane kita adalah bpmn:Group dengan isFrame=false (hit 'all' agar mudah
    // diklik). Konsekuensinya Group jadi target drop, dan aturan bawaan menolak
    // Group sebagai induk → elemen tak bisa ditaruh "di dalam" Pool. Izinkan drop
    // elemen non-Group ke atas Group; GroupDropBehavior memindahkan induk sebenarnya
    // ke leluhur non-Group (plane/SubProcess).
    const allowDropOnGroup = (target?: { type?: string }, moved?: { type?: string }[]): boolean | void => {
      if (!target || target.type !== 'bpmn:Group') return;
      const list = (moved || []).filter(Boolean);
      if (!list.length || list.some(el => el.type === 'bpmn:Group' || el.type === 'bpmn:Participant')) return;
      return true;
    };
    this.addRule(['shape.create', 'elements.create'], 1500, (context: { target?: { type?: string }; shape?: { type?: string }; elements?: { type?: string }[] }) =>
      allowDropOnGroup(context.target, context.shape ? [context.shape] : context.elements));
    this.addRule('elements.move', 1500, (context: { target?: { type?: string }; shapes?: { type?: string }[] }) =>
      allowDropOnGroup(context.target, context.shapes));
  }
}

// === 3b. GROUP DROP BEHAVIOR ===
// Saat elemen dibuat/dipindah dengan target sebuah Pool/Lane (bpmn:Group), alihkan
// induknya ke leluhur non-Group terdekat (plane SubProcess / proses). Group adalah
// Artifact BPMN dan tidak boleh memiliki flowElements — tanpa pengalihan ini XML
// menjadi korup. Pembuatan Group itu sendiri (Pool/Lane via context-pad) dilewati
// agar lane tetap menjadi anak pool-nya.
type GroupDropEl = { type?: string; parent?: GroupDropEl } | undefined;
class GroupDropBehavior extends (CommandInterceptor as unknown as { new(eb: BpmnEventBus): CommandInterceptor }) {
  static $inject = ['eventBus', 'elementRegistry', 'modeling'];

  constructor(eventBus: BpmnEventBus, elementRegistry: BpmnElementRegistry, modeling: BpmnModeling) {
    super(eventBus);
    const self = this as unknown as {
      preExecute: (events: string[], priority: number, handler: (event: { context: Record<string, unknown> }) => void) => void;
      postExecute: (events: string[], handler: (event: { context: Record<string, unknown> }) => void) => void;
    };
    const nonGroupAncestor = (el: GroupDropEl): GroupDropEl => {
      let t = el;
      while (t && t.type === 'bpmn:Group') t = t.parent;
      return t;
    };
    const isGroup = (el: GroupDropEl) => !!el && el.type === 'bpmn:Group';

    self.preExecute(['shape.create', 'elements.create'], 1500, (event) => {
      const ctx = event.context as { shape?: GroupDropEl; elements?: GroupDropEl[]; parent?: GroupDropEl };
      const shapes = ctx.shape ? [ctx.shape] : (ctx.elements || []);
      if (shapes.some(isGroup)) return;
      if (isGroup(ctx.parent)) ctx.parent = nonGroupAncestor(ctx.parent);
    });

    self.preExecute(['elements.move', 'shape.move'], 1500, (event) => {
      const ctx = event.context as { shape?: GroupDropEl; shapes?: GroupDropEl[]; newParent?: GroupDropEl };
      const shapes = ctx.shapes || (ctx.shape ? [ctx.shape] : []);
      if (shapes.some(isGroup)) return;
      if (isGroup(ctx.newParent)) ctx.newParent = nonGroupAncestor(ctx.newParent);
    });

    // Pool/Lane digeser → bawa serta semua elemen yang secara GEOMETRI berada di
    // dalamnya. Diperlukan karena relasi induk-anak pool→lane/isi tidak round-trip
    // lewat XML (Group = artifact datar, posisi DI absolut) — setelah muat ulang,
    // menggeser pool akan meninggalkan lane & elemen di dalamnya. Prioritas tinggi
    // (5000) agar berjalan SEBELUM label/attach support menambahkan turunannya.
    // Sekaligus: LANE tidak boleh keluar dari pool-nya — delta dibatasi (clamp)
    // agar lane tetap berada di dalam area isi pool.
    const rootOf = (el: { parent?: unknown }): unknown => {
      let t: { parent?: unknown } | undefined = el;
      while (t && t.parent) t = t.parent as { parent?: unknown };
      return t;
    };
    // Pool terkecil yang membungkus (geometri) elemen ini pada plane yang sama.
    const containerPoolOf = (el: BpmnShapeElement): BpmnShapeElement | null => {
      if (el.x == null || el.width == null) return null;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const area = el.width * el.height;
      const elRoot = rootOf(el);
      let best: BpmnShapeElement | null = null;
      let bestArea = Infinity;
      elementRegistry.forEach((other) => {
        if (other === el || other.type !== 'bpmn:Group') return;
        if (other.x == null || other.width == null) return;
        const oa = other.width * other.height;
        if (oa <= area || oa >= bestArea || rootOf(other) !== elRoot) return;
        if (cx > other.x && cx < other.x + other.width && cy > other.y && cy < other.y + other.height) {
          best = other; bestArea = oa;
        }
      });
      return best;
    };

    self.preExecute(['elements.move'], 5000, (event) => {
      const ctx = event.context as { shapes?: (BpmnShapeElement & { waypoints?: unknown; labelTarget?: BpmnShapeElement })[]; delta?: { x: number; y: number } };
      let shapes = ctx.shapes || [];
      // Label eksternal Pool/Lane TIDAK boleh dipindah terpisah dari Group-nya —
      // buang dari set bila Group-nya tidak ikut (teks selalu menyatu dgn pool).
      const glued = shapes.filter(s => !(
        s.type === 'label' && s.labelTarget?.type === 'bpmn:Group' && !shapes.includes(s.labelTarget as never)
      ));
      if (glued.length !== shapes.length) { ctx.shapes = glued; shapes = glued; }
      if (!shapes.length) return;
      const movedGroups = shapes.filter(s => s.type === 'bpmn:Group');
      if (!movedGroups.length) return;
      // Zero-delta = pemindahan programatik (mis. re-parent lane→pool saat import)
      // — jangan ekspansi/clamp.
      if (!ctx.delta || (!ctx.delta.x && !ctx.delta.y)) return;
      const groupRoots = movedGroups.map(g => rootOf(g));
      const extra: BpmnShapeElement[] = [];
      elementRegistry.forEach((el) => {
        const cand = el as BpmnShapeElement & { waypoints?: unknown };
        if (shapes.includes(cand) || extra.includes(cand)) return;
        if (!cand.parent || cand.type === 'label' || cand.waypoints) return;
        if (cand.x == null || cand.width == null) return;
        const cx = cand.x + cand.width / 2;
        const cy = cand.y + cand.height / 2;
        const inside = movedGroups.some((g, i) =>
          g !== cand && rootOf(cand) === groupRoots[i] &&
          g.x != null && cx > g.x && cx < g.x + g.width && cy > g.y && cy < g.y + g.height
        );
        if (inside) extra.push(cand);
      });
      const allMoved = extra.length ? [...shapes, ...extra] : shapes;
      if (extra.length) ctx.shapes = allMoved;

      // Clamp: lane (Group di dalam pool yang TIDAK ikut dipindah) harus tetap
      // berada di dalam area isi pool-nya.
      if (!ctx.delta) return;
      let minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
      for (const g of movedGroups) {
        const pool = containerPoolOf(g);
        if (!pool || (allMoved as BpmnShapeElement[]).includes(pool)) continue;
        const isH = pool.di?.isHorizontal;
        const vertical = isH === false || (isH == null && pool.height > pool.width);
        const contentX = vertical ? pool.x : pool.x + 28;   // 28 = pita judul pool
        const contentY = vertical ? pool.y + 28 : pool.y;
        minDx = Math.max(minDx, contentX - g.x);
        maxDx = Math.min(maxDx, (pool.x + pool.width) - (g.x + g.width));
        minDy = Math.max(minDy, contentY - g.y);
        maxDy = Math.min(maxDy, (pool.y + pool.height) - (g.y + g.height));
      }
      if (minDx <= maxDx && isFinite(minDx + maxDx)) ctx.delta.x = Math.min(Math.max(ctx.delta.x, minDx), maxDx);
      if (minDy <= maxDy && isFinite(minDy + maxDy)) ctx.delta.y = Math.min(Math.max(ctx.delta.y, minDy), maxDy);
    });

    // POOL di-resize → lane di dalamnya otomatis mengikuti: di-tile ulang secara
    // proporsional memenuhi area isi pool (penuh pada sumbu silang, proporsi
    // masing-masing lane dipertahankan pada sumbu susun).
    self.postExecute(['shape.resize'], (event) => {
      const ctx = event.context as { shape?: BpmnShapeElement; oldBounds?: { x: number; y: number; width: number; height: number } };
      const shape = ctx.shape; const old = ctx.oldBounds;
      if (!shape || shape.type !== 'bpmn:Group' || !old) return;
      if (containerPoolOf(shape)) return; // yang di-resize lane → biarkan manual
      const isH = shape.di?.isHorizontal;
      const vertical = isH === false || (isH == null && shape.height > shape.width);
      const B = 28; // pita judul pool
      const oldC = vertical
        ? { x: old.x, y: old.y + B, w: old.width, h: old.height - B }
        : { x: old.x + B, y: old.y, w: old.width - B, h: old.height };
      const newC = vertical
        ? { x: shape.x, y: shape.y + B, w: shape.width, h: shape.height - B }
        : { x: shape.x + B, y: shape.y, w: shape.width - B, h: shape.height };
      if (oldC.w <= 0 || oldC.h <= 0 || newC.w <= 0 || newC.h <= 0) return;
      const shapeRoot = rootOf(shape);
      const lanes: BpmnShapeElement[] = [];
      elementRegistry.forEach((el) => {
        if (el.type !== 'bpmn:Group' || el === shape || el.x == null || el.width == null) return;
        if (rootOf(el) !== shapeRoot) return;
        if (el.width * el.height >= old.width * old.height) return;
        const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
        if (cx > old.x && cx < old.x + old.width && cy > old.y && cy < old.y + old.height) lanes.push(el);
      });
      for (const lane of lanes) {
        const nb = vertical
          ? { // lane = kolom → tiling pada sumbu X
              x: Math.round(newC.x + ((lane.x - oldC.x) / oldC.w) * newC.w),
              y: newC.y,
              width: Math.max(30, Math.round((lane.width / oldC.w) * newC.w)),
              height: newC.h,
            }
          : { // lane = baris → tiling pada sumbu Y
              x: newC.x,
              y: Math.round(newC.y + ((lane.y - oldC.y) / oldC.h) * newC.h),
              width: newC.w,
              height: Math.max(30, Math.round((lane.height / oldC.h) * newC.h)),
            };
        modeling.resizeShape(lane as unknown as BpmnElement, nb);
      }
    });
  }
}

// === 3b2. URUTAN GAMBAR GROUP ===
// Bawaan bpmn-js menaruh bpmn:Group di lapisan PALING ATAS (level 10) — pool kita
// menutupi elemen di dalamnya. Paksa Group ke indeks 0 (paling bawah, seperti
// bpmn:Participant level -2) sehingga elemen selalu tampil DI ATAS pool/lane.
// Berlaku saat create maupun move ('elements.move' dipecah jadi 'shape.move'
// per elemen oleh MoveHelper, yang di-hook OrderingProvider).
class GroupOrderingProvider extends (OrderingProvider as unknown as { new(eb: BpmnEventBus): { getOrdering: unknown } }) {
  static $inject = ['eventBus'];

  constructor(eventBus: BpmnEventBus) {
    super(eventBus);
    this.getOrdering = (element: BpmnElement, newParent: BpmnElement) => {
      if (element.type === 'bpmn:Group') return { parent: newParent, index: 0 };
      return null;
    };
  }
}

// === 3c. PEWARNAAN ELEMEN (ala bpmn-js-color-picker) ===
// Palet warna mengikuti referensi github bpmn-io/bpmn-js-color-picker.
const ELEMENT_COLORS: { label: string; fill?: string; stroke?: string }[] = [
  { label: 'Bawaan' },
  { label: 'Biru',    fill: '#BBDEFB', stroke: '#1E88E5' },
  { label: 'Hijau',   fill: '#C8E6C9', stroke: '#43A047' },
  { label: 'Kuning',  fill: '#FFF9C4', stroke: '#F9A825' },
  { label: 'Oranye',  fill: '#FFE0B2', stroke: '#FB8C00' },
  { label: 'Merah',   fill: '#FFCDD2', stroke: '#E53935' },
  { label: 'Ungu',    fill: '#E1BEE7', stroke: '#8E24AA' },
  { label: 'Abu-abu', fill: '#ECEFF1', stroke: '#546E7A' },
];

type BpmnModelingWithColor = BpmnModeling & { setColor: (elements: BpmnElement[], colors: { fill?: string; stroke?: string } | null) => void };
class ColorPickerProvider {
  static $inject = ['popupMenu', 'modeling'];

  private _modeling: BpmnModelingWithColor;

  constructor(popupMenu: BpmnPopupMenu & { registerProvider: (id: string, provider: unknown) => void }, modeling: BpmnModelingWithColor) {
    this._modeling = modeling;
    popupMenu.registerProvider('element-colors', this);
  }

  getPopupMenuEntries(target: BpmnElement | BpmnElement[]) {
    const elements = Array.isArray(target) ? target : [target];
    const modeling = this._modeling;
    const entries: Record<string, unknown> = {};
    for (const c of ELEMENT_COLORS) {
      entries[`color-${c.label.toLowerCase()}`] = {
        label: c.label,
        imageHtml: `<svg width="18" height="18" viewBox="0 0 18 18"><rect x="1.5" y="1.5" width="15" height="15" rx="3" fill="${c.fill || '#ffffff'}" stroke="${c.stroke || '#94a3b8'}" stroke-width="1.5"/></svg>`,
        action: () => {
          modeling.setColor(elements, c.fill ? { fill: c.fill, stroke: c.stroke } : { fill: undefined, stroke: undefined });
        },
      };
    }
    return entries;
  }
}

const ELEMENT_GROUPS: { label: string; items: ElementPickerItem[] }[] = [
  {
    label: 'Tugas',
    items: [
      { type: 'bpmn:Task',             icon: 'bpmn-icon-task',               label: 'Task' },
      { type: 'bpmn:UserTask',         icon: 'bpmn-icon-user-task',          label: 'User Task' },
      { type: 'bpmn:ManualTask',       icon: 'bpmn-icon-manual-task',        label: 'Manual Task' },
      { type: 'bpmn:ServiceTask',      icon: 'bpmn-icon-service-task',       label: 'Service Task' },
      { type: 'bpmn:ScriptTask',       icon: 'bpmn-icon-script-task',        label: 'Script Task' },
      { type: 'bpmn:SendTask',         icon: 'bpmn-icon-send-task',          label: 'Send Task' },
      { type: 'bpmn:ReceiveTask',      icon: 'bpmn-icon-receive-task',       label: 'Receive Task' },
      { type: 'bpmn:BusinessRuleTask', icon: 'bpmn-icon-business-rule-task', label: 'Business Rule' },
      { type: 'bpmn:CallActivity',     icon: 'bpmn-icon-call-activity',      label: 'Call Activity' },
    ],
  },
  {
    label: 'Sub-Proses',
    items: [
      { type: 'bpmn:SubProcess',      icon: 'bpmn-icon-subprocess-expanded',       label: 'Sub-Proses',      isExpanded: true },
      { type: 'bpmn:SubProcess',      icon: 'bpmn-icon-subprocess-collapsed',      label: 'Collapse',        isExpanded: false },
      { type: 'bpmn:Transaction',     icon: 'bpmn-icon-transaction',               label: 'Transaction',     isExpanded: true },
      { type: 'bpmn:SubProcess',      icon: 'bpmn-icon-event-subprocess-expanded', label: 'Event Sub-Proses',isExpanded: true, triggeredByEvent: true },
      { type: 'bpmn:AdHocSubProcess', icon: 'bpmn-icon-subprocess-expanded',       label: 'Ad-hoc',          isExpanded: true },
    ],
  },
  {
    label: 'Gateway',
    items: [
      { type: 'bpmn:ExclusiveGateway',  icon: 'bpmn-icon-gateway-xor',       label: 'Exclusive' },
      { type: 'bpmn:ParallelGateway',   icon: 'bpmn-icon-gateway-parallel',   label: 'Parallel' },
      { type: 'bpmn:InclusiveGateway',  icon: 'bpmn-icon-gateway-or',         label: 'Inclusive' },
      { type: 'bpmn:EventBasedGateway', icon: 'bpmn-icon-gateway-eventbased', label: 'Event-based' },
      { type: 'bpmn:ComplexGateway',    icon: 'bpmn-icon-gateway-complex',    label: 'Complex' },
    ],
  },
  {
    label: 'Start Event',
    items: [
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-none',        label: 'None' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-message',     label: 'Message',    eventDefinitionType: 'bpmn:MessageEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-timer',       label: 'Timer',      eventDefinitionType: 'bpmn:TimerEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-condition',   label: 'Conditional',eventDefinitionType: 'bpmn:ConditionalEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-signal',      label: 'Signal',     eventDefinitionType: 'bpmn:SignalEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-error',       label: 'Error',      eventDefinitionType: 'bpmn:ErrorEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-escalation',  label: 'Escalation', eventDefinitionType: 'bpmn:EscalationEventDefinition' },
      { type: 'bpmn:StartEvent', icon: 'bpmn-icon-start-event-compensation',label: 'Compensate', eventDefinitionType: 'bpmn:CompensateEventDefinition' },
    ],
  },
  {
    label: 'End Event',
    items: [
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-none',        label: 'None' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-message',     label: 'Message',    eventDefinitionType: 'bpmn:MessageEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-escalation',  label: 'Escalation', eventDefinitionType: 'bpmn:EscalationEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-error',       label: 'Error',      eventDefinitionType: 'bpmn:ErrorEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-cancel',      label: 'Cancel',     eventDefinitionType: 'bpmn:CancelEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-compensation',label: 'Compensate', eventDefinitionType: 'bpmn:CompensateEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-signal',      label: 'Signal',     eventDefinitionType: 'bpmn:SignalEventDefinition' },
      { type: 'bpmn:EndEvent', icon: 'bpmn-icon-end-event-terminate',   label: 'Terminate',  eventDefinitionType: 'bpmn:TerminateEventDefinition' },
    ],
  },
  {
    label: 'Intermediate Throw',
    items: [
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-none',              label: 'None' },
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-throw-message',     label: 'Message',    eventDefinitionType: 'bpmn:MessageEventDefinition' },
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-throw-escalation',  label: 'Escalation', eventDefinitionType: 'bpmn:EscalationEventDefinition' },
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-throw-compensation',label: 'Compensate', eventDefinitionType: 'bpmn:CompensateEventDefinition' },
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-throw-link',        label: 'Link',       eventDefinitionType: 'bpmn:LinkEventDefinition' },
      { type: 'bpmn:IntermediateThrowEvent', icon: 'bpmn-icon-intermediate-event-throw-signal',      label: 'Signal',     eventDefinitionType: 'bpmn:SignalEventDefinition' },
    ],
  },
  {
    label: 'Intermediate Catch',
    items: [
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-none',      label: 'None' },
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-message',   label: 'Message',    eventDefinitionType: 'bpmn:MessageEventDefinition' },
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-timer',     label: 'Timer',      eventDefinitionType: 'bpmn:TimerEventDefinition' },
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-condition', label: 'Conditional',eventDefinitionType: 'bpmn:ConditionalEventDefinition' },
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-link',      label: 'Link',       eventDefinitionType: 'bpmn:LinkEventDefinition' },
      { type: 'bpmn:IntermediateCatchEvent', icon: 'bpmn-icon-intermediate-event-catch-signal',    label: 'Signal',     eventDefinitionType: 'bpmn:SignalEventDefinition' },
    ],
  },
  {
    label: 'Data & Anotasi',
    items: [
      { type: 'bpmn:DataObjectReference', icon: 'bpmn-icon-data-object',    label: 'Data Object' },
      { type: 'bpmn:DataStoreReference',  icon: 'bpmn-icon-data-store',     label: 'Data Store' },
      { type: 'bpmn:TextAnnotation',      icon: 'bpmn-icon-text-annotation', label: 'Anotasi' },
      { type: 'bpmn:Group',               icon: 'bpmn-icon-group',           label: 'Group' },
    ],
  },
  {
    label: 'Swimlane (SubProcess)',
    items: [
      // Container Pool/Swimlane untuk di dalam SubProcess. Memakai bpmn:Group
      // (bukan bpmn:Participant) agar tidak dipaksa ke root oleh CreateParticipantBehavior
      // dan bisa ditempatkan bebas. Untuk cara paling andal, gunakan tombol
      // Pool/Swimlane pada context pad SubProcess. Dimensi menentukan orientasi:
      // lebar > tinggi → horizontal (pita kiri); tinggi > lebar → vertikal (pita atas).
      { type: 'bpmn:Group', icon: 'bpmn-icon-participant', label: 'Pool Horizontal', width: 320, height: 180 },
      { type: 'bpmn:Group', icon: 'bpmn-icon-participant', label: 'Pool Vertikal',   width: 180, height: 320 },
    ],
  },
];

const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export interface BpmnSelectedElement { id: string; type: string; name: string; parentType?: string }
export interface BpmnCanvasApi {
  // Buat sub-process BERSARANG di dalam elemen induk tertentu (mis. proses L3
  // di dalam kotak kegiatan pada kanvas L2). Mengembalikan id elemen baru.
  addNestedSubProcess: (parentElementId: string, name: string) => string | null;
  // Hapus elemen dari kanvas (mis. kotak proses L3 saat usulannya dihapus).
  removeElement: (elementId: string) => boolean;
  // Impor XML BPMN 2.0 (mis. buka file .bpmn lokal) — MENGGANTI diagram saat ini.
  importXml: (xml: string) => Promise<boolean>;
}

export default function BPMNModelerComponent({ xml, projectName, onSave, isViewOnly = false, onDirtyChange, onSelectionChange, registerSaveHandler, registerCanvasApi, toolbarExtra, onBeforeDelete }: { xml?: string, projectName?: string, onSave?: (xml: string, svg: string, subSvgs?: { id: string; name: string; svg: string; depth?: number; path?: string[] }[]) => void, isViewOnly?: boolean, onDirtyChange?: (isDirty: boolean) => void, onSelectionChange?: (el: BpmnSelectedElement | null) => void, registerSaveHandler?: (fn: () => Promise<void>) => void, registerCanvasApi?: (api: BpmnCanvasApi) => void, toolbarExtra?: React.ReactNode, onBeforeDelete?: (els: BpmnSelectedElement[]) => boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | NavigatedViewer | null>(null);
  const navStackRef = useRef<BreadcrumbItem[]>([]);
  // Ref agar closure di eventBus selalu gunakan callback terbaru
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; });
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });
  const onBeforeDeleteRef = useRef(onBeforeDelete);
  useEffect(() => { onBeforeDeleteRef.current = onBeforeDelete; });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [showElementPicker, setShowElementPicker] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const ModelerClass = isViewOnly ? NavigatedViewer : BpmnModeler;
    const modeler = new ModelerClass({
      container: containerRef.current,
      keyboard: isViewOnly ? undefined : { bindTo: window },
      // Seluruh teks diagram memakai Bookman Old Style (fallback URW Bookman/serif)
      // — ikut terbawa ke ekspor SVG/PDF karena font-family tertulis di SVG.
      textRenderer: {
        defaultStyle: { fontFamily: BPMN_FONT },
        externalStyle: { fontFamily: BPMN_FONT },
      },
      // poolGroupRendererModule: bpmn:Group digambar sebagai Pool/Swimlane — aktif
      // di mode edit MAUPUN view agar pool di dalam SubProcess tetap tampil saat dilihat.
      additionalModules: isViewOnly
        ? [poolGroupRendererModule]
        : [
            poolGroupRendererModule,
            {
              __init__: ['customPaletteProvider', 'customRules', 'customContextPadProvider', 'groupDropBehavior', 'colorPickerProvider', 'groupOrderingProvider'],
              customPaletteProvider: ['type', CustomPaletteProvider],
              customRules: ['type', CustomRules],
              customContextPadProvider: ['type', CustomContextPadProvider],
              groupDropBehavior: ['type', GroupDropBehavior],
              colorPickerProvider: ['type', ColorPickerProvider],
              groupOrderingProvider: ['type', GroupOrderingProvider]
            }
          ]
    });

    modelerRef.current = modeler;
    navStackRef.current = [];
    let isMounted = true;

    // Label Pool/Lane (bpmn:Group) multi-baris: Enter = baris baru, bukan menutup editor.
    // Default diagram-js: Enter (tanpa Shift) memanggil complete(). Listener fase-capture
    // ini menghentikan event SEBELUM sampai ke handler diagram-js, KHUSUS saat yang sedang
    // diedit adalah bpmn:Group — sehingga browser menyisipkan newline di contenteditable.
    // Elemen lain (Task, dsb.) tidak terpengaruh; Shift+Enter tetap berfungsi seperti biasa.
    const directEditing = modeler.get('directEditing', false) as
      | { isActive?: () => boolean; _active?: { element?: { type?: string } } }
      | null;
    const enterNewlineForGroup = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!directEditing || !directEditing.isActive?.()) return;
      if (directEditing._active?.element?.type === 'bpmn:Group') {
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', enterNewlineForGroup, true);

    const initCanvas = async () => {
      try {
        let xmlToLoad = (xml && xml.includes('bpmn:definitions')) ? xml : DEFAULT_XML;
        if (projectName && xmlToLoad.includes('id="Process_1"') && !xmlToLoad.includes('id="Process_1" name=')) {
           xmlToLoad = xmlToLoad.replace('id="Process_1"', `id="Process_1" name="${projectName}"`);
        }

        // Repair XML: move orphaned process elements into their SubProcess flowElements,
        // remove Pool shapes with no position, strip sopext comment.
        xmlToLoad = repairBpmnXml(xmlToLoad);

        await modeler.importXML(xmlToLoad);
        if (!isMounted) return;

        // CommandStack drain helper — fixes dangling _pushAction/_popAction pairs.
        // When commandStack.execute() throws, _popAction is never called, leaving
        // _currentExecution.actions with stale entries. This prevents elements.changed
        // from firing (it only fires when actions.length reaches 0), so subsequent
        // drag/resize operations snap back visually. Always draining after import
        // ensures a clean slate before the user starts interacting.
        // NavigatedViewer has no commandStack — guard with optional chaining so
        // this is a no-op in view mode instead of throwing TypeError.
        const cmdStack = modeler.get('commandStack') as BpmnCommandStack | undefined;
        const drainCmdStack = () => {
          if (!cmdStack) return;
          const internal = cmdStack as unknown as {
            _currentExecution: { actions: unknown[]; dirty: unknown[]; trigger: unknown };
          };
          const ex = internal._currentExecution;
          if (ex) { ex.actions.length = 0; ex.dirty.length = 0; ex.trigger = null; }
        };

        // Always drain then clear after import — ensures clean CommandStack regardless
        // of what happened during pool restoration or importXML internal processing.
        // clear() resets undo/redo history so users can't undo back to the blank state.
        // Both calls are no-ops for NavigatedViewer (no CommandStack).
        drainCmdStack();
        cmdStack?.clear();

        // ===== Helper struktur Pool/Group (dipakai re-parent & pin label) =====
        const registryAll = modeler.get('elementRegistry') as BpmnElementRegistry;
        const rootOfEl = (el: { parent?: unknown } | undefined): unknown => {
          let t: { parent?: unknown } | undefined = el;
          while (t && t.parent) t = t.parent as { parent?: unknown };
          return t;
        };
        // Group pembungkus terkecil (geometri, satu plane) — pool bagi sebuah lane.
        const enclosingGroup = (g: BpmnShapeElement): BpmnShapeElement | null => {
          if (g.x == null || g.width == null) return null;
          const cx = g.x + g.width / 2, cy = g.y + g.height / 2;
          const area = g.width * g.height, r = rootOfEl(g);
          let best: BpmnShapeElement | null = null; let bestArea = Infinity;
          registryAll.forEach((o) => {
            if (o === g || o.type !== 'bpmn:Group' || o.x == null || o.width == null) return;
            const oa = o.width * o.height;
            if (oa <= area || oa >= bestArea || rootOfEl(o) !== r) return;
            if (cx > o.x && cx < o.x + o.width && cy > o.y && cy < o.y + o.height) { best = o; bestArea = oa; }
          });
          return best;
        };
        const isVertGroup = (el: BpmnShapeElement) =>
          el?.di?.isHorizontal === false || (el?.di?.isHorizontal == null && (el.height || 0) > (el.width || 0));
        // Tempelkan label eksternal Group ke pita judul pool/lane-nya — teks menyatu
        // dengan pool, tidak "mengambang" bisa dipilih/dipindah terpisah.
        const pinGroupLabel = (label: BpmnShapeElement & { labelTarget?: BpmnShapeElement }) => {
          const target = label.labelTarget;
          if (!target || target.type !== 'bpmn:Group' || target.x == null) return;
          const pool = enclosingGroup(target);
          let cx: number, cy: number;
          if (!pool) { // target = POOL: pita 28px di kiri (horizontal) / atas (vertikal)
            if (isVertGroup(target)) { cx = target.x + target.width / 2; cy = target.y + 14; }
            else { cx = target.x + 14; cy = target.y + target.height / 2; }
          } else {     // target = LANE: pita 22px mengikuti orientasi pool
            if (isVertGroup(pool)) { cx = target.x + target.width / 2; cy = target.y + 11; }
            else { cx = target.x + 11; cy = target.y + target.height / 2; }
          }
          label.x = Math.round(cx - (label.width || 0) / 2);
          label.y = Math.round(cy - (label.height || 0) / 2);
        };

        // Turunkan Pool ke lapisan PALING BAWAH secara visual (DOM). Ordering saja
        // tidak cukup: BpmnOrderingProvider bawaan menganggap bpmn:Group level 10
        // (teratas) sehingga setiap elemen yang dibuat/digeser disisipkan DI BAWAH
        // pool lagi di pohon elemen. Di sini wrapper gfx tiap pool (Group yang
        // parent-nya bukan Group) dipindah ke posisi pertama container plane-nya —
        // elemen lain selalu tergambar di atas pool. Lane (anak pool) otomatis di
        // atas pool karena gfx-nya bersarang di container anak pool.
        const restackGroups = () => {
          try {
            const regG = registryAll as BpmnElementRegistry & { getGraphics: (el: unknown) => SVGElement | undefined };
            registryAll.forEach((el) => {
              if (el.type !== 'bpmn:Group') return;
              const parent = (el as { parent?: { type?: string } }).parent;
              if (!parent || parent.type === 'bpmn:Group') return;
              const gfx = regG.getGraphics(el);              // <g.djs-element>
              const wrapper = gfx?.parentNode as SVGElement | null;   // <g.djs-group>
              const container = wrapper?.parentNode as SVGElement | null;
              if (wrapper && container && container.firstChild !== wrapper) {
                container.insertBefore(wrapper, container.firstChild);
              }
            });
          } catch { /* abaikan */ }
        };

        // Pulihkan struktur Pool setelah import: relasi induk-anak pool→lane hilang
        // saat round-trip XML (bpmn:Group = artifact datar). Re-parent lane ke
        // pool-nya (pemindahan zero-delta) agar menggeser pool otomatis membawa
        // lane, lalu bersihkan command stack agar tidak tercatat sebagai perubahan.
        if (!isViewOnly) {
          try {
            const mdl = modeler.get('modeling') as BpmnModeling & { moveElements: (els: BpmnElement[], delta: { x: number; y: number }, target?: BpmnElement) => void };
            const groups = registryAll.filter(el => el.type === 'bpmn:Group');
            for (const g of groups) {
              const pool = enclosingGroup(g);
              if (pool && (g as { parent?: unknown }).parent !== pool) {
                mdl.moveElements([g as unknown as BpmnElement], { x: 0, y: 0 }, pool as unknown as BpmnElement);
              } else if (!pool && (g as { parent?: BpmnElement }).parent) {
                // Pool: pindahan zero-delta ke parent yang sama memicu
                // GroupOrderingProvider → z-order turun ke paling bawah,
                // elemen di dalamnya tampil di atas pool.
                mdl.moveElements([g as unknown as BpmnElement], { x: 0, y: 0 }, (g as { parent?: BpmnElement }).parent);
              }
            }
            drainCmdStack();
            cmdStack?.clear();
          } catch { /* struktur tetap datar — ekspansi geometri saat drag tetap bekerja */ }
        }
        // Terapkan penataan lapisan awal (mode edit MAUPUN view-only).
        restackGroups();

        // Inisialisasi navigation stack dengan root awal setelah import selesai
        const canvas = modeler.get('canvas') as BpmnCanvas;
        const initialRoot = canvas.getRootElement();
        const initialItem: BreadcrumbItem = {
          id: initialRoot.id,
          name: projectName || initialRoot.businessObject?.name || 'Proses Utama',
          element: initialRoot,
        };
        navStackRef.current = [initialItem];
        setBreadcrumbs([initialItem]);

        // Konfirmasi SEBELUM penghapusan elemen. JANGAN lewat rule
        // 'elements.delete' — rule itu juga dievaluasi saat context pad
        // sekadar TAMPIL (elemen diklik) sehingga dialog muncul tanpa niat
        // menghapus. Semua jalur hapus nyata (tong sampah context pad, tombol
        // Delete/Backspace, editorActions) bermuara ke modeling.removeElements —
        // bungkus fungsi itu.
        if (!isViewOnly) {
          const modelingForDelete = modeler.get('modeling') as BpmnModeling;
          const origRemove = modelingForDelete.removeElements.bind(modelingForDelete);
          modelingForDelete.removeElements = (elements: BpmnElement[]) => {
            const cb = onBeforeDeleteRef.current;
            if (cb) {
              const els = (elements || []).filter(e => e && e.type);
              if (els.length > 0) {
                const mapped: BpmnSelectedElement[] = els.map(e => ({
                  id: e.id, type: e.type || '', name: e.businessObject?.name || '',
                  parentType: (e as BpmnElement & { parent?: BpmnElement }).parent?.type,
                }));
                if (cb(mapped) === false) return;
              }
            }
            return origRemove(elements);
          };
        }

        // Teruskan seleksi elemen ke pemakai komponen (mis. panel properti
        // sub-process pada Peta Proses Bisnis berjenjang).
        modeler.on('selection.changed', (evt: { newSelection?: BpmnElement[] }) => {
          if (!isMounted) return;
          const sel = evt.newSelection && evt.newSelection[0] as (BpmnElement & { parent?: BpmnElement }) | undefined;
          onSelectionChangeRef.current?.(
            sel && sel.type
              ? { id: sel.id, type: sel.type, name: sel.businessObject?.name || '', parentType: sel.parent?.type }
              : null
          );
        });

        // Tangani navigasi masuk SubProcess dan kembali ke parent
        modeler.on('root.set', ({ element }: { element: BpmnElement }) => {
          if (!isMounted) return;
          const stack = navStackRef.current;
          const existingIdx = stack.findIndex(b => b.id === element.id);
          let newStack: BreadcrumbItem[];
          if (existingIdx >= 0) {
            // Kembali ke ancestor — potong stack hingga elemen ini
            newStack = stack.slice(0, existingIdx + 1);
          } else {
            // Masuk lebih dalam ke SubProcess — tambah ke stack
            newStack = [...stack, {
              id: element.id,
              name: element.businessObject?.name || element.id,
              element,
            }];
          }
          navStackRef.current = newStack;
          setBreadcrumbs([...newStack]);
        });

        if (!isViewOnly) {
          // Priority 1500 > InteractionEvents (1000) agar mutasi berlaku SEBELUM
          // djs-hit dibuat (penting untuk isFrame).
          (modeler as unknown as { on(ev: string, p: number, cb: (e: { element: BpmnElement }) => void): void })
            .on('shape.added', 1500, ({ element }: { element: BpmnElement }) => {
              const el = element as BpmnElement & { di?: { isHorizontal?: boolean }; isFrame?: boolean };
              // Fix isHorizontal: false pada participant vertikal setelah ditempatkan.
              if (el.type === 'bpmn:Participant' && (el.width || 0) < (el.height || 0) && el.di) {
                el.di.isHorizontal = false;
              }
              if (el.type === 'bpmn:Group') {
                // Non-frame → hit 'all' (bukan 'stroke'): Pool/Lane mudah dipilih,
                // termasuk setelah reload dari XML.
                el.isFrame = false;
                // Orientasi dari dimensi bila belum ada → pita judul di sisi benar & round-trip.
                if (el.di && el.di.isHorizontal === undefined) {
                  el.di.isHorizontal = (el.width || 0) >= (el.height || 0);
                }
              }
              // Label eksternal Group: tempelkan ke pita pool/lane dan matikan
              // interaksinya (pointer-events) — teks menyatu dengan pool.
              const asLabel = el as BpmnShapeElement & { labelTarget?: BpmnShapeElement };
              if (el.type === 'label' && asLabel.labelTarget?.type === 'bpmn:Group') {
                pinGroupLabel(asLabel);
                try { (canvas as unknown as { addMarker: (e: BpmnElement, m: string) => void }).addMarker(el, 'group-label-pin'); } catch { /* gfx belum ada */ }
              }
            });

          // Rekatkan ulang label ke pita SETIAP kali Group berubah (digeser, di-resize,
          // di-rename) atau label-nya sendiri tergeser — teks selalu menyatu dgn pool.
          modeler.on('elements.changed', (e: { elements?: BpmnElement[] }) => {
            const changed = e.elements || [];
            for (const el of changed) {
              const asL = el as BpmnShapeElement & { labelTarget?: BpmnShapeElement; label?: BpmnShapeElement };
              const label = (el.type === 'bpmn:Group' ? asL.label : (el.type === 'label' && asL.labelTarget?.type === 'bpmn:Group' ? asL : undefined)) as (BpmnShapeElement & { labelTarget?: BpmnShapeElement }) | undefined;
              if (!label) continue;
              if (!label.labelTarget) (label as { labelTarget?: BpmnShapeElement }).labelTarget = el as BpmnShapeElement;
              pinGroupLabel(label);
              try {
                const gf = modeler.get('graphicsFactory') as { update: (t: string, el: unknown, gfx: unknown) => void };
                const reg = modeler.get('elementRegistry') as BpmnElementRegistry & { getGraphics: (el: unknown) => unknown };
                gf.update('shape', label, reg.getGraphics(label));
              } catch { /* abaikan */ }
            }
          });

          // Setelah nama Pool/Lane diubah, LabelBehavior menata ulang posisi label —
          // tempelkan kembali ke pita dan segarkan grafiknya.
          (modeler as unknown as { on(ev: string, cb: (e: { context?: { element?: BpmnElement & { label?: BpmnShapeElement } } }) => void): void })
            .on('commandStack.element.updateLabel.postExecuted', (e) => {
              const target = e.context?.element;
              const label = (target?.type === 'label' ? target : target?.label) as (BpmnShapeElement & { labelTarget?: BpmnShapeElement }) | undefined;
              if (!label || label.labelTarget?.type !== 'bpmn:Group') return;
              pinGroupLabel(label);
              try {
                const gf = modeler.get('graphicsFactory') as { update: (t: string, el: unknown, gfx: unknown) => void };
                const reg = modeler.get('elementRegistry') as BpmnElementRegistry & { getGraphics: (el: unknown) => unknown };
                gf.update('shape', label, reg.getGraphics(label));
                (canvas as unknown as { addMarker: (e: unknown, m: string) => void }).addMarker(label, 'group-label-pin');
              } catch { /* abaikan */ }
            });

          // Hanya tandai dirty pada aksi nyata pengguna (bukan 'clear' atau restore pool)
          modeler.on('commandStack.changed', (evt: { trigger?: string }) => {
            const stack = modeler.get('commandStack') as BpmnCommandStack;
            setCanUndo(stack.canUndo());
            setCanRedo(stack.canRedo());
            // Jaga pool tetap di lapisan bawah setelah SETIAP perubahan — ordering
            // bawaan bpmn-js terus menyisipkan elemen baru di bawah Group.
            restackGroups();
            if (evt?.trigger !== 'clear') {
              onDirtyChangeRef.current?.(true);
            }
          });

          // Pool-in-SubProcess: intercept at create.start priority 2001 — fires
          // BEFORE CreateParticipantBehavior (priority 2000). When the current
          // canvas root is a SubProcess plane, swap the Participant shape to a
          // bpmn:Group immediately. This prevents CreateParticipantBehavior from
          // seeing a Participant at all, so it never installs its hover override
          // or calls makeCollaboration(). Group is valid in SubProcess and
          // serializes cleanly. No custom shape.create rule needed (Group is
          // allowed everywhere by default via BpmnRules.canCreate).
          const efForPool = modeler.get('elementFactory') as BpmnElementFactory;
          (modeler as unknown as {
            on(ev: string, p: number, cb: (e: unknown) => void): void;
          }).on('create.start', 2001, (rawEvt: unknown) => {
            const ctx = (rawEvt as { context?: { shape?: BpmnElement; elements?: BpmnElement[] } }).context;
            if (!ctx || ctx.shape?.type !== 'bpmn:Participant') return;
            // Only swap when drilled into a SubProcess plane (root id ends with _plane)
            if (!canvas.getRootElement()?.id?.endsWith('_plane')) return;
            const group = efForPool.createShape({ type: 'bpmn:Group' });
            group.width  = ctx.shape.width  || 300;
            group.height = ctx.shape.height || 200;
            // Create.start() has already adjusted shape.x/y to be cursor-centred
            // (x = -width/2, y = -height/2). Mirror that for the Group so the
            // preview renderer never reads undefined.x during mouse-move events.
            group.x = -(group.width  / 2);
            group.y = -(group.height / 2);
            if (ctx.shape.businessObject?.name) group.businessObject.name = ctx.shape.businessObject.name;
            ctx.shape = group;
            if (Array.isArray(ctx.elements) && ctx.elements.length === 1) ctx.elements[0] = group;
          });

          // Hapus djs-label-hidden SEBELUM elements.changed me-render ulang elemen.
          // CommandStack._fire mengirim event dengan prefix 'commandStack.':
          //   command='element.updateLabel', qualifier='postExecuted'
          //   → fires 'commandStack.element.updateLabel.postExecuted'
          // Urutan: postExecuted → elements.changed (render) → commandStack.changed
          // Dengan menghapus marker di sini, render ulang tidak menyembunyikan teks.
          const bpmnCanvas = modeler.get('canvas') as BpmnCanvas & {
            removeMarker: (el: BpmnElement, marker: string) => void;
          };
          modeler.on('commandStack.element.updateLabel.postExecuted', (evt: { context?: { element?: BpmnElement & { label?: BpmnElement } } }) => {
            const el = evt?.context?.element;
            if (!el) return;
            const target = el.label || el;
            bpmnCanvas.removeMarker(target, 'djs-label-hidden');
            bpmnCanvas.removeMarker(target, 'djs-element-hidden');
          });
        }

        setTimeout(() => {
          if (isMounted) {
            canvas.resized();
            canvas.zoom('fit-viewport', true);
          }
        }, 300);
      } catch (err) {
        console.error("Gagal muat diagram:", err);
        if (isMounted) await modeler.importXML(DEFAULT_XML);
      }
    };

    initCanvas();

    // Dukungan sentuh: terjemahkan touch → mouse agar tarik/geser/edit jalan di tablet.
    const detachTouch = containerRef.current ? enableTouchInteraction(containerRef.current) : undefined;

    return () => { isMounted = false; document.removeEventListener('keydown', enterNewlineForGroup, true); detachTouch?.(); modeler.destroy(); };
  }, [isViewOnly, xml, projectName]);

  // Tambah swimlane (bpmn:Group) langsung di dalam SubProcess yang sedang aktif.
  // Tombol ini hanya muncul ketika pengguna sudah masuk ke dalam (drill-in) SubProcess.
  const handleAddSwimlane = () => {
    const modeler = modelerRef.current as BpmnModeler;
    if (!modeler) return;
    const canvas = modeler.get('canvas') as BpmnCanvas;
    const root = canvas.getRootElement();
    if (!root?.id?.endsWith('_plane')) return;
    const ef = modeler.get('elementFactory') as BpmnElementFactory;
    const modeling = modeler.get('modeling') as BpmnModeling;
    const group = ef.createShape({ type: 'bpmn:Group' });
    group.isFrame = false; // hit 'all' (bukan 'stroke') → Pool mudah diklik/dipilih
    group.width = 400;
    group.height = 200;
    const cx = Math.round((containerRef.current?.clientWidth  || 700) / 2);
    const cy = Math.round((containerRef.current?.clientHeight || 400) / 2);
    modeling.createShape(group, { x: cx, y: cy }, root);
    modeling.updateLabel(group, 'Pool');
  };

  const handleExport = async () => {
    if (!modelerRef.current || !onSave) return;
    setIsExporting(true);
    try {
      const modeler = modelerRef.current;
      const { xml: savedXml } = await modeler.saveXML({ format: true });
      if (!savedXml) return;

      // saveSVG hanya mengekspor plane yang sedang aktif. Ambil SVG proses utama
      // dari root utamanya (meski pengguna sedang drill-in ke sub-proses), lalu
      // kumpulkan SVG tiap plane sub-proses yang sudah punya isi — dipakai untuk
      // pilihan ekspor "sertakan sub-proses" di dialog unduh.
      const canvas = modeler.get('canvas') as BpmnCanvas;
      const registry = modeler.get('elementRegistry') as BpmnElementRegistry;
      const originalRoot = canvas.getRootElement();
      type RootEl = BpmnShapeElement & { children?: unknown[]; businessObject?: { name?: string } };
      const roots = registry.filter((el) => !(el as RootEl & { parent?: unknown }).parent && !!el.id) as unknown as RootEl[];
      const mainRoot = roots.find(r => !String(r.id).endsWith('_plane')) || (originalRoot as unknown as RootEl);
      const subRoots = roots.filter(r => String(r.id).endsWith('_plane') && (r.children || []).length > 0);

      // Susun sub-proses SESUAI HIERARKI (sub-proses di dalam sub-proses / berjenjang).
      // Tiap plane "X_plane" bersarang di dalam plane induknya bila elemen X berada
      // di dalam sub-proses lain. Urutkan depth-first (induk → anak) & bangun jalur
      // breadcrumb ("Induk › Anak") supaya sub-SUB-proses ikut terekspor rapi dan
      // penamaannya jelas — bukan sekadar daftar datar berurutan registry.
      const planeById = new Map<string, RootEl>();
      for (const p of subRoots) planeById.set(String(p.id), p);
      const nameOfPlane = (p: RootEl) => p.businessObject?.name || String(p.id).replace(/_plane$/, '');
      const parentPlaneId = (p: RootEl): string | null => {
        const elId = String(p.id).replace(/_plane$/, '');
        const el = registry.get(elId) as (BpmnElement & { parent?: { id?: string } }) | undefined;
        const parentId = el?.parent?.id;
        return parentId && parentId.endsWith('_plane') && planeById.has(parentId) ? parentId : null;
      };
      const childrenOf = new Map<string | null, RootEl[]>();
      for (const p of subRoots) {
        const key = parentPlaneId(p);
        const arr = childrenOf.get(key) || [];
        arr.push(p);
        childrenOf.set(key, arr);
      }
      const ordered: { plane: RootEl; depth: number; path: string[] }[] = [];
      const walkPlanes = (key: string | null, depth: number, prefix: string[]) => {
        for (const p of (childrenOf.get(key) || [])) {
          const path = [...prefix, nameOfPlane(p)];
          ordered.push({ plane: p, depth, path });
          walkPlanes(String(p.id), depth + 1, path);
        }
      };
      walkPlanes(null, 0, []);

      let svg = '';
      const subSvgs: { id: string; name: string; svg: string; depth: number; path: string[] }[] = [];
      try {
        canvas.setRootElement(mainRoot as unknown as BpmnElement);
        svg = (await modeler.saveSVG()).svg;
        for (const { plane, depth, path } of ordered) {
          canvas.setRootElement(plane as unknown as BpmnElement);
          const { svg: s } = await modeler.saveSVG();
          subSvgs.push({ id: String(plane.id), name: nameOfPlane(plane), svg: s, depth, path });
        }
      } finally {
        canvas.setRootElement(originalRoot);
      }

      // Repair sebelum simpan: gabungkan elemen Pool yang ada di dalam SubProcess
      // ke flowElements SubProcess yang benar. Pool-container itu sendiri tidak
      // dapat diserialisasi BPMN, tapi isinya tetap tersimpan dan muncul kembali.
      onSave(repairBpmnXml(savedXml), svg, subSvgs);
    } catch { alert("Gagal Simpan"); } finally { setIsExporting(false); }
  };

  // Beri pemakai komponen cara memicu simpan secara terprogram (mis. auto-save
  // sebelum berpindah ke peta turunan di Peta Proses Bisnis berjenjang).
  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;
  useEffect(() => {
    registerSaveHandler?.(() => handleExportRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSaveHandler]);

  // API kanvas imperatif: tambah sub-process bersarang ke elemen induk tertentu.
  useEffect(() => {
    registerCanvasApi?.({
      addNestedSubProcess: (parentElementId: string, name: string) => {
        const modeler = modelerRef.current as BpmnModeler | null;
        if (!modeler) return null;
        try {
          const registry = modeler.get('elementRegistry') as BpmnElementRegistry;
          const parent = registry.get(parentElementId);
          if (!parent) return null;
          const ef = modeler.get('elementFactory') as BpmnElementFactory;
          const modeling = modeler.get('modeling') as BpmnModeling;
          // Collapsed (dengan penanda [+]) — konsisten dgn kotak di Level 0/1.
          const shape = ef.createShape({ type: 'bpmn:SubProcess', isExpanded: false });
          shape.width = 100; shape.height = 80;
          // Susun berjajar di dalam induk berdasarkan jumlah anak yang sudah ada.
          const count = ((parent as BpmnShapeElement & { children?: BpmnElement[] }).children || [])
            .filter(c => c.type === 'bpmn:SubProcess').length;
          const pos = {
            x: Math.round(parent.x + 20 + count * 120 + 50),
            y: Math.round(parent.y + 45 + 40),
          };
          modeling.createShape(shape, pos, parent as unknown as BpmnElement);
          if (name) modeling.updateLabel(shape, name);
          return shape.id;
        } catch { return null; }
      },
      removeElement: (elementId: string) => {
        const modeler = modelerRef.current as BpmnModeler | null;
        if (!modeler) return false;
        try {
          const registry = modeler.get('elementRegistry') as BpmnElementRegistry;
          const el = registry.get(elementId);
          if (!el) return false;
          const modeling = modeler.get('modeling') as BpmnModeling;
          modeling.removeElements([el as unknown as BpmnElement]);
          return true;
        } catch { return false; }
      },
      importXml: async (xmlIn: string) => {
        const modeler = modelerRef.current as BpmnModeler | null;
        if (!modeler) return false;
        try {
          await modeler.importXML(repairBpmnXml(xmlIn));
          // Drain + clear CommandStack (cegah snap-back & undo balik ke diagram lama).
          const cmdStack = modeler.get('commandStack') as BpmnCommandStack | undefined;
          const ex = (cmdStack as unknown as { _currentExecution?: { actions: unknown[]; dirty: unknown[]; trigger: unknown } })?._currentExecution;
          if (ex) { ex.actions.length = 0; ex.dirty.length = 0; ex.trigger = null; }
          cmdStack?.clear();
          const canvas = modeler.get('canvas') as BpmnCanvas;
          canvas.zoom('fit-viewport', true);
          onDirtyChange?.(true);
          return true;
        } catch (e) { console.error('importXml gagal:', e); return false; }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCanvasApi]);

  const handleZoomIn = () => {
    const canvas = modelerRef.current?.get('canvas') as BpmnCanvas & { zoom: (s?: number | string, c?: boolean | { x: number; y: number }) => number };
    if (!canvas) return;
    const current = canvas.zoom();
    canvas.zoom(Math.min(current * 1.25, 4), { x: (containerRef.current?.clientWidth || 800) / 2, y: (containerRef.current?.clientHeight || 600) / 2 });
  };

  const handleZoomOut = () => {
    const canvas = modelerRef.current?.get('canvas') as BpmnCanvas & { zoom: (s?: number | string, c?: boolean | { x: number; y: number }) => number };
    if (!canvas) return;
    const current = canvas.zoom();
    canvas.zoom(Math.max(current / 1.25, 0.1), { x: (containerRef.current?.clientWidth || 800) / 2, y: (containerRef.current?.clientHeight || 600) / 2 });
  };

  const handleZoomReset = () => {
    const canvas = modelerRef.current?.get('canvas') as BpmnCanvas;
    if (!canvas) return;
    canvas.zoom('fit-viewport', true);
  };

  const startCreateFromPicker = (_e: React.MouseEvent<HTMLButtonElement>, item: ElementPickerItem) => {
    setShowElementPicker(false);
    const modeler = modelerRef.current as BpmnModeler;
    if (!modeler) return;
    const ef = modeler.get('elementFactory') as BpmnElementFactory;
    const modeling = modeler.get('modeling') as BpmnModeling;
    const canvas = modeler.get('canvas') as BpmnCanvas & { viewbox: () => { x: number; y: number; width: number; height: number } };
    const selection = modeler.get('selection') as { select: (el: BpmnElement) => void };
    const attrs: Record<string, unknown> = { type: item.type };
    if (item.isExpanded !== undefined) attrs.isExpanded = item.isExpanded;
    if (item.eventDefinitionType) attrs.eventDefinitionType = item.eventDefinitionType;
    if (item.triggeredByEvent) attrs.triggeredByEvent = true;
    const shape = ef.createShape(attrs);
    // Dimensi eksplisit (mis. Pool vertikal = tinggi > lebar) menentukan orientasi.
    if (item.width) shape.width = item.width;
    if (item.height) shape.height = item.height;
    if (item.type === 'bpmn:Group') shape.isFrame = false; // Pool mudah dipilih
    // Tempatkan langsung di tengah viewport lalu seleksi — ramah sentuh (tanpa
    // "klik untuk menaruh"). Pengguna tinggal menggeser ke posisi yang diinginkan.
    const vb = canvas.viewbox();
    let pos = { x: Math.round(vb.x + vb.width / 2), y: Math.round(vb.y + vb.height / 2) };
    const root = canvas.getRootElement();

    // Cari container tersempit (Participant/Lane/SubProcess) pada titik letak agar
    // elemen masuk KE DALAM pool — bukan menjadi saudara pool di collaboration
    // (yang membuat elemen tertutup pool / model tidak valid).
    const registry = modeler.get('elementRegistry') as BpmnElementRegistry;
    const CONTAINERS = ['bpmn:Participant', 'bpmn:Lane', 'bpmn:SubProcess'];
    const findContainerAt = (p: { x: number; y: number }): BpmnShapeElement | null => {
      let best: BpmnShapeElement | null = null;
      let bestArea = Infinity;
      registry.forEach((el) => {
        if (!el.type || !CONTAINERS.includes(el.type) || el.x == null) return;
        if (el.type === shape.type) return; // jangan sarangkan pool ke pool
        if (p.x > el.x && p.x < el.x + el.width && p.y > el.y && p.y < el.y + el.height) {
          const area = el.width * el.height;
          if (area < bestArea) { best = el; bestArea = area; }
        }
      });
      return best;
    };
    let parent: BpmnElement = root;
    if (item.type !== 'bpmn:Participant') {
      let container = findContainerAt(pos);
      // Root collaboration (mis. template Level 0): elemen non-pool WAJIB berada di
      // dalam sebuah Participant. Bila titik tengah tidak mengenai pool, pakai pool pertama.
      if (!container && root.type === 'bpmn:Collaboration') {
        const pools: BpmnShapeElement[] = [];
        registry.forEach((el) => {
          if (el.type === 'bpmn:Participant' && el.x != null) pools.push(el);
        });
        if (pools.length > 0) {
          const fp = pools[0];
          container = fp;
          pos = { x: Math.round(fp.x + fp.width / 2), y: Math.round(fp.y + fp.height / 2) };
        }
      }
      if (container) parent = container as unknown as BpmnElement;
    }
    modeling.createShape(shape, pos, parent);
    selection.select(shape);
  };

  return (
    <div className="relative flex h-full w-full min-h-150 flex-col overflow-hidden rounded-xl border bg-white">
      <div className="z-20 flex items-center justify-between border-b bg-slate-50 p-3 shadow-sm">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {!isViewOnly && (
            <div className="flex overflow-hidden rounded-lg border bg-white shadow-sm shrink-0">
              <button onClick={() => { const cs = modelerRef.current?.get('commandStack') as BpmnCommandStack | undefined; cs?.undo(); }} disabled={!canUndo} title="Undo (Ctrl+Z)" className="border-r p-2 hover:bg-slate-50 disabled:opacity-30"><Undo2 size={16} /></button>
              <button onClick={() => { const cs = modelerRef.current?.get('commandStack') as BpmnCommandStack | undefined; cs?.redo(); }} disabled={!canRedo} title="Redo (Ctrl+Y)" className="p-2 hover:bg-slate-50 disabled:opacity-30"><Redo2 size={16} /></button>
            </div>
          )}
          <nav className="flex items-center text-sm border-l pl-4 min-w-0 overflow-hidden">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <ChevronRight size={14} className="mx-2 text-slate-400 shrink-0" />}
                <button onClick={() => (modelerRef.current?.get('canvas') as BpmnCanvas).setRootElement(item.element)} className={`font-medium truncate max-w-30 ${index === breadcrumbs.length - 1 ? 'text-blue-600' : 'text-slate-500'}`}>
                  {item.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>
        {!isViewOnly && (
          <div className="ml-3 flex shrink-0 items-center gap-2">
            {breadcrumbs.length > 1 && (
              <button
                onClick={handleAddSwimlane}
                title="Tambah Swimlane (Group) di SubProcess ini"
                className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100 transition-all"
              >
                + Swimlane
              </button>
            )}
            <button onClick={() => setShowElementPicker(v => !v)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${showElementPicker ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <LayoutGrid size={14} /> Elemen
            </button>
            {/* Slot tombol tambahan dari pemakai komponen (mis. 🗺 Lihat Peta Relasi) */}
            {toolbarExtra}
            {onSave && (
              <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow transition-all active:scale-95 disabled:bg-slate-400 hover:bg-blue-700">
                <Save size={15} /> {isExporting ? 'Menyimpan...' : 'Simpan Alur'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative min-h-125 flex-1 bg-white">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Zoom controls — pojok kanan bawah, muncul untuk semua mode */}
        <div className="absolute bottom-4 right-4 z-30 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <button onClick={handleZoomIn} title="Perbesar (Ctrl +)" className="border-b border-slate-100 p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
            <ZoomIn size={16} />
          </button>
          <button onClick={handleZoomReset} title="Sesuaikan tampilan" className="border-b border-slate-100 px-2.5 py-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
            <Maximize2 size={15} />
          </button>
          <button onClick={handleZoomOut} title="Perkecil (Ctrl -)" className="p-2.5 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
            <ZoomOut size={16} />
          </button>
        </div>

        {!isViewOnly && showElementPicker && (
          <div className="absolute z-40 flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
            style={{ top: '8px', left: '128px', width: '240px', maxHeight: 'min(calc(100% - 16px), 80vh)' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5 rounded-t-xl">
              <span className="text-sm font-bold text-slate-700">Pilih Elemen BPMN</span>
              <button onClick={() => setShowElementPicker(false)} className="rounded p-0.5 text-slate-400 hover:text-slate-600"><X size={14} /></button>
            </div>
            <div className="element-picker-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {ELEMENT_GROUPS.map(group => (
                <div key={group.label} className="border-b border-slate-50 p-3 last:border-0">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{group.label}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {group.items.map((item) => (
                      <button
                        key={item.type + item.label}
                        onClick={(e) => startCreateFromPicker(e, item)}
                        className="flex flex-col items-center gap-1 rounded-lg p-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        title={item.label}
                      >
                        <i className={`${item.icon} text-xl leading-none`} />
                        <span className="text-center text-[9px] font-semibold leading-tight">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .bjs-powered-by { display: none !important; }
        /* Layar sentuh: cegah browser merebut gestur (scroll/zoom) di area kanvas
           agar tarik/geser elemen berfungsi. */
        .djs-container, .djs-container svg { touch-action: none; }
        /* Pastikan teks di kotak edit selalu terlihat (tidak terpengaruh dark mode OS) */
        .djs-direct-editing-parent { color: #1f2937 !important; background-color: #ffffff !important; z-index: 100 !important; font-family: 'Bookman Old Style', 'URW Bookman', Bookman, Georgia, serif !important; }
        .djs-direct-editing-content { color: #1f2937 !important; font-family: inherit !important; }
        /* Popup pilihan warna elemen */
        .djs-popup[data-popup="element-colors"] .djs-popup-body .entry { display: flex; align-items: center; gap: 8px; }
        /* Label eksternal Pool/Lane (bpmn:Group) — tidak bisa diklik/dipilih terpisah;
           teks digambar menyatu di pita pool oleh renderer. */
        .group-label-pin { pointer-events: none !important; }
        .djs-palette { left: 20px !important; top: 20px !important; border-radius: 12px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; }
        .djs-palette.open { width: 94px !important; max-height: calc(100% - 48px) !important; overflow-y: auto !important; overflow-x: hidden !important; }
        .djs-palette.open::-webkit-scrollbar { width: 4px; }
        .djs-palette.open::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 2px; }
        .element-picker-scroll::-webkit-scrollbar { width: 6px; }
        .element-picker-scroll::-webkit-scrollbar-track { background: #f8fafc; border-radius: 0 0 12px 0; }
        .element-picker-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .element-picker-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .element-picker-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 #f8fafc; }
        /* Pool Vertikal — putar ikon 90° agar bisa dibedakan dari horizontal */
        .djs-palette [data-action="create.pool-vertical"]::before { display: inline-block; transform: rotate(90deg); }
        /* Tombol context-pad "Pool Vertikal" pada SubProcess — ikon diputar 90° */
        .djs-context-pad [data-action="add-swimlane-vertical"] { transform: rotate(90deg); }
      `}</style>
    </div>
  );
}