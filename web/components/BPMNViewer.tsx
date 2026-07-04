"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import poolGroupRendererModule from './bpmnPoolGroupRenderer';
import { enableTouchInteraction } from './bpmnTouch';
import { ChevronRight, ZoomIn, ZoomOut, Maximize2, Home } from 'lucide-react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

// Same repair function as in BPMNModeler.tsx — moves orphaned process elements
// into their SubProcess flowElements so importXML succeeds without errors.
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

  for (const shape of Array.from(defs.getElementsByTagNameNS(BPMNDI, 'BPMNShape'))) {
    const bounds = shape.getElementsByTagNameNS(DC, 'Bounds')[0];
    if (!bounds || !bounds.hasAttribute('x')) shape.parentElement?.removeChild(shape);
  }

  // Map direct-child element IDs → their parent bpmn:process (all top-level processes,
  // regardless of Collaboration membership — both orphaned and Participant-referenced ones
  // must be checked, because either can have elements misplaced in SubProcess planes).
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
      let plane: Element | null = null;
      for (const p of Array.from(defs.getElementsByTagNameNS(BPMNDI, 'BPMNPlane'))) {
        if (p.getAttribute('bpmnElement') === spId) { plane = p; break; }
      }
      if (!plane) continue;
      const spChildIds = new Set<string>();
      for (const child of Array.from(sp.children)) {
        const id = child.getAttribute('id');
        if (id) spChildIds.add(id);
      }
      const procsToMerge = new Set<Element>();
      for (const shape of Array.from(plane.getElementsByTagNameNS(BPMNDI, 'BPMNShape'))) {
        const bpmnEl = shape.getAttribute('bpmnElement');
        if (!bpmnEl || spChildIds.has(bpmnEl)) continue;
        const proc = elToProc.get(bpmnEl);
        if (proc) procsToMerge.add(proc);
      }
      for (const proc of procsToMerge) {
        for (const child of Array.from(proc.children)) {
          if (child.parentElement === proc) sp.appendChild(child);
        }
      }
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

interface BPMNViewerProps {
  xml?: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
  element: object;
}

type BpmnCanvas = {
  zoom: (scale?: string | number, center?: boolean | { x: number; y: number }) => number;
  resized: () => void;
  setRootElement: (root: object) => void;
  getRootElement: () => { id: string; businessObject?: { name?: string }; type?: string };
  findRoot: (id: string) => object | null;
  getContainer: () => HTMLElement;
  _elementRegistry?: {
    filter: (fn: (el: { parent?: { id: string } }) => boolean) => unknown[];
  };
};

type BpmnElementRegistry = {
  filter: (fn: (el: { type?: string; parent?: { id?: string } }) => boolean) => unknown[];
};

