"use client";
import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import { Undo2, Redo2, ChevronRight, Save } from 'lucide-react';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import 'bpmn-js/dist/assets/bpmn-js.css'; 

// === INTERFACES ===
interface BpmnElement { 
  id: string; 
  type?: string;
  width?: number;
  height?: number;
  businessObject: { name?: string; id: string; $parent?: BpmnElement; }; 
}

interface BpmnPalette { registerProvider: (provider: CustomPaletteProvider) => void; }
interface BpmnCreate { start: (event: React.DragEvent | MouseEvent | React.MouseEvent, shape: BpmnElement) => void; }
interface BpmnElementFactory { createShape: (descriptor: { type: string, isExpanded?: boolean }) => BpmnElement; }
interface BpmnEventBus { on: (event: string, callback: (event: { element: BpmnElement }) => void) => void; }

interface BpmnCommandStack { 
  undo: () => void; redo: () => void; 
  canUndo: () => boolean; canRedo: () => boolean; 
}

interface BpmnCanvas { 
  zoom: (scale: string | number, center?: boolean) => void; 
  resized: () => void; 
  setRootElement: (element: BpmnElement) => void; 
  getRootElement: () => BpmnElement; 
}

interface RuleContext { target: BpmnElement; source?: BpmnElement; }
interface BreadcrumbItem { id: string; name: string; element: BpmnElement; }

// === HELPER SVG UNTUK CUSTOM RENDERER ===
const svgCreate = (type: string) => document.createElementNS('http://www.w3.org/2000/svg', type);
const svgAttr = (element: Element, attrs: Record<string, string | number>) => {
  Object.keys(attrs).forEach(key => element.setAttribute(key, String(attrs[key])));
};
const svgAppend = (parent: Element, child: Element) => parent.appendChild(child);

// === 1. CUSTOM PALETTE ===
class CustomPaletteProvider {
  static $inject = ['palette', 'create', 'elementFactory'];
  
  private _create: BpmnCreate;
  private _elementFactory: BpmnElementFactory;

  constructor(palette: BpmnPalette, create: BpmnCreate, elementFactory: BpmnElementFactory) {
    this._create = create;
    this._elementFactory = elementFactory;
    palette.registerProvider(this);
  }

  getPaletteEntries() {
    const create = this._create;
    const elementFactory = this._elementFactory;

    return {
      'create.atr-service': {
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
      },
      // --- TOMBOL BARU: POOL VERTIKAL ---
      'create.vertical-pool': {
        group: 'collaboration',
        className: 'bpmn-icon-participant', // Pakai icon pool bawaan
        title: 'Tambah Pool Vertikal',
        action: {
          dragstart: (event: React.DragEvent | MouseEvent) => {
            const shape = elementFactory.createShape({ type: 'bpmn:SubProcess', isExpanded: true });
            shape.id = 'VerticalPool_' + Math.random().toString(36).substring(2, 9);
            shape.businessObject.id = shape.id;
            shape.businessObject.name = 'Unit Kerja Vertikal';
            shape.width = 300; 
            shape.height = 600; 
            create.start(event, shape);
          },
          click: (event: React.MouseEvent) => {
            const shape = elementFactory.createShape({ type: 'bpmn:SubProcess', isExpanded: true });
            shape.id = 'VerticalPool_' + Math.random().toString(36).substring(2, 9);
            shape.businessObject.id = shape.id;
            shape.businessObject.name = 'Unit Kerja Vertikal';
            shape.width = 300; 
            shape.height = 600; 
            create.start(event, shape);
          }
        }
      }
    };
  }
}

// === 2. CUSTOM RULES ===
class CustomRules extends (RuleProvider as unknown as { new(eb: BpmnEventBus): RuleProvider }) {
  static $inject = ['eventBus'];

  constructor(eventBus: BpmnEventBus) {
    super(eventBus);
  }

