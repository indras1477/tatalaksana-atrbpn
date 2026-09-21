'use client';

/* =============================================================================
   PRATINJAU PDF TAJAM (pdf.js)
   -----------------------------------------------------------------------------
   Pengganti <iframe src="blob:...#view=FitH">: penampil PDF tersemat tiap
   peramban berbeda perilaku (Edge mengabaikan parameter zoom → sisi kanan
   terpotong; disiasati transform scale → teks buram). Komponen ini merender
   sendiri tiap halaman ke <canvas> lewat pdf.js pada resolusi layar
   (devicePixelRatio), jadi selalu pas lebar wadah DAN tetap tajam.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';

interface Props {
  /** URL PDF (object URL blob dari fetch). */
  url: string;
  className?: string;
  /** Jarak antar halaman (px). */
  jarak?: number;
}

export default function PratinjauPdf({ url, className = '', jarak = 12 }: Props) {
  const wadahRef = useRef<HTMLDivElement>(null);
  const [gagal, setGagal] = useState(false);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    const wadah = wadahRef.current;
    if (!wadah || !url) return;
    let batal = false;
    let lebarTerakhir = 0;

    const render = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc =
          new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const dok = await pdfjs.getDocument({ url }).promise;
        if (batal) return;
        const lebar = wadah.clientWidth || 600;
        lebarTerakhir = lebar;
        wadah.innerHTML = '';
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= dok.numPages; n += 1) {
          const hal = await dok.getPage(n);
          if (batal) return;
          const asli = hal.getViewport({ scale: 1 });
          const skala = lebar / asli.width;
          const vp = hal.getViewport({ scale: skala * dpr });
          const kanvas = document.createElement('canvas');
          kanvas.width = Math.floor(vp.width);
          kanvas.height = Math.floor(vp.height);
          kanvas.style.width = '100%';
          kanvas.style.display = 'block';
          kanvas.style.background = '#fff';
          kanvas.style.boxShadow = '0 1px 4px rgba(15,23,42,.18)';
          if (n > 1) kanvas.style.marginTop = `${jarak}px`;
          wadah.appendChild(kanvas);
          const ctx = kanvas.getContext('2d');
          if (!ctx) continue;
          await hal.render({ canvasContext: ctx, canvas: kanvas, viewport: vp }).promise;
        }
        if (!batal) setMemuat(false);
      } catch (e) {
        console.error('PratinjauPdf:', e);
        if (!batal) { setGagal(true); setMemuat(false); }
      }
    };
    render();

    // Render ulang bila lebar wadah berubah berarti (>8%) — mis. jendela di-resize.
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width || 0;
      if (w && lebarTerakhir && Math.abs(w - lebarTerakhir) / lebarTerakhir > 0.08) render();
    });
    ro.observe(wadah);
    return () => { batal = true; ro.disconnect(); };
  }, [url, jarak]);

  if (gagal) {
    // Cadangan terakhir: serahkan ke penampil bawaan peramban.
    return <iframe src={url} title="Pratinjau PDF" className={`w-full h-full border-0 bg-white ${className}`} />;
  }
  return (
    <div className={`relative w-full h-full overflow-y-auto ${className}`}>
      {memuat && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-400 bg-slate-50">
          Menyiapkan pratinjau…
        </div>
      )}
      <div ref={wadahRef} className="w-full" />
    </div>
  );
}
