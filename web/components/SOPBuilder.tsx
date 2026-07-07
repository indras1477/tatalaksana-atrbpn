"use client";

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Trash2, UserPlus, UserMinus, Save,
  Circle, Square, Diamond, Shield,
  FileSpreadsheet, ArrowDownToLine, Send, ArrowLeft, Info, MousePointer2, X, ChevronLeft, ChevronRight,
  Edit2, FileDown, Loader2
} from 'lucide-react';

const L1_OPTIONS = [
  "SEKRETARIAT JENDERAL",
  "DIREKTORAT JENDERAL TATA RUANG",
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG",
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH",
  "DIREKTORAT JENDERAL PENATAAN AGRARIA",
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN",
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG",
  "DIREKTORAT JENDERAL PENANGAN SENGKETA DAN KONFLIK PERTANAHA",
  "INSPEKTORAT JENDERAL",
  "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA",
  "SEKOLAH TINGGI PERTANAHAN NASIONAL",
];

const JENIS_SOP_OPTIONS = ["Pusat", "Kantor Wilayah", "Kantor Pertanahan"];
const KLASIFIKASI_SOP_OPTIONS = [
  "SOP Administrasi Pemerintah",
  "SOP Layanan Pertanahan",
  "SOP Layanan Tata Ruang",
  "SOP Layanan Pengaduan dan Informasi",
  "SOP Layanan Data, Keamanan dan Infrastruktur",
];

