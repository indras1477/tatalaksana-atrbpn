"use client";

import React, { useEffect, useRef } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

interface BPMNViewerProps {
  xml?: string;
}

// Tambahkan definisi tipe khusus agar ESLint dan TypeScript sama-sama senang
interface BPMNCanvas {
  zoom: (scale: string, center?: boolean) => void;
  resized: () => void;
}

export default function BPMNViewer({ xml }: BPMNViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !xml) return;

    // Inisialisasi NavigatedViewer (Read-Only tapi bisa di-Zoom & Pan)
    const viewer = new NavigatedViewer({
      container: containerRef.current,
      keyboard: { bindTo: window }
    });

    // Render XML
    viewer.importXML(xml).then(({ warnings }) => {
      if (warnings.length) console.warn('BPMN Viewer Warnings:', warnings);
      
      // PERBAIKI: Beri tahu canvas tentang ukuran kontainer dan sesuaikan viewport
      try {
        const canvas = viewer.get('canvas') as BPMNCanvas;
        canvas.resized();
        canvas.zoom('fit-viewport', true);
      } catch (err) {
        console.warn('Zoom adjustment skipped:', err);
      }
      
    }).catch((err) => {
      console.error('BPMN Viewer Error:', err);
    });

    return () => {
      viewer.destroy();
    };
  }, [xml]);

  return <div ref={containerRef} className="w-full h-full bg-slate-50 cursor-grab active:cursor-grabbing" />;
}