  init() {
    this.addRule('connection.create', (context: RuleContext): boolean | void => {
      const target = context.target;
      if (target && target.businessObject && target.businessObject.name === 'DILARANG') {
        return false;
      }
    });

    this.addRule('shape.resize', 1500, (context: { shape: { type: string } }): boolean | void => {
      const shape = context.shape;
      if (
        shape && shape.type && (
          shape.type.includes('Task') || 
          shape.type === 'bpmn:SubProcess' ||
          shape.type === 'bpmn:CallActivity'
        )
      ) {
        return true; 
      }
    });
  }
}

// === 3. CUSTOM RENDERER (VERTIKAL POOL) ===
class CustomRenderer extends (BaseRenderer as unknown as { new(eb: BpmnEventBus, priority: number): Record<string, unknown> }) {
  static $inject = ['eventBus'];

  constructor(eventBus: BpmnEventBus) {
    super(eventBus, 2000); 
  }

  canRender(element: BpmnElement) {
    return element.type === 'bpmn:SubProcess' && element.id.startsWith('VerticalPool_');
  }

  drawShape(parentNode: Element, element: BpmnElement & { width?: number; height?: number }) {
    const width = element.width || 300;
    const height = element.height || 600;

    // 1. Kotak Dasar Pool
    const rect = svgCreate('rect');
    svgAttr(rect, {
      width: width,
      height: height,
      stroke: '#000000',
      strokeWidth: 2,
      fill: '#ffffff',
      rx: 4, ry: 4 // Sedikit membulat
    });
    svgAppend(parentNode, rect);

    // 2. Garis Pemisah Header Atas (Tinggi: 30px)
    const line = svgCreate('line');
    svgAttr(line, {
      x1: 0, y1: 30,
      x2: width, y2: 30,
      stroke: '#000000',
      strokeWidth: 2
    });
    svgAppend(parentNode, line);

    // 3. Teks Judul (Mendatar di atas)
    const text = svgCreate('text');
    svgAttr(text, {
      x: width / 2,
      y: 20,
      'text-anchor': 'middle',
      'font-family': 'Arial, sans-serif',
      'font-size': '13px',
      'font-weight': 'bold',
      fill: '#000000'
    });
    text.textContent = element.businessObject?.name || 'Unit Kerja Vertikal';
    svgAppend(parentNode, text);

    return rect;
  }
}

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