// --- HELPER ID UNIK ---
// Date.now() saja bisa bertabrakan jika dua baris dibuat dalam milidetik yang sama
// (klik cepat), menyebabkan key React duplikat & target cabang (loopTarget by id) ambigu.
let __stepIdSeq = 0;
const genStepId = () => `step-${Date.now()}-${(__stepIdSeq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// --- TIPE DATA ---
type SOPFlowSymbol = 'start' | 'process' | 'decision' | 'connector' | 'end';

interface ExtraShape {
  colIdx: number;
  symbol: SOPFlowSymbol;
  arrowDown?: boolean;
  loopTarget?: string;
  loopTargetCol?: number;
  branchSide?: 'left' | 'right';
  downText?: string;
  downTextOffset?: { x: number; y: number };
  branchText?: string;
  branchTextOffset?: { x: number; y: number };
}

interface SOPStep {
  id: string;
  kegiatan: string;
  pelaksanaCol: number; 
  symbol: SOPFlowSymbol;
  arrowDown: boolean; 
  loopTarget?: string;
  loopTargetCol?: number;
  branchSide?: 'left' | 'right';
  downText?: string;
  downTextOffset?: { x: number; y: number };
  branchText?: string;
  branchTextOffset?: { x: number; y: number };
  nomorOverride?: string;
  waktu: string;
  syarat: string;
  output: string;
  ket: string;
  isPageBreak?: boolean;
  extraShapes?: ExtraShape[];
}

export interface SOPBuilderRef {
  saveFlow: () => void;
  exportExcel: () => void;
  getSOPData: () => string;
}

export interface SOPBuilderProps {
  initialData?: string | null;
  initialTitle?: string;
  initialKey?: string;
  initialL1?: string;
  initialL2?: string;
  initialJenis?: string;
  initialKlasifikasi?: string;
  isViewOnly?: boolean;
  onSaveTrigger?: (data: string) => void;
  onSubmitTrigger?: (data: string) => void;
  onBackTrigger?: () => void;
  onDownloadPdf?: (data: string) => Promise<void> | void;
  signedCoverUrl?: string | null;
  signedCoverMime?: string;
  hasSignedCover?: boolean;
}

// --- KOMPONEN LABEL TEKS BISA DIGESER & DIEDIT ---
const DraggableLabel = ({ 
  value, defaultValue, offset, onTextChange, onOffsetChange, isViewOnly, baseStyle 
}: { 
  value?: string; defaultValue: string; offset?: {x: number, y: number}; 
  onTextChange: (val: string) => void; onOffsetChange: (off: {x: number, y: number}) => void; 
  isViewOnly: boolean; baseStyle: React.CSSProperties; 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{x: number, y: number} | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const currentPos = dragPos !== null ? dragPos : (offset || { x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isViewOnly) return;
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    setIsDragging(true);
    startPos.current = { x: e.clientX - currentPos.x, y: e.clientY - currentPos.y };
    setDragPos(currentPos);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setDragPos({ x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (dragPos !== null) {
      onOffsetChange(dragPos);
      setDragPos(null); 
    }
  };

  const displayVal = value !== undefined ? value : defaultValue;
  // Dukung multi-baris (tekan Enter) agar teks panjang bisa dipatah manual. Ukuran textarea
  // menyesuaikan: lebar = baris terpanjang, tinggi = jumlah baris.
  const lines = displayVal.split('\n');
  const maxLineLen = lines.reduce((mx, l) => Math.max(mx, l.length), 0);

  return (
    <div
      className={`absolute z-50 bg-white/90 px-1 py-0.5 rounded border pointer-events-auto flex items-center justify-center transition-colors ${isViewOnly ? 'border-transparent' : 'border-slate-300 hover:border-blue-400 cursor-move'}`}
      style={{ ...baseStyle, transform: `translate(calc(-50% + ${currentPos.x}px), calc(-50% + ${currentPos.y}px))`, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!isViewOnly && (
        <div className="w-1.5 h-3 border-l-2 border-dotted border-slate-400 mr-0.5 opacity-50 hover:opacity-100 cursor-move shrink-0" title="Tahan dan geser teks" />
      )}
      <textarea
        value={displayVal}
        onChange={e => onTextChange(e.target.value)}
        disabled={isViewOnly}
        placeholder={defaultValue}
        rows={lines.length}
        wrap="off"
        className="bg-transparent text-[9px] font-bold text-black font-bookman text-center outline-none pointer-events-auto resize-none overflow-hidden leading-tight block p-0 m-0 border-0"
        style={{ width: `${Math.max(2, maxLineLen + 1)}ch`, height: `${lines.length * 1.15 + 0.1}em` }}
      />
    </div>
  );
};


// --- KOMPONEN SVG PANAH KELUAR (ORTHOGONAL C-ROUTING KETAT) ---
const BranchArrowLocal = ({ 
  sourceIdx, targetIdx, sourceCol, targetCol, sourceSide, branchText, branchTextOffset, onBranchTextChange, onBranchOffsetChange, updateTrigger, chunkStart, chunkEnd, isPrinting, isSourceMain, isViewOnly 
}: { 
  sourceIdx: number; targetIdx: number; sourceCol: number; targetCol: number; sourceSide: 'left' | 'right'; 
  branchText?: string; branchTextOffset?: {x: number, y: number}; onBranchTextChange: (val: string)=>void; onBranchOffsetChange: (val: {x:number, y:number})=>void;
  updateTrigger: string | number; chunkStart: number; chunkEnd: number; isPrinting: boolean; isSourceMain: boolean; isViewOnly: boolean;
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [textPos, setTextPos] = useState({ x: 0, y: 0, show: false });
  const [connPos, setConnPos] = useState({ x: 0, y: 0, type: 'none' });
  const [headPos, setHeadPos] = useState<{ x: number; y: number; dir: 'none' | 'left' | 'right' }>({ x: 0, y: 0, dir: 'none' });

  useEffect(() => {
    let reqId: number = 0;

    const update = () => {
      const srcShape = document.getElementById(isSourceMain ? `shape-${sourceIdx}` : `shape-extra-${sourceIdx}-${sourceCol}`);
      const tgtCell = document.getElementById(`cell-${targetIdx}-${targetCol}`);
      const svgEl = svgRef.current;
      const pathEl = pathRef.current;

      if (!srcShape || !tgtCell || !svgEl || !pathEl) {
        setTextPos({ x: 0, y: 0, show: false });
        setConnPos({ x: 0, y: 0, type: 'none' });
        setHeadPos({ x: 0, y: 0, dir: 'none' });
        if (pathEl) pathEl.removeAttribute('d');
        return;
      }

      const srcRect = srcShape.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect(); 
      const tgtRect = tgtCell.getBoundingClientRect();

      if (srcRect.width === 0 || svgRect.width === 0) return;

      const isLeft = sourceSide === 'left';
      const startY = (srcRect.top + srcRect.height / 2) - svgRect.top;
      const startX = isLeft ? srcRect.left - svgRect.left : srcRect.right - svgRect.left;
      
      const exactTgtShape = document.getElementById(`shape-extra-${targetIdx}-${targetCol}`) || document.getElementById(`shape-${targetIdx}`);
      const exactTgtRect = exactTgtShape ? exactTgtShape.getBoundingClientRect() : tgtRect;

      const dynamicOffset = 12 + ((sourceIdx * 3) % 10);
      let gutterX;
      if (isLeft) {
        const minLeftShape = Math.min(srcRect.left, exactTgtRect.left) - svgRect.left;
        gutterX = minLeftShape - dynamicOffset;
      } else {
        const maxRightShape = Math.max(srcRect.right, exactTgtRect.right) - svgRect.left;
        gutterX = maxRightShape + dynamicOffset;
      }

      const isOffPage = targetIdx < chunkStart || targetIdx > chunkEnd;

      if (!isOffPage && sourceIdx === targetIdx) {
        const enterFromLeft = targetCol > sourceCol;
        const endX = enterFromLeft ? exactTgtRect.left - svgRect.left - 2 : exactTgtRect.right - svgRect.left + 2;
        
        if (Math.abs(targetCol - sourceCol) > 1) {
          const stepX1 = startX + (isLeft ? -12 : 12);
          const stepX2 = endX + (enterFromLeft ? -12 : 12);
          const avoidY = startY + 25; 
          pathEl.setAttribute('d', `M ${startX} ${startY} L ${stepX1} ${startY} L ${stepX1} ${avoidY} L ${stepX2} ${avoidY} L ${stepX2} ${startY} L ${endX} ${startY}`);
        } else {
          pathEl.setAttribute('d', `M ${startX} ${startY} L ${endX} ${startY}`);
        }
        
        setTextPos({ x: startX + (isLeft ? -18 : 18), y: startY, show: true });
        setConnPos({ x: 0, y: 0, type: 'none' });
        setHeadPos({ x: endX, y: startY, dir: enterFromLeft ? 'right' : 'left' });
        return;
      }

      if (isOffPage) {
        const isUpward = targetIdx < sourceIdx;
        const pageContainer = svgEl.closest('.page-container');
        const pageRect = pageContainer ? pageContainer.getBoundingClientRect() : svgRect;
        const endY = isUpward ? pageRect.top - svgRect.top + 45 : pageRect.bottom - svgRect.top - 25;

        pathEl.setAttribute('d', `M ${startX} ${startY} L ${gutterX} ${startY} L ${gutterX} ${endY}`);
        setTextPos({ x: startX + (isLeft ? -18 : 18), y: startY, show: true });
        setConnPos({ x: gutterX, y: endY, type: isUpward ? 'to-top' : 'to-bottom' });
        setHeadPos({ x: 0, y: 0, dir: 'none' });
        return;
      }

      const endY = (exactTgtRect.top + exactTgtRect.height / 2) - svgRect.top;
      const endX = isLeft ? exactTgtRect.left - svgRect.left - 2 : exactTgtRect.right - svgRect.left + 2;

      pathEl.setAttribute('d', `M ${startX} ${startY} L ${gutterX} ${startY} L ${gutterX} ${endY} L ${endX} ${endY}`);
      setTextPos({ x: startX + (isLeft ? -18 : 18), y: startY, show: true });
      setConnPos({ x: 0, y: 0, type: 'none' });
      setHeadPos({ x: endX, y: endY, dir: isLeft ? 'right' : 'left' });
    };

    update(); 
    const t1 = setTimeout(update, 100);
    const printTimers: NodeJS.Timeout[] = [];
    if (isPrinting) for (let i = 1; i <= 10; i++) printTimers.push(setTimeout(update, i * 150));

    const throttledUpdate = () => { cancelAnimationFrame(reqId); reqId = requestAnimationFrame(update); };
    window.addEventListener('resize', throttledUpdate);
    const tbody = svgRef.current?.closest('tbody');
    let ro: ResizeObserver | null = null;
    if (tbody) { ro = new ResizeObserver(throttledUpdate); ro.observe(tbody); }

    return () => {
      clearTimeout(t1); printTimers.forEach(clearTimeout);
      window.removeEventListener('resize', throttledUpdate);
      if (ro) ro.disconnect(); cancelAnimationFrame(reqId);
    };
  }, [sourceIdx, targetIdx, updateTrigger, chunkStart, chunkEnd, isPrinting, sourceCol, targetCol, sourceSide, isSourceMain]);

  return (
    <>
      <svg ref={svgRef} className={`absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none ${isPrinting ? 'z-50' : 'z-40'}`}>
        <path ref={pathRef} fill="none" stroke="black" strokeWidth="2" shapeRendering="crispEdges" />
        {/* Kepala panah horizontal (polygon ukuran tetap — marker SVG tidak ter-render di PDF cetak Chrome
            dan ikut membesar mengikuti strokeWidth). Ukuran seragam dengan panah lain. */}
        {headPos.dir === 'right' && <polygon points={`${headPos.x},${headPos.y} ${headPos.x-9},${headPos.y-4.5} ${headPos.x-9},${headPos.y+4.5}`} fill="black" />}
        {headPos.dir === 'left' && <polygon points={`${headPos.x},${headPos.y} ${headPos.x+9},${headPos.y-4.5} ${headPos.x+9},${headPos.y+4.5}`} fill="black" />}
        {connPos.type === 'to-bottom' && <polygon points={`${connPos.x-8},${connPos.y} ${connPos.x+8},${connPos.y} ${connPos.x+8},${connPos.y+9} ${connPos.x},${connPos.y+18} ${connPos.x-8},${connPos.y+9}`} fill="white" stroke="black" strokeWidth="2" />}
        {connPos.type === 'to-top' && <polygon points={`${connPos.x-8},${connPos.y} ${connPos.x+8},${connPos.y} ${connPos.x+8},${connPos.y-9} ${connPos.x},${connPos.y-18} ${connPos.x-8},${connPos.y-9}`} fill="white" stroke="black" strokeWidth="2" />}
      </svg>
      {textPos.show && (
        <DraggableLabel 
          value={branchText} defaultValue="Tidak" 
          offset={branchTextOffset} onTextChange={onBranchTextChange} onOffsetChange={onBranchOffsetChange}
          isViewOnly={isViewOnly} baseStyle={{ left: textPos.x, top: textPos.y }} 
        />
      )}
    </>
  );
};

// --- KOMPONEN SVG PANAH MASUK ---
const IncomingArrowLocal = ({ 
  sourceIdx, targetIdx, sourceCol, targetCol, sourceSide, updateTrigger, isPrinting 
}: { 
  sourceIdx: number; targetIdx: number; sourceCol: number; targetCol: number; sourceSide: 'left' | 'right'; updateTrigger: string | number; isPrinting: boolean;
}) => {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [connPos, setConnPos] = useState({ x: 0, y: 0, type: 'none' });
  const [headPos, setHeadPos] = useState<{ x: number; y: number; dir: 'none' | 'left' | 'right' }>({ x: 0, y: 0, dir: 'none' });

  useEffect(() => {
    let reqId: number = 0;
    const update = () => {
      const tgtCell = document.getElementById(`cell-${targetIdx}-${targetCol}`);
      const svgEl = svgRef.current;
      const pathEl = pathRef.current;
      if (!tgtCell || !svgEl || !pathEl) { setHeadPos({ x: 0, y: 0, dir: 'none' }); return; }

      const tgtRect = tgtCell.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect(); 
      const pageContainer = svgEl.closest('.page-container');
      const pageRect = pageContainer ? pageContainer.getBoundingClientRect() : svgRect;
      if (tgtRect.width === 0 || svgRect.width === 0) return;

      const exactTgtShape = document.getElementById(`shape-extra-${targetIdx}-${targetCol}`) || document.getElementById(`shape-${targetIdx}`);
      const exactTgtRect = exactTgtShape ? exactTgtShape.getBoundingClientRect() : tgtRect;

      const isLeft = sourceSide === 'left';
      const dynamicOffset = 12 + ((sourceIdx * 3) % 10);
      let gutterX;
      if (isLeft) gutterX = exactTgtRect.left - svgRect.left - dynamicOffset;
      else gutterX = exactTgtRect.right - svgRect.left + dynamicOffset;

      const isFromAbove = sourceIdx < targetIdx;
      const startY = isFromAbove ? pageRect.top - svgRect.top + 45 : pageRect.bottom - svgRect.top - 25;
      const pathStartY = isFromAbove ? startY + 18 : startY - 18; 

      const endY = (exactTgtRect.top + exactTgtRect.height / 2) - svgRect.top;
      const endX = isLeft ? exactTgtRect.left - svgRect.left - 2 : exactTgtRect.right - svgRect.left + 2;

      pathEl.setAttribute('d', `M ${gutterX} ${pathStartY} L ${gutterX} ${endY} L ${endX} ${endY}`);
      setConnPos({ x: gutterX, y: startY, type: isFromAbove ? 'from-top' : 'from-bottom' });
      setHeadPos({ x: endX, y: endY, dir: isLeft ? 'right' : 'left' });
    };

    update(); 
    const t1 = setTimeout(update, 100);
    const printTimers: NodeJS.Timeout[] = [];
    if (isPrinting) for (let i = 1; i <= 10; i++) printTimers.push(setTimeout(update, i * 150));

    const throttledUpdate = () => { cancelAnimationFrame(reqId); reqId = requestAnimationFrame(update); };
    window.addEventListener('resize', throttledUpdate);
    const tbody = svgRef.current?.closest('tbody');
    let ro: ResizeObserver | null = null;
    if (tbody) { ro = new ResizeObserver(throttledUpdate); ro.observe(tbody); }

    return () => {
      clearTimeout(t1); printTimers.forEach(clearTimeout);
      window.removeEventListener('resize', throttledUpdate);
      if (ro) ro.disconnect(); cancelAnimationFrame(reqId);
    };
  }, [sourceIdx, targetIdx, sourceCol, targetCol, sourceSide, isPrinting, updateTrigger]);

  return (
    <svg ref={svgRef} className={`absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none ${isPrinting ? 'z-50' : 'z-40'}`}>
      <path ref={pathRef} fill="none" stroke="black" strokeWidth="2" shapeRendering="crispEdges" />
      {headPos.dir === 'right' && <polygon points={`${headPos.x},${headPos.y} ${headPos.x-9},${headPos.y-4.5} ${headPos.x-9},${headPos.y+4.5}`} fill="black" />}
      {headPos.dir === 'left' && <polygon points={`${headPos.x},${headPos.y} ${headPos.x+9},${headPos.y-4.5} ${headPos.x+9},${headPos.y+4.5}`} fill="black" />}
      {connPos.type === 'from-top' && <polygon points={`${connPos.x-8},${connPos.y} ${connPos.x+8},${connPos.y} ${connPos.x+8},${connPos.y+9} ${connPos.x},${connPos.y+18} ${connPos.x-8},${connPos.y+9}`} fill="white" stroke="black" strokeWidth="2" />}
      {connPos.type === 'from-bottom' && <polygon points={`${connPos.x-8},${connPos.y} ${connPos.x+8},${connPos.y} ${connPos.x+8},${connPos.y-9} ${connPos.x},${connPos.y-18} ${connPos.x-8},${connPos.y-9}`} fill="white" stroke="black" strokeWidth="2" />}
    </svg>
  );
};

// --- KOMPONEN EDITABLE CELL ---
const EditableCell = ({ value, onChange, className, placeholder, center = false, justify = false }: { value: string, onChange: (val: string) => void, className?: string, placeholder?: string, center?: boolean, justify?: boolean }) => {
  const divRef = useRef<HTMLDivElement>(null);

  const formatContent = (val: string) => {
    if (!divRef.current) return;
    if (!val) { divRef.current.innerHTML = ''; return; }
    const lines = val.split('\n');
    const listPrefixRe = /^([0-9a-zA-Z]+\.\s+|-\s+)/;
    const hasList = lines.some(line => listPrefixRe.test(line));
    if (hasList) {
      // Samakan jarak indentasi semua butir bernomor: gunakan lebar prefix terpanjang
      // (mis. "10. ") dalam satuan 'ch' agar baris lanjutan & butir yang wrap tersusun rapi sejajar.
      const maxPrefix = lines.reduce((mx, line) => {
        const m = line.match(listPrefixRe);
        return m ? Math.max(mx, m[1].length) : mx;
      }, 0);
      // Lebar kolom nomor = panjang prefix terpanjang (satuan 'ch'). Karena '.' & spasi
      // lebih sempit dari '0', ini sudah menyisakan jeda ~1ch antara nomor dan teks.
      const indent = `${maxPrefix}ch`;
      let inList = false;
      const escapeHtml = (text: string) => {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, (m) => map[m] || m);
      };
      const formattedHTML = lines.map(line => {
        const m = line.match(listPrefixRe);
        if (m) {
          inList = true;
          const pfx = escapeHtml(m[1]);
          const rest = escapeHtml(line.slice(m[1].length));
          // Nomor ditaruh di marker inline-block lebar-tetap (kolom nomor) + margin negatif:
          // semua butir mulai teksnya di kolom yang sama, dan spasi setelah nomor TIDAK ikut
          // diregang oleh justify (mirip penomoran Word).
          return `<div style="padding-left: ${indent};"><span style="display: inline-block; width: ${indent}; margin-left: -${indent}; white-space: pre;">${pfx}</span>${rest}</div>`;
        } else if (line.trim() === '') {
          inList = false; return `<div><br></div>`;
        } else {
          return `<div style="${inList ? `padding-left: ${indent};` : ''}">${escapeHtml(line)}</div>`;
        }
      }).join('');
      divRef.current.innerHTML = formattedHTML;
    } else { divRef.current.innerText = val; }
  };

  useEffect(() => { if (divRef.current && document.activeElement !== divRef.current) formatContent(value); }, [value]);
  const handleInput = (e: React.FormEvent<HTMLDivElement>) => onChange(e.currentTarget.innerText);
  const handleBlur = () => formatContent(value);

  // Ambil teks baris tempat kursor berada + isi setelah prefix (untuk auto-numbering).
  const getCurrentLine = (root: HTMLDivElement) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    let lineEl: Node = range.startContainer;
    if (lineEl !== root) {
      while (lineEl.parentNode && lineEl.parentNode !== root) lineEl = lineEl.parentNode;
    }
    return { lineEl, lineText: lineEl.textContent || '' };
  };

  // Auto-numbering ala editor: Enter pada baris berdaftar → lanjut nomor/huruf/bullet berikutnya.
  // Enter pada butir kosong → hentikan daftar (bersihkan prefix baris ini).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || (e.nativeEvent as { isComposing?: boolean }).isComposing) return;
    if (!divRef.current) return;
    const info = getCurrentLine(divRef.current);
    if (!info) return;
    const { lineText } = info;

    let prefix: string | null = null;
    let contentAfterLen = 0;
    const numMatch = lineText.match(/^(\s*)(\d+)\.\s/);
    const alphaMatch = lineText.match(/^(\s*)([a-zA-Z])\.\s/);
    const dashMatch = lineText.match(/^(\s*)-\s/);
    if (numMatch) {
      prefix = `${numMatch[1]}${parseInt(numMatch[2], 10) + 1}. `;
      contentAfterLen = lineText.slice(numMatch[0].length).trim().length;
    } else if (alphaMatch) {
      const c = alphaMatch[2];
      const next = c === 'z' ? 'aa' : c === 'Z' ? 'AA' : String.fromCharCode(c.charCodeAt(0) + 1);
      prefix = `${alphaMatch[1]}${next}. `;
      contentAfterLen = lineText.slice(alphaMatch[0].length).trim().length;
    } else if (dashMatch) {
      prefix = `${dashMatch[1]}- `;
      contentAfterLen = lineText.slice(dashMatch[0].length).trim().length;
    }
    if (!prefix) return; // bukan baris daftar → Enter biasa

    e.preventDefault();
    if (contentAfterLen === 0) {
      // Butir kosong → keluar dari daftar: kosongkan prefix pada baris ini.
      const sel = window.getSelection();
      if (sel) {
        const lineRange = document.createRange();
        lineRange.selectNodeContents(info.lineEl);
        sel.removeAllRanges();
        sel.addRange(lineRange);
        document.execCommand('delete');
      }
    } else {
      document.execCommand('insertParagraph');
      document.execCommand('insertText', false, prefix);
    }
    onChange(divRef.current.innerText);
  };

  return (
    <div ref={divRef} contentEditable suppressContentEditableWarning onInput={handleInput} onKeyDown={handleKeyDown} onBlur={handleBlur} className={`outline-none bg-transparent w-full min-h-6 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 wrap-break-word whitespace-pre-wrap ${center ? 'text-center' : justify ? 'text-justify' : 'text-left'} ${className || ''}`} data-placeholder={placeholder} />
  );
};

// --- KOMPONEN UTAMA (SOP BUILDER) ---
const SOPBuilder = forwardRef<SOPBuilderRef, SOPBuilderProps>(({
  initialData, initialTitle, initialKey, initialL1, initialL2, initialJenis, initialKlasifikasi,
  isViewOnly = false, onSaveTrigger, onSubmitTrigger, onBackTrigger, onDownloadPdf,
  signedCoverUrl = null, signedCoverMime = '', hasSignedCover = false
}, ref) => {
  const searchParams = useSearchParams();

  const parsedData = useMemo(() => {
    if (!initialData) return null;
    try { return JSON.parse(initialData); } catch { return null; }
  }, [initialData]);

  const [judul, setJudul] = useState<string>(parsedData?.judul || initialTitle || searchParams.get('title') || '');
  const [nomor, setNomor] = useState<string>(parsedData?.nomor || initialKey || searchParams.get('key') || '');
  const [unitKerja, setUnitKerja] = useState<string>(parsedData?.unitKerja || initialL1 || searchParams.get('l1') || 'Sekretariat Jenderal');
  const [subUnitKerja, setSubUnitKerja] = useState<string>(parsedData?.subUnitKerja || initialL2 || searchParams.get('l2') || '');
  const [jenisSOP, setJenisSOP] = useState<string>(parsedData?.jenisSOP || initialJenis || searchParams.get('jenis') || '');
  const [klasifikasiSOP, setKlasifikasiSOP] = useState<string>(parsedData?.klasifikasiSOP || initialKlasifikasi || searchParams.get('klasifikasi') || ''); 
  
  const [pelaksanaHeaders, setPelaksanaHeaders] = useState<string[][]>(() => {
    const init = parsedData?.pelaksanaHeaders;
    if (init && Array.isArray(init) && init.length > 0) return typeof init[0] === 'string' ? [init as string[]] : init as string[][];
    return [['', '', '']];
  });
  const colCount = pelaksanaHeaders[0]?.length || 3;

  const [jabatanPengesah, setJabatanPengesah] = useState<string>(parsedData?.jabatanPengesah || searchParams.get('jabatan') || '');
  const [namaPengesah, setNamaPengesah] = useState<string>(parsedData?.namaPengesah || searchParams.get('nama') || '');
  const [nipPengesah, setNipPengesah] = useState<string>(parsedData?.nipPengesah || searchParams.get('nip') || '');
  const [tglPembuatan, setTglPembuatan] = useState<string>(parsedData?.tglPembuatan || '');
  const [tglRevisi, setTglRevisi] = useState<string>(parsedData?.tglRevisi || '');
  const [tglEfektif, setTglEfektif] = useState<string>(parsedData?.tglEfektif || '');
  const [dasarHukum, setDasarHukum] = useState<string>(parsedData?.dasarHukum || '1. ');
  const [kualifikasi, setKualifikasi] = useState<string>(parsedData?.kualifikasi || '1. ');
  const [keterkaitan, setKeterkaitan] = useState<string>(parsedData?.keterkaitan || '1. ');
  const [peralatan, setPeralatan] = useState<string>(parsedData?.peralatan || '1. ');
  const [peringatan, setPeringatan] = useState<string>(parsedData?.peringatan || '1. ');
  const [pencatatan, setPencatatan] = useState<string>(parsedData?.pencatatan || '1. ');

  const [steps, setSteps] = useState<SOPStep[]>(parsedData?.steps || [
    { id: genStepId(), kegiatan: '', pelaksanaCol: 0, symbol: 'start', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' }
  ]);

  const [coverBreaks, setCoverBreaks] = useState<{ [key: number]: boolean }>(parsedData?.coverBreaks || { 1: false, 2: false });
  const [activeTab, setActiveTab] = useState<'cover' | number>('cover');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoForm, setInfoForm] = useState({ judul: '', nomor: '', unitKerja: '', subUnitKerja: '', jenisSOP: '', klasifikasiSOP: '' });
  
  const [activeTool, setActiveTool] = useState<SOPFlowSymbol | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<{ row: number, col: number } | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(true);
  const [openShapeMenu, setOpenShapeMenu] = useState<{ row: number, col: number } | null>(null);

  // Posisi vertikal palet "Bentuk Ekstra" menyesuaikan tinggi toolbar (yang membungkus di
  // layar kecil) agar tidak pernah menabrak tombol toolbar di atasnya.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [paletteTopPx, setPaletteTopPx] = useState<number>(112);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const measure = () => setPaletteTopPx(Math.round(el.getBoundingClientRect().bottom) + 12);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, []);

  const effectiveIsViewOnly = isViewOnly || isPrinting;

  // AUTO-FLOW COVER: bila sebuah halaman cover melebihi tinggi kertas F4 (215mm, sudah termasuk
  // margin bawah 6mm), pindahkan baris terakhirnya ke halaman berikutnya secara otomatis. Hanya
  // MENAMBAH pemisah (tak pernah menghapus) → pasti konvergen. Debounce 500ms agar tak memindah
  // halaman saat pengguna masih mengetik.
  useEffect(() => {
    if (activeTab !== 'cover' || effectiveIsViewOnly) return;
    const F4_PX = 813; // 215mm @ 96dpi (border-box: sudah termasuk padding/margin 6mm)
    const t = setTimeout(() => {
      // Susun ulang urutan potongan (chunk) id baris cover dari coverBreaks (id baris: 1,2,3).
      const idChunks: number[][] = [];
      let cur: number[] = [];
      [1, 2, 3].forEach(id => { cur.push(id); if (coverBreaks[id]) { idChunks.push(cur); cur = []; } });
      if (cur.length) idChunks.push(cur);

      const containers = Array.from(document.querySelectorAll<HTMLElement>('.cover-page-container'));
      for (let i = 0; i < containers.length; i++) {
        if (containers[i].offsetHeight > F4_PX + 6) {
          const chunk = idChunks[i];
          if (chunk && chunk.length > 1) {
            const secondLast = chunk[chunk.length - 2];
            if (!coverBreaks[secondLast]) {
              setCoverBreaks(prev => ({ ...prev, [secondLast]: true }));
              return; // satu pemisah per siklus; effect jalan lagi setelah state berubah
            }
          }
        }
      }
    }, 500);
    return () => clearTimeout(t);
  }, [activeTab, effectiveIsViewOnly, coverBreaks, dasarHukum, kualifikasi, keterkaitan, peralatan, peringatan, pencatatan, colCount]);

  const displayNumbers = useMemo(() => {
    let counter = 1;
    return steps.map((step) => {
      if (step.nomorOverride !== undefined) {
        if (step.nomorOverride.trim() === '') return '';
        const match = step.nomorOverride.match(/^(\d+)/);
        if (match) counter = parseInt(match[1], 10) + 1; 
        return step.nomorOverride;
      }
      return String(counter++);
    });
  }, [steps]);

  const stepToChunkMap = useMemo(() => {
    const map = new Map<number, number>();
    let cIdx = 0; let cSize = 0;
    steps.forEach((step, idx) => {
      map.set(idx, cIdx);
      cSize++;
      if (step.isPageBreak || cSize >= 6) { cIdx++; cSize = 0; }
    });
    return map;
  }, [steps]);

  const incomingArrowsMap = useMemo(() => {
    const map = new Map<number, { srcRow: number, srcCol: number, side: 'left'|'right', targetCol: number }[]>();
    
    const addIncoming = (srcRow: number, srcCol: number, loopTargetIdOrNum: string, side: 'left'|'right', targetColFallback: number) => {
      let tIdx = steps.findIndex(s => s.id === loopTargetIdOrNum);
      if (tIdx === -1) tIdx = displayNumbers.findIndex((n) => n !== '' && n === loopTargetIdOrNum);
      if (tIdx === -1 && !isNaN(parseInt(loopTargetIdOrNum))) tIdx = parseInt(loopTargetIdOrNum) - 1;
      
      if (tIdx !== -1) {
        const srcChunk = stepToChunkMap.get(srcRow);
        const tgtChunk = stepToChunkMap.get(tIdx);
        if (srcChunk !== tgtChunk) {
          if (!map.has(tIdx)) map.set(tIdx, []);
          const tCol = steps[tIdx]?.pelaksanaCol ?? targetColFallback;
          map.get(tIdx)!.push({ srcRow, srcCol, side, targetCol: tCol });
        }
      }
    };

    steps.forEach((step, idx) => {
      if (step.loopTarget) addIncoming(idx, step.pelaksanaCol, step.loopTarget, step.branchSide || 'right', step.loopTargetCol ?? step.pelaksanaCol);
      if (step.extraShapes) {
        step.extraShapes.forEach(ex => {
          if (ex.loopTarget) addIncoming(idx, ex.colIdx, ex.loopTarget, ex.branchSide || 'right', ex.loopTargetCol ?? ex.colIdx);
        });
      }
    });
    return map;
  }, [steps, displayNumbers, stepToChunkMap]);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  // Tutup popup ganti bentuk saat klik/ketuk di luar area bentuk atau menekan Escape.
  // Pakai 'pointerdown' agar konsisten di mouse (desktop) maupun sentuhan (tablet/iPad).
  useEffect(() => {
    if (!openShapeMenu) return;
    const handlePointer = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.shape-menu-trigger') || target.closest('.shape-menu-popup')) return;
      setOpenShapeMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenShapeMenu(null); };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openShapeMenu]);

  useEffect(() => {
    if (!initialData && typeof window !== 'undefined') {
      const savedData = localStorage.getItem('e-sop-draft-local');
      if (savedData) {
        try {
          const pd = JSON.parse(savedData);
          if (pd.judul) setJudul(pd.judul);
          if (pd.nomor) setNomor(pd.nomor);
          if (pd.unitKerja) setUnitKerja(pd.unitKerja);
          if (pd.subUnitKerja) setSubUnitKerja(pd.subUnitKerja);
          if (pd.jenisSOP) setJenisSOP(pd.jenisSOP);
          if (pd.klasifikasiSOP) setKlasifikasiSOP(pd.klasifikasiSOP);
          if (pd.pelaksanaHeaders && pd.pelaksanaHeaders.length > 0) setPelaksanaHeaders(typeof pd.pelaksanaHeaders[0] === 'string' ? [pd.pelaksanaHeaders] : pd.pelaksanaHeaders);
          if (pd.jabatanPengesah) setJabatanPengesah(pd.jabatanPengesah);
          if (pd.namaPengesah) setNamaPengesah(pd.namaPengesah);
          if (pd.nipPengesah) setNipPengesah(pd.nipPengesah);
          if (pd.tglPembuatan) setTglPembuatan(pd.tglPembuatan);
          if (pd.tglRevisi) setTglRevisi(pd.tglRevisi);
          if (pd.tglEfektif) setTglEfektif(pd.tglEfektif);
          if (pd.dasarHukum) setDasarHukum(pd.dasarHukum);
          if (pd.kualifikasi) setKualifikasi(pd.kualifikasi);
          if (pd.keterkaitan) setKeterkaitan(pd.keterkaitan);
          if (pd.peralatan) setPeralatan(pd.peralatan);
          if (pd.peringatan) setPeringatan(pd.peringatan);
          if (pd.pencatatan) setPencatatan(pd.pencatatan);
          if (pd.steps) setSteps(pd.steps);
          if (pd.coverBreaks) setCoverBreaks(pd.coverBreaks);
        } catch (error) { console.error("Gagal meload data lokal", error); }
      }
    }
  }, [initialData]);

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.cdnfonts.com/css/bookman-old-style');
      .font-bookman, .font-bookman * { font-family: 'Bookman Old Style', 'Bookman', serif !important; }
      @page { size: 330mm 215mm landscape; margin: 0; }
      @media print {
        html, body, #__next, main, [data-reactroot] {
          height: auto !important; min-height: 100% !important; max-height: none !important;
          overflow: visible !important; margin: 0 !important; padding: 0 !important;
          background: white !important; position: static !important;
        }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        .no-print { display: none !important; }
        aside, header, footer { display: none !important; }
        .page-container, .cover-page-container { 
          margin: 0 !important; box-shadow: none !important; border: none !important; 
          page-break-after: always !important; width: 330mm !important; 
          padding: 6mm !important; display: flex !important; flex-direction: column !important;
          box-sizing: border-box !important; overflow: visible !important; 
        }
        .page-container { height: 215mm !important; overflow: hidden !important; }
        .cover-page-container { min-height: 215mm !important; height: auto !important; }
        /* Cegah halaman kosong terakhir: page-break-after: always ikut memicu break setelah
           halaman terakhir → 1 halaman F4 kosong. Halaman terakhir tak boleh break-after. */
        .last-print-page { page-break-after: avoid !important; break-after: avoid !important; }
        table { display: table !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
        thead { display: table-header-group !important; } tbody { display: table-row-group !important; }
        tr { display: table-row !important; page-break-inside: avoid !important; }
        td, th { display: table-cell !important; border: 2px solid black !important; }
        [contenteditable]:empty:before { content: '' !important; display: none !important; }
        svg { max-width: 100% !important; overflow: visible !important; }
      }
      .paper-f4-landscape { width: 330mm; min-height: 215mm; background: white; margin: 0 auto; }
      .paper-f4-landscape-auto { width: 330mm; min-height: 215mm; height: auto; background: white; margin: 0 auto; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const getSOPData = () => JSON.stringify({ judul, nomor, unitKerja, subUnitKerja, jenisSOP, klasifikasiSOP, pelaksanaHeaders, jabatanPengesah, namaPengesah, nipPengesah, tglPembuatan, tglRevisi, tglEfektif, dasarHukum, kualifikasi, keterkaitan, peralatan, peringatan, pencatatan, steps, coverBreaks });

  const handleSaveFlow = (silent = false) => {
    const data = getSOPData();
    try {
      localStorage.setItem('e-sop-draft-local', data);
      if (onSaveTrigger) onSaveTrigger(data);
      if (!silent) alert("SOP berhasil disimpan!");
    } catch { if (!silent) alert("Gagal menyimpan SOP."); }
  };

  const handleSubmitOrtala = () => {
    handleSaveFlow(true); 
    if (onSubmitTrigger) onSubmitTrigger(getSOPData());
    else alert("Simulasi Terkirim! Data siap diluncurkan ke API Biro Ortala MR.");
  };

  // Unduh PDF VEKTOR F4: disimpan dulu lalu dirender di server (headless Chrome) pada ukuran
  // 330x215mm persis, menghasilkan PDF vektor (teks bisa diseleksi) yang diunduh langsung.
  const handleDownloadPDF = async () => {
    if (isExporting) return;
    if (!onDownloadPdf) { alert('Fitur unduh PDF tidak tersedia pada mode ini.'); return; }
    setIsExporting(true);
    try {
      await onDownloadPdf(getSOPData());
    } catch (e) {
      const msg = e instanceof Error ? (e.message || e.name) : String(e);
      alert('Gagal membuat PDF: ' + msg);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
    const getExcelSymbol = (symbolType: SOPFlowSymbol) => {
      switch (symbolType) {
        case 'decision': return '◇'; 
        case 'start': case 'end': return 'O'; 
        case 'connector': return '⭘'; 
        default: return 'V'; 
      }
    };
    const topHeaders = pelaksanaHeaders[0] || Array(colCount).fill('');
    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><style>table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11pt; table-layout: fixed; } th, td { border: 1px solid black; padding: 6px; vertical-align: top; white-space: normal; word-wrap: break-word; } .col-no { width: 40px; } .col-text { width: 362px; } .col-pelaksana { width: 80px; text-align: center; } .col-waktu { width: 100px; text-align: center; } th { background-color: #e2e8f0; font-weight: bold; text-align: center; vertical-align: middle; } td { mso-number-format: "\\@"; } br { mso-data-placement: same-cell; }</style></head>
      <body><table><colgroup><col class="col-no"><col class="col-text">${Array(colCount).fill(0).map(() => `<col class="col-pelaksana">`).join('')}<col class="col-text"><col class="col-waktu"><col class="col-text"><col class="col-text"></colgroup>
      <thead><tr><th rowspan="2">No</th><th rowspan="2">Kegiatan</th><th colspan="${colCount}">Pelaksana</th><th colspan="3">Mutu Baku</th><th rowspan="2">Keterangan</th></tr>
      <tr>${topHeaders.map(h => `<th>${h || '-'}</th>`).join('')}<th>Kelengkapan</th><th>WAKTU<br>(MENIT)</th><th>Output</th></tr></thead>
      <tbody>${chunkedSteps.map((chunk, chunkIdx) => {
        const currentH = pelaksanaHeaders[chunkIdx] || Array(colCount).fill('');
        let startIndex = 0; for(let i=0; i<chunkIdx; i++) startIndex += chunkedSteps[i].length;
        const chunkRows = chunk.map((step, localIdx) => {
          const absIdx = startIndex + localIdx;
          return `<tr><td style="text-align: center; vertical-align: middle;">${displayNumbers[absIdx] || ""}</td><td>${step.kegiatan.replace(/\n/g, '<br>')}</td>${currentH.map((_, i) => `<td style="text-align: center; vertical-align: middle; font-size: 14pt;">${step.pelaksanaCol === i ? getExcelSymbol(step.symbol) : ''}</td>`).join('')}<td>${step.syarat.replace(/\n/g, '<br>')}</td><td style="text-align: center; vertical-align: middle;">${step.waktu.replace(/\n/g, '<br>')}</td><td>${step.output.replace(/\n/g, '<br>')}</td><td>${step.ket.replace(/\n/g, '<br>')}</td></tr>`;
        }).join('');
        return (chunkIdx === 0 ? '' : `<tr><th colspan="2" style="background-color: #f8fafc; font-size: 9pt;">[Alur ${chunkIdx + 1}]</th>${currentH.map(h => `<th style="background-color: #f8fafc; font-size: 9pt;">${h || '-'}</th>`).join('')}<th colspan="4" style="background-color: #f8fafc;"></th></tr>`) + chunkRows;
      }).join('')}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `SOP_${judul || 'Draft'}.xls`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleGoBack = () => {
    if (!isViewOnly) if (!window.confirm("Yakin ingin kembali? Pastikan Anda sudah menyimpan dokumen ini agar data tidak hilang.")) return;
    if (onBackTrigger) onBackTrigger(); else window.location.href = '/e-sop-atrbpn/sop'; 
  };

  const chunkedSteps = useMemo(() => {
    const chunks: SOPStep[][] = [];
    let currentChunk: SOPStep[] = [];
    steps.forEach((step) => {
      currentChunk.push(step);
      if (step.isPageBreak || currentChunk.length >= 6) { chunks.push(currentChunk); currentChunk = []; }
    });
    if (currentChunk.length > 0) chunks.push(currentChunk);
    return chunks;
  }, [steps]);

  useImperativeHandle(ref, () => ({ saveFlow: () => handleSaveFlow(false), exportExcel: handleExportExcel, getSOPData: getSOPData }));

  const handleHeaderChange = (chunkIdx: number, colIdx: number, val: string) => {
    setPelaksanaHeaders(prev => {
      const next = [...prev];
      while (next.length <= chunkIdx) next.push(Array(colCount).fill(''));
      next[chunkIdx] = [...next[chunkIdx]]; next[chunkIdx][colIdx] = val.toUpperCase(); return next;
    });
  };

  const addColumn = () => setPelaksanaHeaders(prev => prev.map(row => [...row, '']));
  const removeColumn = (colIdxToRemove: number) => {
    setPelaksanaHeaders(prev => prev.map(row => row.filter((_, i) => i !== colIdxToRemove)));
    setSteps(steps.map(step => {
      if (step.pelaksanaCol === colIdxToRemove) return { ...step, pelaksanaCol: Math.max(0, colIdxToRemove - 1) };
      if (step.pelaksanaCol > colIdxToRemove) return { ...step, pelaksanaCol: step.pelaksanaCol - 1 };
      return step;
    }));
  };

  const updateStep = (index: number, updates: Partial<SOPStep>) => {
    setSteps(prev => {
      const newSteps = [...prev];
      newSteps[index] = { ...newSteps[index], ...updates };
      return newSteps;
    });
  };

  const handleInsertRow = () => {
    const target = window.prompt("Masukkan NOMOR baris untuk menyisipkan:");
    if (!target) return;
    const targetNum = parseInt(target, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > steps.length + 1) return alert("Nomor tidak valid!");
    const insertIndex = targetNum - 1;
    const prevCol = insertIndex > 0 ? steps[insertIndex - 1].pelaksanaCol : 0;
    const newSteps = [...steps];
    newSteps.splice(insertIndex, 0, { id: genStepId(), kegiatan: '', pelaksanaCol: prevCol, symbol: 'process', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' });
    setSteps(newSteps);
  };

  const getExecutorStyles = () => colCount > 6 ? "text-[8px] leading-tight" : colCount > 5 ? "text-[9px] leading-tight" : colCount > 4 ? "text-[9px] leading-tight" : colCount > 3 ? "text-[10px] leading-tight" : "text-[11px] leading-tight";
  const getKegiatanWidth = () => colCount >= 9 ? '14%' : colCount >= 8 ? '15%' : colCount >= 6 ? '16%' : colCount >= 4 ? '18%' : '24%';
  const getKeteranganWidth = () => colCount >= 9 ? '6%' : colCount >= 8 ? '7%' : colCount >= 7 ? '7%' : colCount >= 6 ? '8%' : '10%';
  const getWaktuWidth = () => colCount >= 9 ? '4%' : colCount >= 8 ? '5%' : colCount >= 7 ? '5%' : colCount >= 6 ? '6%' : colCount >= 4 ? '7%' : '8%';
  const getKelengkapanOutputWidth = () => colCount >= 9 ? '6%' : colCount >= 8 ? '6%' : colCount >= 7 ? '7%' : colCount >= 6 ? '8%' : colCount >= 4 ? '9%' : '10%';
  const getWaktuFontClass = () => colCount >= 9 ? 'text-[7px] leading-tight' : colCount === 8 ? 'text-[8px] leading-tight' : colCount === 7 ? 'text-[9px] leading-tight' : colCount === 6 ? 'text-[10px] leading-tight' : colCount === 5 ? 'text-[11px] leading-tight' : 'text-[12px] leading-tight';

  const handleCellAction = (absIdx: number, colIdx: number, symbolToUse?: SOPFlowSymbol) => {
    if (connectingFrom !== null) {
      const tgtId = steps[absIdx].id; 
      if (connectingFrom.row !== absIdx || connectingFrom.col !== colIdx) {
        if (connectingFrom.col === steps[connectingFrom.row].pelaksanaCol) {
          updateStep(connectingFrom.row, { loopTarget: tgtId, loopTargetCol: colIdx });
        } else {
          const ex = [...(steps[connectingFrom.row].extraShapes || [])];
          const exIdx = ex.findIndex(s => s.colIdx === connectingFrom.col);
          if (exIdx !== -1) {
            ex[exIdx] = { ...ex[exIdx], loopTarget: tgtId, loopTargetCol: colIdx };
            updateStep(connectingFrom.row, { extraShapes: ex });
          }
        }
      }
      setConnectingFrom(null); return;
    }
    
    const sym = symbolToUse || activeTool;
    const step = steps[absIdx];
    if (sym) {
      if (step.pelaksanaCol === colIdx) {
        updateStep(absIdx, { symbol: sym });
      } else {
        const extras = step.extraShapes ? [...step.extraShapes] : [];
        const exIdx = extras.findIndex(s => s.colIdx === colIdx);
        if (exIdx !== -1) extras[exIdx] = { ...extras[exIdx], symbol: sym };
        else extras.push({ colIdx, symbol: sym });
        updateStep(absIdx, { extraShapes: extras });
      }
      setActiveTool(null);
    } else if (!effectiveIsViewOnly) {
      const extraExists = step.extraShapes?.find(s => s.colIdx === colIdx);
      if (!extraExists) updateStep(absIdx, { pelaksanaCol: colIdx });
    }
  };

  const renderSymbolBox = (step: SOPStep, absIdx: number, colIdx: number, localIdx: number, chunkLength: number, chunkStart: number, chunkEnd: number) => {
    const isMainShape = step.pelaksanaCol === colIdx;
    const extraShapeObj = step.extraShapes?.find(s => s.colIdx === colIdx);
    const isCurr = isMainShape || !!extraShapeObj;
    
    const prevStep = absIdx > 0 ? steps[absIdx - 1] : null;
    const prevCol = (localIdx > 0 && prevStep && prevStep.arrowDown) ? prevStep.pelaksanaCol : null;
    // Jika baris sebelumnya punya bentuk EXTRA tepat di atas bentuk utama baris ini (kolom sama)
    // dan mengalir ke bawah, aliran masuk harus LURUS dari extra itu — bukan dirutekan mendatar
    // dari bentuk utama baris sebelumnya (yang menyebabkan panah tertumpuk).
    const prevExtraAboveMain = localIdx > 0 && !!prevStep && !!prevStep.extraShapes?.some(e => e.colIdx === step.pelaksanaCol && e.arrowDown);
    // Kebalikannya: baris SEBELUMNYA (bentuk utama) mengalir turun ke kolom yang di baris ini justru
    // berisi bentuk EXTRA. Maka aliran harus lurus masuk ke EXTRA itu, dan rute ke bentuk utama baris
    // ini ditekan (kalau tidak, garis dari atas menumpuk: lurus ke extra + berbelok ke main).
    const rowHasExtraAtPrevMain = prevCol !== null && !!step.extraShapes?.some(e => e.colIdx === prevCol);
    const currentSymbol = isMainShape ? step.symbol : extraShapeObj?.symbol;
    const isDiamond = currentSymbol === 'decision';
    
    // offsetH = jarak dari pusat sel ke tepi ATAS/BAWAH bentuk (tempat ujung panah menempel).
    // Nilainya ≈ setengah tinggi bentuk, dikurangi ~1px agar ujung panah sedikit menempel
    // (bukan menggantung). Konektor (pentagon) tepi atasnya rata di setengah tinggi kotaknya.
    const isConnector = currentSymbol === 'connector';
    let shapeClass = "w-14 h-8"; let diamondClass = "w-8 h-8"; let offsetH = isDiamond ? 22 : (isConnector ? 15 : 15);
    if (colCount > 7) { shapeClass = "w-8 h-6"; diamondClass = "w-6 h-6"; offsetH = isDiamond ? 15 : (isConnector ? 11 : 11); }
    else if (colCount > 5) { shapeClass = "w-10 h-6"; diamondClass = "w-7 h-7"; offsetH = isDiamond ? 18 : (isConnector ? 13 : 11); }

    const isHighlight = connectingFrom !== null || activeTool !== null;
    const cellOverlayClass = `absolute inset-0 z-20 transition-all ${isHighlight ? 'cursor-crosshair hover:bg-emerald-100/50 hover:border-2 hover:border-dashed hover:border-emerald-400' : 'cursor-pointer hover:bg-slate-50/50'}`;
    const dropProps = !effectiveIsViewOnly ? { 
      onDragOver: (e: React.DragEvent) => e.preventDefault(), 
      onDrop: (e: React.DragEvent) => { e.preventDefault(); const s = e.dataTransfer.getData('symbol') as SOPFlowSymbol; if(s) handleCellAction(absIdx, colIdx, s); }, 
      onClick: () => handleCellAction(absIdx, colIdx), 
      className: cellOverlayClass 
    } : { className: "absolute inset-0 z-20" };

    if (!isCurr) {
      return (
        <div className="relative w-full h-full min-h-16 flex items-center justify-center">
          <div {...dropProps} />
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
            {prevCol !== null && localIdx > 0 && !prevExtraAboveMain && !rowHasExtraAtPrevMain && (
              <>
                {colIdx === prevCol && <div className="absolute top-0 left-[calc(50%-0.75px)] w-[1.5px] h-2 pointer-events-none z-20"><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg></div>}
                {colIdx === prevCol && <div className="absolute top-2 h-[1.5px] pointer-events-none z-20" style={{ left: step.pelaksanaCol > colIdx ? '50%' : 0, right: step.pelaksanaCol > colIdx ? 0 : '50%' }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="100%" y2="0" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg></div>}
                {((colIdx > prevCol && colIdx < step.pelaksanaCol) || (colIdx < prevCol && colIdx > step.pelaksanaCol)) && <div className="absolute top-2 left-0 w-full h-[1.5px] pointer-events-none z-20"><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="100%" y2="0" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg></div>}
              </>
            )}
          </div>
        </div>
      );
    }

    let Shape;
    const commonClass = `mx-auto bg-white border-2 border-black z-30 relative flex items-center justify-center ${shapeClass}`;
    const shapeId = isMainShape ? `shape-${absIdx}` : `shape-extra-${absIdx}-${colIdx}`;
    switch (currentSymbol) {
      case 'start': case 'end': Shape = <div id={shapeId} className={`${commonClass} rounded-full`}></div>; break;
      case 'decision': Shape = <div id={shapeId} className={`${commonClass.replace(/w-\d+ h-\d+/, diamondClass)} rotate-45`}></div>; break;
      case 'connector': Shape = <div id={shapeId} className={`${diamondClass} relative flex items-center justify-center mx-auto z-30 bg-white`}><svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible"><polygon points="0,0 100,0 100,65 50,100 0,65" fill="white" stroke="black" strokeWidth="8" /></svg></div>; break;
      default: Shape = <div id={shapeId} className={`${commonClass}`}></div>;
    }

    const isArrowDown = isMainShape ? step.arrowDown : extraShapeObj!.arrowDown;
    const showDownLine = isArrowDown && localIdx !== chunkLength - 1 && !(currentSymbol === 'connector' && localIdx !== 0);

    let targetIdx = -1;
    const activeLoopTarget = isMainShape ? step.loopTarget : extraShapeObj!.loopTarget;
    const activeLoopTargetCol = isMainShape ? step.loopTargetCol : extraShapeObj!.loopTargetCol;
    const activeBranchSide = isMainShape ? step.branchSide : extraShapeObj!.branchSide;
    const activeDownText = isMainShape ? step.downText : extraShapeObj!.downText;
    const activeDownOffset = isMainShape ? step.downTextOffset : extraShapeObj!.downTextOffset;
    const activeBranchText = isMainShape ? step.branchText : extraShapeObj!.branchText;
    const activeBranchOffset = isMainShape ? step.branchTextOffset : extraShapeObj!.branchTextOffset;

    if (activeLoopTarget) {
      targetIdx = steps.findIndex(s => s.id === activeLoopTarget);
      if (targetIdx === -1) targetIdx = displayNumbers.findIndex((n: string) => n !== '' && n === activeLoopTarget);
      if (targetIdx === -1 && !isNaN(parseInt(activeLoopTarget))) targetIdx = parseInt(activeLoopTarget) - 1;
    }

    const incomingList = incomingArrowsMap.get(absIdx) || [];
    const isIncomingTarget = incomingList.some(inc => inc.targetCol === colIdx);

    const toggleArrowDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMainShape) updateStep(absIdx, { arrowDown: !step.arrowDown });
      else {
        const ex = [...step.extraShapes!];
        const sIdx = ex.findIndex(x => x.colIdx === colIdx);
        ex[sIdx] = { ...ex[sIdx], arrowDown: !ex[sIdx].arrowDown };
        updateStep(absIdx, { extraShapes: ex });
      }
    };

    const toggleBranchSide = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMainShape) updateStep(absIdx, { branchSide: step.branchSide === 'left' ? 'right' : 'left' });
      else {
        const ex = [...step.extraShapes!];
        const sIdx = ex.findIndex(x => x.colIdx === colIdx);
        ex[sIdx] = { ...ex[sIdx], branchSide: ex[sIdx].branchSide === 'left' ? 'right' : 'left' };
        updateStep(absIdx, { extraShapes: ex });
      }
    };

    const clearBranch = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMainShape) { updateStep(absIdx, { loopTarget: undefined, loopTargetCol: undefined }); }
      else {
        const ex = [...step.extraShapes!];
        const sIdx = ex.findIndex(x => x.colIdx === colIdx);
        ex[sIdx] = { ...ex[sIdx], loopTarget: undefined, loopTargetCol: undefined };
        updateStep(absIdx, { extraShapes: ex });
      }
    };

    const updateShapeSymbol = (newSymbol: SOPFlowSymbol) => {
      if (isMainShape) updateStep(absIdx, { symbol: newSymbol });
      else {
        const ex = [...(step.extraShapes || [])];
        const target = ex.find(s => s.colIdx === colIdx);
        if (target) { target.symbol = newSymbol; updateStep(absIdx, { extraShapes: ex }); }
      }
    };

    const handleDownTextChange = (val: string) => {
      if (isMainShape) updateStep(absIdx, { downText: val });
      else {
        const ex = [...step.extraShapes!];
        const t = ex.find(s => s.colIdx === colIdx);
        if (t) { t.downText = val; updateStep(absIdx, { extraShapes: ex }); }
      }
    };

    const handleDownOffsetChange = (val: {x:number, y:number}) => {
      if (isMainShape) updateStep(absIdx, { downTextOffset: val });
      else {
        const ex = [...step.extraShapes!];
        const t = ex.find(s => s.colIdx === colIdx);
        if (t) { t.downTextOffset = val; updateStep(absIdx, { extraShapes: ex }); }
      }
    };

    const handleBranchTextChange = (val: string) => {
      if (isMainShape) updateStep(absIdx, { branchText: val });
      else {
        const ex = [...step.extraShapes!];
        const t = ex.find(s => s.colIdx === colIdx);
        if (t) { t.branchText = val; updateStep(absIdx, { extraShapes: ex }); }
      }
    };

    const handleBranchOffsetChange = (val: {x:number, y:number}) => {
      if (isMainShape) updateStep(absIdx, { branchTextOffset: val });
      else {
        const ex = [...step.extraShapes!];
        const t = ex.find(s => s.colIdx === colIdx);
        if (t) { t.branchTextOffset = val; updateStep(absIdx, { extraShapes: ex }); }
      }
    };

    return (
      <div className="relative w-full h-full min-h-16 flex flex-col items-center justify-center" id={`cell-${absIdx}-${colIdx}`}>
        <div {...dropProps} />
        
        <div className="absolute inset-0 w-full h-full pointer-events-none z-30">
          {targetIdx !== -1 && (
            <BranchArrowLocal 
              sourceIdx={absIdx} targetIdx={targetIdx} 
              sourceCol={colIdx} targetCol={activeLoopTargetCol ?? steps[targetIdx]?.pelaksanaCol ?? -1} 
              sourceSide={activeBranchSide || 'right'} chunkStart={chunkStart} chunkEnd={chunkEnd} isPrinting={isPrinting} 
              updateTrigger={`${colCount}-${steps.length}-${colIdx}-${activeBranchSide}`} isSourceMain={isMainShape}
              branchText={activeBranchText} branchTextOffset={activeBranchOffset} onBranchTextChange={handleBranchTextChange} onBranchOffsetChange={handleBranchOffsetChange} isViewOnly={effectiveIsViewOnly}
            />
          )}

          {isIncomingTarget && incomingList.filter(inc => inc.targetCol === colIdx).map(src => (
            <IncomingArrowLocal 
              key={`in-${src.srcRow}-${src.srcCol}-${absIdx}`} 
              sourceIdx={src.srcRow} targetIdx={absIdx} 
              sourceCol={src.srcCol} targetCol={colIdx} 
              sourceSide={src.side} isPrinting={isPrinting} 
              updateTrigger={`${colCount}-${steps.length}-${colIdx}`} 
            />
          ))}
        </div>

        <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10">
          {isMainShape && prevCol !== null && prevCol !== colIdx && localIdx > 0 && !prevExtraAboveMain && !rowHasExtraAtPrevMain && (
            <>
              <div className="absolute top-2 h-[1.5px] pointer-events-none z-20" style={{ left: prevCol < colIdx ? 0 : '50%', right: prevCol < colIdx ? '50%' : 0 }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="100%" y2="0" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg></div>
              <div className="absolute top-2 left-[calc(50%-0.75px)] w-[1.5px] pointer-events-none z-20" style={{ height: `calc(50% - ${offsetH + 8}px)` }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg><div className="absolute bottom-0 left-0 -translate-x-1/2 z-20" style={{ width: 0, height: 0, borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: '9px solid black' }} /></div>
            </>
          )}
          {isMainShape && localIdx > 0 && ((prevCol !== null && prevCol === colIdx) || prevExtraAboveMain) && (
            <div className="absolute top-0 left-[calc(50%-0.75px)] w-[1.5px] pointer-events-none z-20" style={{ height: `calc(50% - ${offsetH}px)` }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg><div className="absolute bottom-0 left-0 -translate-x-1/2 z-20" style={{ width: 0, height: 0, borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: '9px solid black' }} /></div>
          )}
          {/* Bentuk EXTRA yang tepat di bawah bentuk utama baris sebelumnya: garis masuk LURUS + kepala panah. */}
          {!isMainShape && prevCol !== null && prevCol === colIdx && localIdx > 0 && (
            <div className="absolute top-0 left-[calc(50%-0.75px)] w-[1.5px] pointer-events-none z-20" style={{ height: `calc(50% - ${offsetH}px)` }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg><div className="absolute bottom-0 left-0 -translate-x-1/2 z-20" style={{ width: 0, height: 0, borderLeft: '4.5px solid transparent', borderRight: '4.5px solid transparent', borderTop: '9px solid black' }} /></div>
          )}
          {showDownLine && (
            <div className="absolute bottom-0 left-[calc(50%-0.75px)] w-[1.5px] pointer-events-none z-20" style={{ height: `calc(50% - ${offsetH}px)` }}><svg className="w-full h-full overflow-visible" preserveAspectRatio="none"><line x1="0" y1="0" x2="0" y2="100%" stroke="black" strokeWidth="2" shapeRendering="crispEdges" /></svg></div>
          )}
        </div>

        {showDownLine && currentSymbol === 'decision' && (
          <DraggableLabel 
            value={activeDownText} defaultValue="Ya" offset={activeDownOffset} onTextChange={handleDownTextChange} onOffsetChange={handleDownOffsetChange} isViewOnly={effectiveIsViewOnly}
            baseStyle={{ left: 'calc(50% + 4px)', top: `calc(50% + ${offsetH + 2}px)` }}
          />
        )}

        <div
          className="shape-menu-trigger relative z-30 pointer-events-auto cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool || connectingFrom !== null) { handleCellAction(absIdx, colIdx); return; }
            if (effectiveIsViewOnly) return;
            setOpenShapeMenu(prev => (prev && prev.row === absIdx && prev.col === colIdx) ? null : { row: absIdx, col: colIdx });
          }}
        >
          {Shape}
          {!effectiveIsViewOnly && connectingFrom === null && !activeTool && openShapeMenu?.row === absIdx && openShapeMenu?.col === colIdx && (
            <div onClick={(e) => e.stopPropagation()} className={`shape-menu-popup absolute ${localIdx === 0 ? 'top-full mt-2' : '-top-24'} left-1/2 -translate-x-1/2 flex flex-col gap-1 bg-white border border-slate-300 p-1.5 rounded-lg shadow-xl transition-opacity z-50 no-print font-sans pointer-events-auto animate-in fade-in zoom-in-95 duration-150`}>
              
              <div className="flex gap-1 border-b border-slate-200 pb-1.5">
                <button onClick={(e) => { e.stopPropagation(); updateShapeSymbol('start'); }} className="p-1 hover:bg-slate-100 rounded" title="Start/End"><Circle size={14}/></button>
                <button onClick={(e) => { e.stopPropagation(); updateShapeSymbol('process'); }} className="p-1 hover:bg-slate-100 rounded" title="Proses"><Square size={14}/></button>
                <button onClick={(e) => { e.stopPropagation(); updateShapeSymbol('decision'); }} className="p-1 hover:bg-slate-100 rounded" title="Decision/Kondisi"><Diamond size={14}/></button>
                <button onClick={(e) => { e.stopPropagation(); updateShapeSymbol('connector'); }} className="p-1 hover:bg-slate-100 rounded" title="Konektor Halaman"><Shield size={14}/></button>
              </div>

              <div className="flex gap-1 pt-1 justify-center">
                <button onClick={toggleArrowDown} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${isArrowDown ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>TURUN</button>
                <button onClick={(e) => { e.stopPropagation(); setConnectingFrom({ row: absIdx, col: colIdx }); }} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 ${activeLoopTarget ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>🔗 Cabang</button>
                {activeLoopTarget && (
                  <>
                    <button onClick={toggleBranchSide} className="text-[9px] font-bold px-1.5 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" title="Ubah Arah Panah Keluar">{activeBranchSide === 'left' ? 'Kiri' : 'Kanan'}</button>
                    <button onClick={clearBranch} className="text-[9px] text-red-500 font-bold px-1 hover:bg-red-50 rounded"><X size={12}/></button>
                  </>
                )}
              </div>
              
              {!isMainShape && (
                <div className="flex gap-1 pt-1 justify-center border-t border-slate-200 mt-1">
                  <button onClick={(e) => { e.stopPropagation(); const extras = (step.extraShapes || []).filter(s => s.colIdx !== colIdx); updateStep(absIdx, { extraShapes: extras }); }} className="text-[9px] font-bold px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-500 hover:text-white transition-colors w-full flex items-center justify-center gap-1"><Trash2 size={10}/> Hapus</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const coverRows = [
    { id: 1, minH: "min-h-12", leftTitle: "Dasar Hukum:", leftVal: dasarHukum, leftSetter: setDasarHukum, rightTitle: "Kualifikasi Pelaksana:", rightVal: kualifikasi, rightSetter: setKualifikasi },
    { id: 2, minH: "min-h-12", leftTitle: "Keterkaitan:", leftVal: keterkaitan, leftSetter: setKeterkaitan, rightTitle: "Peralatan / Perlengkapan:", rightVal: peralatan, rightSetter: setPeralatan },
    { id: 3, minH: "min-h-12", leftTitle: "Peringatan:", leftVal: peringatan, leftSetter: setPeringatan, rightTitle: "Pencatatan dan Pendataan:", rightVal: pencatatan, rightSetter: setPencatatan }
  ];

  const coverChunks: (typeof coverRows[0])[][] = [];
  let currentCoverChunk: typeof coverRows[0][] = [];
  coverRows.forEach(row => {
    currentCoverChunk.push(row);
    if (coverBreaks[row.id]) { coverChunks.push(currentCoverChunk); currentCoverChunk = []; }
  });
  if (currentCoverChunk.length > 0) coverChunks.push(currentCoverChunk);

  return (
    <div className="h-full overflow-auto bg-slate-200 pb-32 p-2 md:p-6 print:h-auto print:overflow-visible print:bg-white print:p-0 flex flex-col items-center font-bookman">
      
      {/* MODE TARIK GARIS */}
      {connectingFrom !== null && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-top-4 font-sans border-2 border-indigo-400 no-print">
          <MousePointer2 className="w-5 h-5 animate-bounce" />
          <span className="font-bold text-sm">Mode Tarik Garis: Klik kolom kegiatan yang menjadi tujuan cabang.</span>
          <button onClick={() => setConnectingFrom(null)} className="ml-4 px-3 py-1 bg-indigo-800 hover:bg-indigo-900 rounded-lg text-xs font-bold transition-colors">Batal</button>
        </div>
      )}

      {/* MODE STEMPEL BENTUK */}
      {activeTool !== null && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-top-4 font-sans border-2 border-emerald-400 no-print">
          <MousePointer2 className="w-5 h-5 animate-bounce" />
          <span className="font-bold text-sm">Mode Stempel: Klik area kosong di tabel untuk menempel bentuk tambahan.</span>
          <button onClick={() => setActiveTool(null)} className="ml-4 px-3 py-1 bg-emerald-800 hover:bg-emerald-900 rounded-lg text-xs font-bold transition-colors">Batal</button>
        </div>
      )}

      {/* PALET SHAPE KANAN (BISA DI-HIDE) */}
      {!effectiveIsViewOnly && connectingFrom === null && (
        <div style={{ top: paletteTopPx, bottom: 16 }} className={`fixed transition-[right] duration-300 z-40 flex no-print font-sans ${isPaletteOpen ? 'right-2 sm:right-6' : '-right-24'}`}>
          <div className="relative h-full flex items-center">
             {/* Tombol minimize berada DI LUAR kotak ber-scroll agar tidak ikut terpotong overflow. */}
             <button onClick={() => setIsPaletteOpen(!isPaletteOpen)} className="absolute -left-8 top-1/2 -translate-y-1/2 z-10 bg-white hover:bg-slate-50 border border-slate-200 border-r-0 rounded-l-xl p-1 shadow-md text-slate-400 hover:text-emerald-600 transition-colors">
               {isPaletteOpen ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
             </button>

             <div className="bg-white/90 backdrop-blur-md px-2 sm:px-3 py-3 sm:py-5 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] border border-slate-200 flex flex-col items-center gap-3 sm:gap-5 w-16 sm:w-20 max-h-full overflow-y-auto">
               <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest text-center border-b border-slate-200 pb-2 w-full leading-tight shrink-0">Bentuk<br/>Ekstra</div>

               <div draggable onDragStart={(e) => e.dataTransfer.setData('symbol', 'start')} onClick={() => setActiveTool(activeTool === 'start' ? null : 'start')} className={`shrink-0 cursor-grab active:cursor-grabbing p-2 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 ${activeTool === 'start' ? 'bg-emerald-100 ring-2 ring-emerald-500 shadow-md' : 'hover:bg-slate-100'}`}>
                 <div className="w-8 h-4 border-2 border-slate-800 rounded-full bg-white" />
                 <span className={`text-[9px] font-bold ${activeTool === 'start' ? 'text-emerald-700' : 'text-slate-600'}`}>Mulai</span>
               </div>

               <div draggable onDragStart={(e) => e.dataTransfer.setData('symbol', 'process')} onClick={() => setActiveTool(activeTool === 'process' ? null : 'process')} className={`shrink-0 cursor-grab active:cursor-grabbing p-2 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 ${activeTool === 'process' ? 'bg-emerald-100 ring-2 ring-emerald-500 shadow-md' : 'hover:bg-slate-100'}`}>
                 <div className="w-8 h-5 border-2 border-slate-800 bg-white" />
                 <span className={`text-[9px] font-bold ${activeTool === 'process' ? 'text-emerald-700' : 'text-slate-600'}`}>Proses</span>
               </div>

               <div draggable onDragStart={(e) => e.dataTransfer.setData('symbol', 'decision')} onClick={() => setActiveTool(activeTool === 'decision' ? null : 'decision')} className={`shrink-0 cursor-grab active:cursor-grabbing p-2 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 ${activeTool === 'decision' ? 'bg-emerald-100 ring-2 ring-emerald-500 shadow-md' : 'hover:bg-slate-100'}`}>
                 <div className="w-5 h-5 border-2 border-slate-800 rotate-45 bg-white" />
                 <span className={`text-[9px] font-bold ${activeTool === 'decision' ? 'text-emerald-700' : 'text-slate-600'}`}>Kondisi</span>
               </div>

               <div draggable onDragStart={(e) => e.dataTransfer.setData('symbol', 'connector')} onClick={() => setActiveTool(activeTool === 'connector' ? null : 'connector')} className={`shrink-0 cursor-grab active:cursor-grabbing p-2 rounded-xl flex flex-col items-center gap-1.5 transition-all hover:scale-110 ${activeTool === 'connector' ? 'bg-emerald-100 ring-2 ring-emerald-500 shadow-md' : 'hover:bg-slate-100'}`}>
                 <div className="w-5 h-5 relative flex items-center justify-center bg-white"><svg viewBox="0 0 100 100" className="w-full h-full"><polygon points="0,0 100,0 100,65 50,100 0,65" fill="white" stroke="black" strokeWidth="10" /></svg></div>
                 <span className={`text-[9px] font-bold ${activeTool === 'connector' ? 'text-emerald-700' : 'text-slate-600'}`}>Konektor</span>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT INFO SOP */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-60 p-4 no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-[#002855] flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-emerald-600" /> Edit Informasi SOP
              </h3>
              <button onClick={() => setShowInfoModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Judul SOP <span className="text-red-500">*</span></label>
                <input type="text" value={infoForm.judul} onChange={e => setInfoForm({ ...infoForm, judul: e.target.value })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900" placeholder="Judul SOP..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nomor SOP <span className="text-slate-400 font-normal normal-case">(opsional)</span></label>
                <input type="text" value={infoForm.nomor} onChange={e => setInfoForm({ ...infoForm, nomor: e.target.value.toUpperCase() })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900 font-mono" placeholder="Contoh: SOP/14/ATRBPN" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Jenis SOP</label>
                  <select value={infoForm.jenisSOP} onChange={e => setInfoForm({ ...infoForm, jenisSOP: e.target.value })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900 cursor-pointer">
                    <option value="">-- Pilih Jenis --</option>
                    {JENIS_SOP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Klasifikasi SOP</label>
                  <select value={infoForm.klasifikasiSOP} onChange={e => setInfoForm({ ...infoForm, klasifikasiSOP: e.target.value })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900 cursor-pointer">
                    <option value="">-- Pilih Klasifikasi --</option>
                    {KLASIFIKASI_SOP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Unit Kerja Utama (L1) <span className="text-red-500">*</span></label>
                <select value={infoForm.unitKerja} onChange={e => setInfoForm({ ...infoForm, unitKerja: e.target.value, subUnitKerja: '' })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900 cursor-pointer">
                  <option value="">-- Pilih Unit Utama --</option>
                  {L1_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sub-Unit / Direktorat (L2)</label>
                <input type="text" value={infoForm.subUnitKerja} onChange={e => setInfoForm({ ...infoForm, subUnitKerja: e.target.value })} className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 text-slate-900" placeholder="Nama sub-unit / direktorat (opsional)" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowInfoModal(false)} className="px-5 py-2.5 text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">Batal</button>
              <button
                onClick={() => {
                  if (!infoForm.judul.trim()) return alert('Judul SOP wajib diisi.');
                  if (!infoForm.unitKerja) return alert('Unit Kerja Utama wajib dipilih.');
                  setJudul(infoForm.judul.trim());
                  setNomor(infoForm.nomor.trim());
                  setUnitKerja(infoForm.unitKerja);
                  setSubUnitKerja(infoForm.subUnitKerja);
                  setJenisSOP(infoForm.jenisSOP);
                  setKlasifikasiSOP(infoForm.klasifikasiSOP);
                  setShowInfoModal(false);
                }}
                className="px-6 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95"
              >
                <Save size={16} /> Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {isSaveModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">Simpan Dokumen SOP</h3>
              <p className="text-sm text-slate-500 mt-1">Pilih tindakan yang ingin Anda lakukan terhadap dokumen draft ini.</p>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button onClick={() => { handleSaveFlow(false); setIsSaveModalOpen(false); }} className="w-full flex items-center justify-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 p-3 rounded-xl font-bold transition-colors">
                <Save size={18} /> Simpan sebagai Draft Lokal
              </button>
              <button onClick={() => { setIsSaveModalOpen(false); setShowSubmitConfirm(true); }} className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl font-bold shadow-md transition-colors">
                <Send size={18} /> Simpan &amp; Kirim ke Biro Ortala MR
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button onClick={() => setIsSaveModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors">Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* KONFIRMASI KIRIM KE BIRO ORTALA MR */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Send size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Ajukan ke Biro Ortala MR?</h3>
                <p className="text-sm text-slate-500 mt-1">Dokumen SOP ini akan disimpan lalu <b>dikirim ke Biro Ortala MR</b> untuk ditinjau. Pastikan seluruh data sudah benar sebelum melanjutkan.</p>
              </div>
            </div>
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => { setShowSubmitConfirm(false); setIsSaveModalOpen(true); }} className="px-5 py-2.5 text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
              <button onClick={() => { setShowSubmitConfirm(false); handleSubmitOrtala(); }} className="px-6 py-2.5 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95">
                <Send size={16} /> Ya, Ajukan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOOLBAR ATAS */}
      <div ref={toolbarRef} className="w-full max-w-[330mm] mb-4 bg-white p-3 rounded-2xl shadow-sm border flex flex-col justify-between items-center gap-4 no-print sticky top-0 z-45 font-sans">
        <div className="flex flex-wrap items-center justify-between w-full gap-2 border-b pb-2">
          <div className="flex gap-2">
            <button onClick={handleGoBack} className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200"><ArrowLeft size={16} /> Kembali</button>
            {!isViewOnly && (
              <>
                <button
                  onClick={() => {
                    setInfoForm({ judul, nomor, unitKerja, subUnitKerja, jenisSOP, klasifikasiSOP });
                    setShowInfoModal(true);
                  }}
                  className="px-3 py-1.5 bg-slate-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
                  title="Edit Informasi SOP"
                >
                  <Edit2 size={16} /> Edit Info
                </button>
                <button onClick={() => setIsSaveModalOpen(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><Save size={16} /> Simpan</button>
                <button onClick={() => setSteps([...steps, { id: genStepId(), kegiatan: '', pelaksanaCol: 0, symbol: 'process', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' }])} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><Plus size={16} /> Baris Baru</button>
                <button onClick={handleInsertRow} className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><ArrowDownToLine size={16} /> Sisip Baris</button>
                <button onClick={addColumn} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><UserPlus size={16} /> Kolom</button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><FileSpreadsheet size={16} /> Excel</button>
            <button onClick={handleDownloadPDF} disabled={isExporting} title="Unduh PDF vektor ukuran F4 (330×215mm) — teks bisa diseleksi, sesuai canvas. Dokumen disimpan lalu dirender di server, langsung terunduh (tanpa dialog cetak)." className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed">
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              {isExporting ? 'Menyiapkan PDF…' : 'Unduh PDF (F4)'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center bg-slate-100 p-1 rounded-xl shadow-inner w-full">
          <button onClick={() => setActiveTab('cover')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex-1 ${activeTab === 'cover' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Cover SOP</button>
          {chunkedSteps.map((_, i) => (
            <button key={i} onClick={() => setActiveTab(i)} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex-1 ${activeTab === i ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Alur {i + 1}</button>
          ))}
        </div>
      </div>

      {!effectiveIsViewOnly && activeTab === 'cover' && (
        <div className="w-full max-w-[330mm] bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-sans p-3 rounded-xl mb-4 print:hidden flex items-start gap-2 shadow-sm">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p><b>Panduan PDF:</b> Saat menekan &quot;Cetak&quot;, pastikan Anda memilih ukuran kertas <b>F4 atau Custom (330x215mm)</b> di dialog print browser Anda.</p>
        </div>
      )}

      {!effectiveIsViewOnly && activeTab !== 'cover' && (
        <div className="w-full max-w-[330mm] bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-sans p-3 rounded-xl mb-4 print:hidden flex items-start gap-2 shadow-sm">
          <MousePointer2 size={16} className="shrink-0 mt-0.5" />
          <p><b>Tips:</b> <b>Klik/ketuk</b> sebuah bentuk pada kolom untuk membuka menu ganti bentuk, arah panah, atau cabang. Klik di luar bentuk untuk menutup menu.</p>
        </div>
      )}

      {/* COVER BERTANDA TANGAN (hasil scan) — MENGGANTIKAN cover generate untuk SOP terbit.
          Hanya di layar (no-print); pada PDF cover digabung di sisi server (agar cover PDF asli
          ikut sebagai halaman, bukan tangkapan layar). */}
      {signedCoverUrl && activeTab === 'cover' && (
        <div className="paper-f4-landscape-auto shadow-2xl border border-slate-300 text-black flex-col flex mb-8 no-print relative bg-white items-center justify-center p-[6mm]">
          <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded font-sans z-10">COVER BERTANDA TANGAN (hasil scan)</div>
          {signedCoverMime.includes('pdf') ? (
            <iframe src={`${signedCoverUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} title="Cover bertanda tangan" className="w-full h-[195mm] border-0" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedCoverUrl} alt="Cover bertanda tangan" className="max-w-full max-h-[195mm] object-contain" />
          )}
        </div>
      )}

      {/* COVER UTAMA (generate). TIDAK dirender sama sekali bila SOP terbit (sudah ada cover TTD) —
          diganti scan di layar & hasil merge di PDF, supaya cover tidak dobel. Tidak cukup pakai
          class `hidden`, karena @media print `.cover-page-container{display:flex!important}` menimpanya. */}
      {!hasSignedCover && coverChunks.map((chunk, chunkIdx) => (
        <React.Fragment key={`cover-chunk-${chunkIdx}`}>
          <div className={`print-page-target paper-f4-landscape-auto shadow-2xl p-[6mm] border border-slate-300 text-black cover-page-container flex-col ${activeTab === 'cover' || isPrinting ? 'flex mb-8 print:mb-0' : 'hidden print:flex'}`}>
            <table className="w-full border-collapse border-2 border-black table-fixed cover-table mb-auto">
              <colgroup><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[10%]" /></colgroup>
              <tbody>
                {chunkIdx === 0 && (
                  <tr>
                    <td colSpan={4} className="border-2 border-black p-4 text-center align-middle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/e-sop-atrbpn/logo-bpn.png" alt="Logo ATR BPN" className="w-20 h-20 object-contain mb-3 mx-auto" />
                      <p className="text-[12px] font-bold uppercase leading-tight">Kementerian Agraria dan Tata Ruang/</p>
                      <p className="text-[12px] font-bold uppercase mb-4 leading-tight">Badan Pertanahan Nasional</p>
                      <EditableCell value={unitKerja} onChange={setUnitKerja} center={true} className="text-[12px] font-bold uppercase" />
                      <EditableCell value={subUnitKerja} onChange={setSubUnitKerja} center={true} placeholder="Sub Unit / Direktorat..." className="text-[12px] font-bold uppercase mt-1 empty:hidden" />
                    </td>
                    <td colSpan={6} className="border-2 border-black p-0 align-top">
                      <div className="flex flex-col h-full font-bold text-[12px]">
                        <div className="flex border-b-2 border-black p-1.5 items-center"><span className="w-32 shrink-0">Nomor SOP</span><span className="mx-1">:</span><input value={nomor} onChange={e => setNomor(e.target.value)} disabled={isViewOnly} className="flex-1 outline-none disabled:bg-transparent bg-transparent" /></div>
                        <div className="flex border-b-2 border-black p-1.5 items-center"><span className="w-32 shrink-0">Tanggal Pembuatan</span><span className="mx-1">:</span><input value={tglPembuatan} onChange={e => setTglPembuatan(e.target.value)} disabled={isViewOnly} className="flex-1 outline-none disabled:bg-transparent bg-transparent" /></div>
                        <div className="flex border-b-2 border-black p-1.5 items-center"><span className="w-32 shrink-0">Tanggal Revisi</span><span className="mx-1">:</span><input value={tglRevisi} onChange={e => setTglRevisi(e.target.value)} disabled={isViewOnly} className="flex-1 outline-none disabled:bg-transparent bg-transparent" /></div>
                        <div className="flex border-b-2 border-black p-1.5 items-center"><span className="w-32 shrink-0">Tanggal Efektif</span><span className="mx-1">:</span><input value={tglEfektif} onChange={e => setTglEfektif(e.target.value)} disabled={isViewOnly} className="flex-1 outline-none disabled:bg-transparent bg-transparent" /></div>
                        <div className="flex p-1.5 items-start border-b-2 border-black min-h-16">
                          <span className="w-32 mt-1 shrink-0">Disahkan Oleh</span><span className="mx-1 mt-1 shrink-0">:</span>
                          <div className="flex-1 flex flex-col justify-between pt-1 pb-1 h-full">
                            <div className="w-11/12"><EditableCell value={jabatanPengesah} onChange={setJabatanPengesah} placeholder="Jabatan..." className="font-bold leading-tight text-[12px]" /></div>
                            <div className="mt-8 w-10/12">
                              <input value={namaPengesah} onChange={e => setNamaPengesah(e.target.value)} disabled={isViewOnly} placeholder="Nama Lengkap" className="w-full outline-none font-bold underline text-[13px] bg-transparent disabled:bg-transparent" />
                              <div className="flex items-center gap-1"><span>NIP</span><input value={nipPengesah} onChange={e => setNipPengesah(e.target.value)} disabled={isViewOnly} className="flex-1 outline-none font-bold bg-transparent disabled:bg-transparent" /></div>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 text-center bg-slate-50 flex flex-col justify-center flex-1 min-h-12">
                          <p className="text-[11px] font-bold uppercase mb-0.5 tracking-widest">NAMA SOP :</p>
                          <EditableCell value={judul} onChange={setJudul} center={true} placeholder="JUDUL..." className="text-sm font-black uppercase leading-tight" />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {chunk.map((row) => (
                  <tr key={`cover-row-${row.id}`}>
                    <td colSpan={5} className="border-2 border-black align-top p-0 relative">
                       <div className="p-1.5 bg-slate-100 font-bold uppercase text-[12px] border-b-2 border-black">{row.leftTitle}</div>
                       <div className={`p-2 text-[12px] ${row.minH}`}><EditableCell value={row.leftVal} onChange={row.leftSetter} justify={true} /></div>
                       {!effectiveIsViewOnly && !coverBreaks[row.id] && row.id !== 3 && (
                         <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 z-30 no-print font-sans pointer-events-auto">
                           <button onClick={() => setCoverBreaks({...coverBreaks, [row.id]: true})} className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full border border-slate-300 shadow-md transition-all active:scale-95 whitespace-nowrap">✂️ Pisah ke Halaman Baru</button>
                         </div>
                       )}
                    </td>
                    <td colSpan={5} className="border-2 border-black align-top p-0">
                       <div className="p-1.5 bg-slate-100 font-bold uppercase text-[12px] border-b-2 border-black">{row.rightTitle}</div>
                       <div className={`p-2 text-[12px] ${row.minH}`}><EditableCell value={row.rightVal} onChange={row.rightSetter} justify={true} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!effectiveIsViewOnly && activeTab === 'cover' && chunkIdx < coverChunks.length - 1 && (
             <div className="w-full max-w-[330mm] flex justify-center -mt-4 mb-8 relative z-10 print:hidden font-sans">
               <button onClick={() => { const lastRowId = chunk[chunk.length - 1].id; setCoverBreaks({...coverBreaks, [lastRowId]: false}); }} className="px-4 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-bold rounded-full border border-amber-300 shadow-md flex items-center gap-2 transition-all">🔗 Gabungkan Kembali Halaman</button>
             </div>
          )}
        </React.Fragment>
      ))}

      {/* HALAMAN ALUR */}
      {chunkedSteps.map((chunk, chunkIdx) => {
        const startAbsIdx = steps.findIndex(s => s.id === chunk[0].id);
        const endAbsIdx = startAbsIdx + chunk.length - 1;
        const isLastChunk = chunkIdx === chunkedSteps.length - 1;
        const shouldStretch = !isLastChunk || chunk.length >= 6;
        const currentHeaders = pelaksanaHeaders[chunkIdx] || Array(colCount).fill('');

        return (
          <div key={chunkIdx} className={`print-page-target paper-f4-landscape shadow-2xl p-[6mm] border border-slate-300 text-black flex-col page-container ${isLastChunk ? 'last-print-page' : ''} ${activeTab === chunkIdx || isPrinting ? 'flex' : 'hidden print:flex'} font-bookman`}>
            <div className="flex justify-between items-end mb-3 border-b-4 border-black pb-1 shrink-0">
              <div>
                <h2 className="text-[15px] font-black uppercase leading-tight">{judul || 'JUDUL SOP'}</h2>
                {(jenisSOP || klasifikasiSOP) && (
                  <div className="flex gap-2 mt-1 no-print font-sans">
                    {jenisSOP && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">{jenisSOP}</span>}
                    {klasifikasiSOP && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">{klasifikasiSOP}</span>}
                  </div>
                )}
              </div>
            </div>
            
            <div className={`overflow-visible flex flex-col min-h-0 relative ${shouldStretch ? 'flex-1' : 'mb-auto'}`}>
              <table className={`w-full border-collapse border-2 border-black table-fixed relative font-bookman bg-white z-10 ${shouldStretch ? 'h-full flex-1' : ''}`}>
                <colgroup>
                  <col style={{ width: '4%' }} /> <col style={{ width: getKegiatanWidth() }} /> 
                  {Array(colCount).fill(0).map((_, i) => <col key={`col-pelaksana-${i}`} />)}
                  <col style={{ width: getKelengkapanOutputWidth() }} /> <col style={{ width: getWaktuWidth() }} /> <col style={{ width: getKelengkapanOutputWidth() }} /> <col style={{ width: getKeteranganWidth() }} /> 
                  {!effectiveIsViewOnly && <col style={{ width: '4%' }} className="no-print" />}
                </colgroup>
                <thead className={getExecutorStyles()}>
                  <tr className="bg-slate-100 font-black uppercase text-center h-8">
                    <th rowSpan={2} className="border-b-2 border-r-2 border-black p-1.5">No</th>
                    <th rowSpan={2} className="border-b-2 border-r-2 border-black p-1.5 text-[12px]">Kegiatan</th>
                    <th colSpan={colCount} className="border-b-2 border-r-2 border-black p-1 text-[12px]">Pelaksana</th>
                    <th colSpan={3} className={`border-b-2 border-r-2 border-black p-1 ${getWaktuFontClass()}`}>Mutu Baku</th>
                    <th rowSpan={2} className={`border-b-2 border-r-2 border-black p-1 ${getWaktuFontClass()}`}>Keterangan</th>
                    {!effectiveIsViewOnly && <th rowSpan={2} className="border-b-2 border-black p-1 no-print">Aksi</th>}
                  </tr>
                  <tr className="bg-slate-50 font-bold uppercase text-center h-8">
                    {currentHeaders.map((h, i) => (
                      <th key={i} className={`border-b-2 border-r-2 border-black p-1 relative group/h ${i === colCount - 1 ? '' : 'border-r-2 border-black'}`}>
                        <EditableCell value={h} onChange={(val) => handleHeaderChange(chunkIdx, i, val)} center={true} placeholder={`P${i+1}`} className="font-black text-center wrap-break-word" />
                        {!effectiveIsViewOnly && <button onClick={() => removeColumn(i)} title="Hapus kolom pelaksana ini" className="absolute -top-1 -right-1 text-red-600 no-print opacity-40 group-hover/h:opacity-100 active:scale-125 bg-white rounded-full z-30"><UserMinus size={10}/></button>}
                      </th>
                    ))}
                    <th className={`border-b-2 border-r-2 border-black p-1 ${getWaktuFontClass()}`}>Kelengkapan</th>
                    <th className={`border-b-2 border-r-2 border-black p-1 uppercase ${getWaktuFontClass()}`}>WAKTU<br/>(MENIT)</th>
                    <th className={`border-b-2 border-r-2 border-black p-1 italic ${getWaktuFontClass()}`}>Output</th>
                  </tr>
                </thead>
                <tbody className="text-[12px] align-top divide-y-2 divide-black overflow-visible">
                  {chunk.map((step, localIdx) => {
                    const absIdx = startAbsIdx + localIdx;
                    return (
                      <tr key={step.id} className="overflow-visible relative" style={{ height: shouldStretch ? `${100 / Math.max(chunk.length, 1)}%` : '26.6mm' }}>
                        <td className="border-r-2 border-black p-2 text-center font-normal relative h-px" title="Ketik 'auto' untuk mengembalikan ke urutan otomatis">
                          <EditableCell value={displayNumbers[absIdx]} onChange={(val) => updateStep(absIdx, { nomorOverride: val.trim().toLowerCase() === 'auto' ? undefined : val })} center={true} className="text-[13px] h-full" />
                        </td>
                        <td className="border-r-2 border-black p-2 px-1.5 font-normal leading-snug relative overflow-visible align-top h-px">
                          <EditableCell value={step.kegiatan} onChange={(val) => updateStep(absIdx, { kegiatan: val })} placeholder="..." justify={true} className="text-[13px] h-full" />
                        </td>
                        
                        {Array(colCount).fill(0).map((_, i) => (
                          <td key={i} id={`cell-${absIdx}-${i}`} className="border-r-2 border-black p-0 text-center align-middle relative h-px">
                            {renderSymbolBox(step, absIdx, i, localIdx, chunk.length, startAbsIdx, endAbsIdx)}
                          </td>
                        ))}

                        <td className="border-r-2 border-black p-2 px-1.5 font-normal leading-tight relative align-top h-px"><EditableCell value={step.syarat} onChange={(val) => updateStep(absIdx, { syarat: val })} className={`${getWaktuFontClass()} h-full`} /></td>
                        <td className={`border-r-2 border-black py-2 px-0.5 text-center font-normal leading-tight relative align-top h-px ${getWaktuFontClass()}`}><EditableCell value={step.waktu} onChange={(val) => updateStep(absIdx, { waktu: val })} center={true} className={`min-h-0! ${getWaktuFontClass()} h-full`} /></td>
                        <td className="border-r-2 border-black p-2 px-1.5 font-normal leading-tight relative align-top italic h-px"><EditableCell value={step.output} onChange={(val) => updateStep(absIdx, { output: val })} className={`${getWaktuFontClass()} italic h-full`} /></td>
                        <td className="border-r-2 border-black p-2 px-1.5 font-normal leading-tight relative align-top h-px"><EditableCell value={step.ket} onChange={(val) => updateStep(absIdx, { ket: val })} placeholder="..." justify={true} className={`${getWaktuFontClass()} h-full`} /></td>
                        
                        {!effectiveIsViewOnly && (
                          <td className="p-1 text-center no-print align-middle relative z-30 h-px">
                            <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                              <button onClick={() => updateStep(absIdx, { isPageBreak: !step.isPageBreak })} className={`p-1 rounded w-full border ${step.isPageBreak ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-200'}`}><span className="text-[8px] font-black leading-tight block">BATAS<br/>HAL</span></button>
                              <button onClick={() => setSteps(steps.filter((_, idx) => idx !== absIdx))} className="text-red-500 hover:text-white border border-red-200 hover:bg-red-500 p-1 rounded transition-colors w-full flex justify-center"><Trash2 size={14}/></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-auto pt-4 text-center text-[12px] font-normal shrink-0">Halaman {chunkIdx + 1} dari {chunkedSteps.length}</div>
          </div>
        );
      })}
    </div>
  );
});

SOPBuilder.displayName = 'SOPBuilder';
export default SOPBuilder;