export default function BPMNViewer({ xml }: BPMNViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<InstanceType<typeof NavigatedViewer> | null>(null);
  const navStackRef = useRef<BreadcrumbItem[]>([]);
  const canvasRef = useRef<BpmnCanvas | null>(null);
  const destroyedRef = useRef(false);

  // Combined into one object to avoid multiple synchronous setState calls in effect body
  const [viewerState, setViewerState] = useState<{
    breadcrumbs: BreadcrumbItem[];
    isLoading: boolean;
    isEmpty: boolean;
  }>({ breadcrumbs: [], isLoading: false, isEmpty: false });

  const fitViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || destroyedRef.current) return;
    requestAnimationFrame(() => {
      if (!destroyedRef.current) {
        canvas.resized();
        canvas.zoom('fit-viewport');
      }
    });
  }, []);

  const checkEmpty = useCallback((canvas: BpmnCanvas, currentRootId: string) => {
    try {
      const reg = viewerRef.current?.get('elementRegistry') as BpmnElementRegistry | undefined;
      if (!reg) return false;
      const children = reg.filter(el =>
        el.parent?.id === currentRootId && el.type !== 'label'
      );
      return children.length === 0;
    } catch {
      return false;
    }
  }, []);

  const navigateToItem = useCallback((item: BreadcrumbItem) => {
    const canvas = canvasRef.current;
    if (!canvas || destroyedRef.current) return;
    canvas.setRootElement(item.element);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !xml || !xml.includes('bpmn:definitions')) return;

    destroyedRef.current = false;

    // Destroy previous viewer
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }
    canvasRef.current = null;
    containerRef.current.innerHTML = '';
    navStackRef.current = [];

    const viewer = new NavigatedViewer({
      container: containerRef.current,
      additionalModules: [poolGroupRendererModule],
    });
    viewerRef.current = viewer;

    (async () => {
      // Single batched state reset (inside async context, not synchronous effect body)
      setViewerState({ breadcrumbs: [], isLoading: true, isEmpty: false });
      try {
        // Repair XML before import: move orphaned process elements into their
        // SubProcess flowElements, strip empty-bounds Pool shapes, strip sopext comment.
        await viewer.importXML(repairBpmnXml(xml));
        if (destroyedRef.current) return;

        const canvas = viewer.get('canvas') as BpmnCanvas;
        canvasRef.current = canvas;

        // Hide built-in bjs-breadcrumbs to avoid duplication with our React UI
        const bjsCrumbs = canvas.getContainer().querySelector('.bjs-breadcrumbs');
        if (bjsCrumbs) (bjsCrumbs as HTMLElement).style.display = 'none';

        // Wait one frame so CSS layout is finalized before resizing
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (destroyedRef.current) return;

        canvas.resized();
        canvas.zoom('fit-viewport');

        const root = canvas.getRootElement();
        const rootItem: BreadcrumbItem = {
          id: root.id,
          name: root.businessObject?.name || 'Proses Utama',
          element: root,
        };
        navStackRef.current = [rootItem];
        setViewerState({ breadcrumbs: [rootItem], isLoading: false, isEmpty: false });

        // root.set fires when canvas root changes (drill-down ▼ button or our dblclick)
        // We guard: only treat '_plane' entries as forward navigation (SubProcess planes).
        // Any other element id = going back to a known ancestor.
        viewer.on('root.set', ({ element }: { element: { id: string; businessObject?: { name?: string } } }) => {
          if (destroyedRef.current) return;
          const stack = navStackRef.current;
          const existingIdx = stack.findIndex(b => b.id === element.id);

          let newStack: BreadcrumbItem[];
          if (existingIdx >= 0) {
            // Navigating BACK to a known breadcrumb
            newStack = stack.slice(0, existingIdx + 1);
            navStackRef.current = newStack;
            setViewerState(s => ({ ...s, breadcrumbs: [...newStack], isEmpty: false }));
          } else if (element.id?.endsWith('_plane')) {
            // Forward into a SubProcess plane
            const name = element.businessObject?.name ||
              element.id.replace(/_plane$/, '');
            newStack = [...stack, { id: element.id, name, element }];
            navStackRef.current = newStack;
            setViewerState(s => ({ ...s, breadcrumbs: [...newStack] }));

            // Check if the plane has visible elements (deferred)
            const planeCanvas = canvasRef.current;
            setTimeout(() => {
              if (!destroyedRef.current && planeCanvas) {
                const empty = checkEmpty(planeCanvas, element.id);
                setViewerState(s => ({ ...s, isEmpty: empty }));
              }
            }, 80);
          } else {
            // Non-subprocess root change — reset to single item
            const name = element.businessObject?.name || 'Proses Utama';
            const singleItem = { id: element.id, name, element };
            navStackRef.current = [singleItem];
            setViewerState(s => ({ ...s, breadcrumbs: [singleItem], isEmpty: false }));
          }

          fitViewport();
        });

        // Double-click on SubProcess → drill-down (supplements the built-in ▼ overlay)
        viewer.on('element.dblclick', ({ element }: { element: { id: string; type?: string } }) => {
          if (destroyedRef.current) return;
          if (!element.type?.includes('SubProcess')) return;
          const planeId = element.id + '_plane';
          const plane = canvas.findRoot(planeId);
          if (plane) {
            canvas.setRootElement(plane);
          }
        });

      } catch (err) {
        console.error('BPMNViewer: gagal memuat diagram:', err);
        setViewerState(s => ({ ...s, isLoading: false }));
      }
    })();

    // Dukungan sentuh: geser/pan & tap/drill di tablet (read-only).
    const detachTouch = containerRef.current ? enableTouchInteraction(containerRef.current) : undefined;

    return () => {
      destroyedRef.current = true;
      detachTouch?.();
      canvasRef.current = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [xml, fitViewport, checkEmpty]);

  const handleZoomIn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const current = canvas.zoom();
    const cx = (containerRef.current?.clientWidth || 800) / 2;
    const cy = (containerRef.current?.clientHeight || 600) / 2;
    canvas.zoom(Math.min(current * 1.25, 4), { x: cx, y: cy });
  };

  const handleZoomOut = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const current = canvas.zoom();
    const cx = (containerRef.current?.clientWidth || 800) / 2;
    const cy = (containerRef.current?.clientHeight || 600) / 2;
    canvas.zoom(Math.max(current / 1.25, 0.1), { x: cx, y: cy });
  };

  const handleZoomReset = () => {
    fitViewport();
  };

  const { breadcrumbs, isLoading, isEmpty } = viewerState;
  const insideSubProcess = breadcrumbs.length > 1;

  return (
    // absolute inset-0 fills the nearest `position: relative` ancestor,
    // bypassing any h-full percentage-height chain that could resolve to 0.
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-white">

      {/* Toolbar */}
      <div className="z-20 flex items-center justify-between border-b bg-slate-50 px-3 py-1.5 shadow-sm shrink-0">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden flex-1">
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 && <ChevronRight size={12} className="mx-0.5 text-slate-400 shrink-0" />}
              <button
                onClick={() => navigateToItem(item)}
                title={index === 0 ? 'Proses Utama' : item.name}
                className={`flex items-center gap-1 truncate max-w-40 font-medium transition-colors px-1 py-0.5 rounded ${
                  index === breadcrumbs.length - 1
                    ? 'text-blue-600 pointer-events-none'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                }`}
              >
                {index === 0 && <Home size={11} className="shrink-0" />}
                <span className="truncate">{item.name}</span>
              </button>
            </React.Fragment>
          ))}
          {insideSubProcess && (
            <span className="ml-2 text-xs text-slate-400 italic shrink-0">
              (klik breadcrumb untuk kembali)
            </span>
          )}
        </nav>

        {/* Zoom controls */}
        <div className="flex shrink-0 items-center gap-0.5 ml-2">
          <button onClick={handleZoomIn} title="Perbesar" className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={handleZoomReset} title="Sesuaikan tampilan" className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
            <Maximize2 size={13} />
          </button>
          <button onClick={handleZoomOut} title="Perkecil" className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors">
            <ZoomOut size={14} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
            <div className="text-slate-400 text-sm font-medium">Memuat diagram...</div>
          </div>
        )}

        {/* bpmn-js canvas target */}
        <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} />

        {/* Empty subprocess message */}
        {insideSubProcess && isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-white/90 border border-slate-200 rounded-xl px-6 py-4 shadow text-center max-w-xs">
              <p className="text-slate-500 text-sm font-medium">Sub-Proses ini belum memiliki konten.</p>
              <p className="text-slate-400 text-xs mt-1">Tambahkan elemen di mode Edit, lalu simpan kembali.</p>
            </div>
          </div>
        )}

        {/* Hint: how to drill into SubProcess (only on main diagram, not inside) */}
        {!insideSubProcess && !isLoading && breadcrumbs.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 text-xs text-slate-400 bg-white/80 px-2 py-1 rounded shadow-sm border border-slate-200 pointer-events-none">
            Klik ganda pada SubProcess untuk melihat isinya
          </div>
        )}
      </div>
    </div>
  );
}
