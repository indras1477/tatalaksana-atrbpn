"use client";
import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { Undo2, Redo2, ChevronRight, Save, LayoutGrid, X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import poolGroupRendererModule from './bpmnPoolGroupRenderer';
import { enableTouchInteraction } from './bpmnTouch';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js/dist/assets/bpmn-js.css'; 

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

export default function BPMNModelerComponent({ xml, projectName, onSave, isViewOnly = false, onDirtyChange }: { xml?: string, projectName?: string, onSave?: (xml: string, svg: string) => void, isViewOnly?: boolean, onDirtyChange?: (isDirty: boolean) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | NavigatedViewer | null>(null);
  const navStackRef = useRef<BreadcrumbItem[]>([]);
  // Ref agar closure di eventBus selalu gunakan callback terbaru
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; });
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
      // poolGroupRendererModule: bpmn:Group digambar sebagai Pool/Swimlane — aktif
      // di mode edit MAUPUN view agar pool di dalam SubProcess tetap tampil saat dilihat.
      additionalModules: isViewOnly
        ? [poolGroupRendererModule]
        : [
            poolGroupRendererModule,
            {
              __init__: ['customPaletteProvider', 'customRules', 'customContextPadProvider'],
              customPaletteProvider: ['type', CustomPaletteProvider],
              customRules: ['type', CustomRules],
              customContextPadProvider: ['type', CustomContextPadProvider]
            }
          ]
    });

    modelerRef.current = modeler;
    navStackRef.current = [];
    let isMounted = true;

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
            });

          // Hanya tandai dirty pada aksi nyata pengguna (bukan 'clear' atau restore pool)
          modeler.on('commandStack.changed', (evt: { trigger?: string }) => {
            const stack = modeler.get('commandStack') as BpmnCommandStack;
            setCanUndo(stack.canUndo());
            setCanRedo(stack.canRedo());
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

    return () => { isMounted = false; detachTouch?.(); modeler.destroy(); };
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
      const { xml: savedXml } = await modelerRef.current.saveXML({ format: true });
      const { svg } = await modelerRef.current.saveSVG();
      if (!savedXml) return;

      // Repair sebelum simpan: gabungkan elemen Pool yang ada di dalam SubProcess
      // ke flowElements SubProcess yang benar. Pool-container itu sendiri tidak
      // dapat diserialisasi BPMN, tapi isinya tetap tersimpan dan muncul kembali.
      onSave(repairBpmnXml(savedXml), svg);
    } catch { alert("Gagal Simpan"); } finally { setIsExporting(false); }
  };

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
    const pos = { x: Math.round(vb.x + vb.width / 2), y: Math.round(vb.y + vb.height / 2) };
    const root = canvas.getRootElement();
    modeling.createShape(shape, pos, root);
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
        .djs-direct-editing-parent { color: #1f2937 !important; background-color: #ffffff !important; z-index: 100 !important; }
        .djs-direct-editing-content { color: #1f2937 !important; }
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