export default function BPMNModelerComponent({ xml, projectName, onSave, isViewOnly = false }: { xml?: string, projectName?: string, onSave?: (xml: string, svg: string) => void, isViewOnly?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | NavigatedViewer | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const ModelerClass = isViewOnly ? NavigatedViewer : BpmnModeler;
    const modeler = new ModelerClass({
      container: containerRef.current,
      keyboard: isViewOnly ? undefined : { bindTo: window },
      additionalModules: isViewOnly ? [
        {
          // Mode View: Hanya butuh CustomRenderer untuk menggambar kotak vertikalnya
          __init__: ['customRenderer'],
          customRenderer: ['type', CustomRenderer]
        }
      ] : [
        {
          // Mode Edit: Butuh Palette, Rules (Resize), dan CustomRenderer
          __init__: ['customPaletteProvider', 'customRules', 'customRenderer'],
          customPaletteProvider: ['type', CustomPaletteProvider],
          customRules: ['type', CustomRules],
          customRenderer: ['type', CustomRenderer]
        }
      ]
    });

    modelerRef.current = modeler;
    let isMounted = true;

    const updateBreadcrumbs = () => {
      try {
        const canvas = modeler.get('canvas') as BpmnCanvas;
        const currentRoot = canvas.getRootElement();
        const trail: BreadcrumbItem[] = [];
        let current: BpmnElement | undefined = currentRoot;

        while (current) {
          if (current.id !== 'Definitions_1' && !current.id.includes('Definitions')) {
            const isTopLevel = !current.businessObject?.$parent || current.businessObject.$parent.id === 'Definitions_1';
            trail.unshift({ 
              id: current.id, 
              name: (isTopLevel && projectName) ? projectName : (current.businessObject?.name || current.id), 
              element: current 
            });
          }
          current = current.businessObject?.$parent;
        }
        if (isMounted) setBreadcrumbs(trail);
      } catch (e) { console.error(e); }
    };

    const initCanvas = async () => {
      try {
        let xmlToLoad = (xml && xml.includes('bpmn:definitions')) ? xml : DEFAULT_XML;
        if (projectName && xmlToLoad.includes('id="Process_1"')) {
           xmlToLoad = xmlToLoad.replace('id="Process_1"', `id="Process_1" name="${projectName}"`);
        }

        await modeler.importXML(xmlToLoad);
        if (!isMounted) return;

        updateBreadcrumbs();
        modeler.on('root.set', updateBreadcrumbs);
        
        if (!isViewOnly) {
          modeler.on('commandStack.changed', () => {
            const stack = modeler.get('commandStack') as BpmnCommandStack;
            setCanUndo(stack.canUndo());
            setCanRedo(stack.canRedo());
          });
        }

        setTimeout(() => {
          if (isMounted) {
            (modeler.get('canvas') as BpmnCanvas).resized();
            (modeler.get('canvas') as BpmnCanvas).zoom('fit-viewport', true);
          }
        }, 300);
      } catch (err) {
        console.error("Gagal muat diagram:", err);
        if (isMounted) await modeler.importXML(DEFAULT_XML);
      }
    };

    initCanvas();
    return () => { isMounted = false; modeler.destroy(); };
  }, [isViewOnly, xml, projectName]);

  const handleExport = async () => {
    if (!modelerRef.current || !onSave) return;
    setIsExporting(true);
    try {
      const { xml: savedXml } = await modelerRef.current.saveXML({ format: true });
      const { svg } = await modelerRef.current.saveSVG();
      if (savedXml) onSave(savedXml, svg);
    } catch { alert("Gagal Simpan"); } finally { setIsExporting(false); }
  };

  return (
    <div className="relative flex h-full w-full min-h-150 flex-col overflow-hidden rounded-xl border bg-white">
      <div className="z-20 flex items-center justify-between border-b bg-slate-50 p-3 shadow-sm">
        <div className="flex items-center gap-4">
          {!isViewOnly && (
            <div className="flex overflow-hidden rounded-lg border bg-white shadow-sm">
              <button onClick={() => (modelerRef.current?.get('commandStack') as BpmnCommandStack).undo()} disabled={!canUndo} className="border-r p-2 hover:bg-slate-50 disabled:opacity-30"><Undo2 size={16} /></button>
              <button onClick={() => (modelerRef.current?.get('commandStack') as BpmnCommandStack).redo()} disabled={!canRedo} className="p-2 hover:bg-slate-50 disabled:opacity-30"><Redo2 size={16} /></button>
            </div>
          )}
          <nav className="flex items-center text-sm border-l pl-4">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <ChevronRight size={14} className="mx-2 text-slate-400" />}
                <button onClick={() => (modelerRef.current?.get('canvas') as BpmnCanvas).setRootElement(item.element)} className={`font-medium ${index === breadcrumbs.length - 1 ? 'text-blue-600' : 'text-slate-500'}`}>
                  {item.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
        </div>
      </div>

      <div className="relative min-h-125 flex-1 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {!isViewOnly && onSave && (
        <button onClick={handleExport} disabled={isExporting} className="absolute bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg transition-all active:scale-95 disabled:bg-slate-400 hover:bg-blue-700">
          <Save size={18} /> {isExporting ? 'Menyimpan...' : 'Simpan Alur'}
        </button>
      )}

      <style jsx global>{`
        .bjs-powered-by { display: none !important; }
        .djs-label-container { overflow-wrap: anywhere !important; word-break: break-all !important; white-space: normal !important; }
        .djs-palette { left: 20px !important; top: 20px !important; border-radius: 12px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; }
      `}</style>
    </div>
  );
}