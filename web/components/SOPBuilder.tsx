"use client";

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Plus, Trash2, Printer, UserPlus, UserMinus, Save,
  Circle, Square, Diamond, Shield,
  FileSpreadsheet, ArrowDownToLine, Send, ArrowLeft, Info
} from 'lucide-react';

// --- TIPE DATA ---
type SOPFlowSymbol = 'start' | 'process' | 'decision' | 'connector' | 'end';

interface SOPStep {
  id: string;
  kegiatan: string;
  pelaksanaCol: number; 
  symbol: SOPFlowSymbol;
  arrowDown: boolean; 
  loopTarget?: string;
  nomorOverride?: string;
  waktu: string;
  syarat: string;
  output: string;
  ket: string;
  isPageBreak?: boolean;
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
  isViewOnly?: boolean;
  onSaveTrigger?: (data: string) => void;
  onSubmitTrigger?: (data: string) => void;
  onBackTrigger?: () => void;
}

// --- KOMPONEN PELACAK PANAH LINTAS BARIS ---
const BranchArrow = ({ sourceIdx, targetIdx, loopTargetStr }: { sourceIdx: number, targetIdx: number, loopTargetStr: string }) => {
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let reqId: number;

    const update = () => {
      if (sourceIdx < 0 || targetIdx < 0) return;
      const srcShape = document.getElementById(`shape-${sourceIdx}`);
      const tgtShape = document.getElementById(`shape-${targetIdx}`);
      const svgEl = svgRef.current;
      const pathEl = pathRef.current;
      
      if (!srcShape || !tgtShape || !svgEl || !pathEl) return;

      const srcRect = srcShape.getBoundingClientRect();
      const tgtRect = tgtShape.getBoundingClientRect();
      const svgRect = svgEl.getBoundingClientRect(); 

      if (srcRect.width === 0) return;

      const startX = srcRect.right - svgRect.left;
      const startY = (srcRect.top + srcRect.height / 2) - svgRect.top;
      const endX = tgtRect.right - svgRect.left;
      const endY = (tgtRect.top + tgtRect.height / 2) - svgRect.top;

      const controlX = Math.max(startX, endX) + 25; 
      const d = `M ${startX} ${startY} L ${controlX} ${startY} L ${controlX} ${endY} L ${endX + 5} ${endY}`;
      pathEl.setAttribute('d', d);
    };

    const throttledUpdate = () => {
      cancelAnimationFrame(reqId);
      reqId = requestAnimationFrame(update);
    };

    throttledUpdate();
    window.addEventListener('resize', throttledUpdate);
    const tbody = document.getElementById(`shape-${sourceIdx}`)?.closest('tbody');
    let resizeObserver: ResizeObserver | null = null;
    
    if (tbody) {
      resizeObserver = new ResizeObserver(throttledUpdate);
      resizeObserver.observe(tbody);
    }

    return () => {
      window.removeEventListener('resize', throttledUpdate);
      if (resizeObserver) resizeObserver.disconnect();
      cancelAnimationFrame(reqId);
    };
  }, [sourceIdx, targetIdx]);

  return (
    <>
      <div className="hidden print:flex absolute left-[calc(50%+18px)] top-[calc(50%-8px)] z-50 bg-white px-1 h-4 items-center border border-black rounded">
        <span className="text-[9px] font-bold text-black whitespace-nowrap">Ke No {loopTargetStr}</span>
      </div>
      <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-40 print:hidden">
        <path ref={pathRef} fill="none" stroke="black" strokeWidth="1.5" markerEnd={`url(#head-branch-${sourceIdx})`} />
        <defs>
           <marker id={`head-branch-${sourceIdx}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
             <path d="M 0 0 L 10 5 L 0 10 z" fill="black" />
           </marker>
        </defs>
      </svg>
    </>
  );
};

// --- KOMPONEN EDITABLE CELL ---
const EditableCell = ({ value, onChange, className, placeholder, center = false }: { value: string, onChange: (val: string) => void, className?: string, placeholder?: string, center?: boolean }) => {
  const divRef = useRef<HTMLDivElement>(null);

  const formatContent = (val: string) => {
    if (!divRef.current) return;
    if (!val) {
      divRef.current.innerHTML = '';
      return;
    }
    
    const lines = val.split('\n');
    const hasList = lines.some(line => line.match(/^[0-9a-zA-Z]+\.\s|^-\s/));
    
    if (hasList) {
      let inList = false;
      const escapeHtml = (text: string) => {
        const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, (m) => map[m] || m);
      };
      
      const formattedHTML = lines.map(line => {
        const safeLine = escapeHtml(line);
        if (line.match(/^[0-9a-zA-Z]+\.\s|^-\s/)) {
          inList = true;
          return `<div style="padding-left: 14px; text-indent: -14px;">${safeLine}</div>`;
        } 
        else if (line.trim() === '') {
          inList = false; 
          return `<div><br></div>`;
        } 
        else {
          return `<div style="${inList ? 'padding-left: 14px;' : ''}">${safeLine}</div>`;
        }
      }).join('');
      
      divRef.current.innerHTML = formattedHTML;
    } else {
      divRef.current.innerText = val;
    }
  };

  useEffect(() => {
    if (divRef.current && document.activeElement !== divRef.current) {
      formatContent(value);
    }
  }, [value]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerText);
  };

  const handleBlur = () => {
    formatContent(value);
  };

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={handleBlur}
      className={`outline-none bg-transparent w-full min-h-6 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 wrap-break-word whitespace-pre-wrap ${center ? 'text-center' : 'text-left'} ${className}`}
      data-placeholder={placeholder}
    />
  );
};

// --- KOMPONEN UTAMA (SOP BUILDER) ---
const SOPBuilder = forwardRef<SOPBuilderRef, SOPBuilderProps>(({
  initialData, initialTitle, initialKey, initialL1, initialL2, isViewOnly, onSaveTrigger, onSubmitTrigger, onBackTrigger
}, ref) => {
  const searchParams = useSearchParams();

  const parsedData = useMemo(() => {
    if (!initialData) return null;
    try { return JSON.parse(initialData); } catch { return null; }
  }, [initialData]);
  
  const [judul, setJudul] = useState(parsedData?.judul || initialTitle || searchParams.get('title') || '');
  const [nomor, setNomor] = useState(parsedData?.nomor || initialKey || searchParams.get('key') || '');
  const [unitKerja, setUnitKerja] = useState(parsedData?.unitKerja || initialL1 || searchParams.get('l1') || 'Sekretariat Jenderal');
  const [subUnitKerja, setSubUnitKerja] = useState(parsedData?.subUnitKerja || initialL2 || searchParams.get('l2') || ''); 
  const [pelaksanaHeaders, setPelaksanaHeaders] = useState<string[]>(parsedData?.pelaksanaHeaders || ['', '', '']);
  const [jabatanPengesah, setJabatanPengesah] = useState(parsedData?.jabatanPengesah || '');
  const [namaPengesah, setNamaPengesah] = useState(parsedData?.namaPengesah || '');
  const [nipPengesah, setNipPengesah] = useState(parsedData?.nipPengesah || '');
  const [tglPembuatan, setTglPembuatan] = useState(parsedData?.tglPembuatan || '');
  const [tglRevisi, setTglRevisi] = useState(parsedData?.tglRevisi || '');
  const [tglEfektif, setTglEfektif] = useState(parsedData?.tglEfektif || '');
  const [dasarHukum, setDasarHukum] = useState(parsedData?.dasarHukum || '1. ');
  const [kualifikasi, setKualifikasi] = useState(parsedData?.kualifikasi || '1. ');
  const [keterkaitan, setKeterkaitan] = useState(parsedData?.keterkaitan || '1. ');
  const [peralatan, setPeralatan] = useState(parsedData?.peralatan || '1. ');
  const [peringatan, setPeringatan] = useState(parsedData?.peringatan || '1. ');
  const [pencatatan, setPencatatan] = useState(parsedData?.pencatatan || '1. ');

  const [steps, setSteps] = useState<SOPStep[]>(parsedData?.steps || [
    { id: 'step-1', kegiatan: '', pelaksanaCol: 0, symbol: 'start', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' }
  ]);

  const [coverBreaks, setCoverBreaks] = useState<{ [key: number]: boolean }>(parsedData?.coverBreaks || { 1: false, 2: false });
  const [activeTab, setActiveTab] = useState<'cover' | number>('cover');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

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
          if (pd.pelaksanaHeaders) setPelaksanaHeaders(pd.pelaksanaHeaders);
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
        } catch (error) {
          console.error("Gagal meload data lokal", error);
        }
      }
    }
  }, [initialData]);

  // --- EFEK CSS PRINT ---
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.cdnfonts.com/css/bookman-old-style');
      @page { size: 330mm 215mm landscape; margin: 0; }
      @media print {
        html, body, #__next, main, [data-reactroot] { 
          height: auto !important; 
          min-height: 100% !important;
          max-height: none !important;
          overflow: visible !important; 
          margin: 0 !important; 
          padding: 0 !important; 
          background: white !important; 
          position: static !important;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print { display: none !important; }
        
        .page-container { 
          margin: 0 !important; 
          box-shadow: none !important; 
          border: none !important; 
          page-break-inside: avoid !important;
          page-break-after: always !important; 
          width: 330mm !important; 
          height: 215mm !important; 
          padding: 6mm !important; /* PERBAIKAN: Margin kertas diturunkan jadi 6mm */
          display: flex !important;
          flex-direction: column !important;
          box-sizing: border-box !important;
          overflow: hidden !important; 
        }

        .cover-page-container {
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          page-break-after: always !important;
          width: 330mm !important;
          min-height: 215mm !important;
          height: auto !important;
          padding: 6mm !important; /* PERBAIKAN: Margin kertas diturunkan jadi 6mm */
          display: flex !important;
          flex-direction: column !important;
          box-sizing: border-box !important;
          overflow: visible !important;
        }
        
        table { display: table !important; width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
        thead { display: table-header-group !important; }
        tbody { display: table-row-group !important; }
        tr { display: table-row !important; page-break-inside: avoid !important; }
        td, th { display: table-cell !important; border: 2px solid black !important; }

        .cover-table { page-break-inside: auto !important; }
        .cover-table tr { page-break-inside: auto !important; page-break-after: auto !important; }
        .cover-table td { page-break-inside: auto !important; }
        
        [contenteditable]:empty:before { content: '' !important; display: none !important; }
        svg { max-width: 100% !important; overflow: visible !important; }
      }
      .font-bookman { font-family: 'Bookman Old Style', 'Bookman', serif; }
      .paper-f4-landscape { width: 330mm; min-height: 215mm; background: white; margin: 0 auto; }
      .paper-f4-landscape-auto { width: 330mm; min-height: 215mm; height: auto; background: white; margin: 0 auto; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const getSOPData = () => JSON.stringify({ judul, nomor, unitKerja, subUnitKerja, pelaksanaHeaders, jabatanPengesah, namaPengesah, nipPengesah, tglPembuatan, tglRevisi, tglEfektif, dasarHukum, kualifikasi, keterkaitan, peralatan, peringatan, pencatatan, steps, coverBreaks });

  const handleSaveFlow = (silent = false) => {
    const data = getSOPData();
    try {
      localStorage.setItem('e-sop-draft-local', data);
      if (onSaveTrigger) onSaveTrigger(data);
      if (!silent) alert("SOP berhasil disimpan!");
    } catch {
      if (!silent) alert("Gagal menyimpan SOP.");
    }
  };

  const handleSubmitOrtala = () => {
    handleSaveFlow(true); 
    const data = getSOPData();
    if (onSubmitTrigger) {
      onSubmitTrigger(data);
    } else {
      alert("Simulasi Terkirim! Data siap diluncurkan ke API Biro Ortala.");
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

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:x="urn:schemas-microsoft-com:office:excel"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <style>
          table { 
            border-collapse: collapse; 
            font-family: Arial, sans-serif; 
            font-size: 11pt; 
            table-layout: fixed; 
          }
          th, td { 
            border: 1px solid black; 
            padding: 6px; 
            vertical-align: top; 
            white-space: normal; 
            word-wrap: break-word; 
          }
          .col-no { width: 40px; }
          .col-text { width: 362px; } 
          .col-pelaksana { width: 80px; text-align: center; }
          .col-waktu { width: 100px; text-align: center; }
          th { 
            background-color: #e2e8f0; 
            font-weight: bold; 
            text-align: center; 
            vertical-align: middle; 
          }
          td { mso-number-format: "\\@"; } 
          br { mso-data-placement: same-cell; } 
        </style>
      </head>
      <body>
        <table>
          <colgroup>
            <col class="col-no">
            <col class="col-text">
            ${pelaksanaHeaders.map(() => `<col class="col-pelaksana">`).join('')}
            <col class="col-text">
            <col class="col-waktu">
            <col class="col-text">
            <col class="col-text">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">No</th>
              <th rowspan="2">Kegiatan</th>
              <th colspan="${pelaksanaHeaders.length}">Pelaksana</th>
              <th colspan="3">Mutu Baku</th>
              <th rowspan="2">Keterangan</th>
            </tr>
            <tr>
              ${pelaksanaHeaders.map(h => `<th>${h || '-'}</th>`).join('')}
              <th>Kelengkapan</th>
              <th>Waktu</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            ${steps.map((step, idx) => `
              <tr>
                <td style="text-align: center; vertical-align: middle;">${displayNumbers[idx] || ""}</td>
                <td>${step.kegiatan.replace(/\n/g, '<br>')}</td>
                ${pelaksanaHeaders.map((_, i) => `<td style="text-align: center; vertical-align: middle; font-size: 14pt;">${step.pelaksanaCol === i ? getExcelSymbol(step.symbol) : ''}</td>`).join('')}
                <td>${step.syarat.replace(/\n/g, '<br>')}</td>
                <td style="text-align: center; vertical-align: middle;">${step.waktu.replace(/\n/g, '<br>')}</td>
                <td>${step.output.replace(/\n/g, '<br>')}</td>
                <td>${step.ket.replace(/\n/g, '<br>')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SOP_${judul || 'Draft'}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGoBack = () => {
    if (!isViewOnly) {
      const isConfirmed = window.confirm("Yakin ingin kembali? Pastikan Anda sudah menyimpan dokumen ini agar data tidak hilang.");
      if (!isConfirmed) return;
    }
    
    if (onBackTrigger) {
      onBackTrigger();
    } else {
      window.location.href = '/e-sop-atrbpn/sop'; 
    }
  };

  useImperativeHandle(ref, () => ({ saveFlow: () => handleSaveFlow(false), exportExcel: handleExportExcel, getSOPData: getSOPData }));

  const updateStep = <K extends keyof SOPStep>(index: number, field: K, value: SOPStep[K]) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleInsertRow = () => {
    const target = window.prompt("Masukkan NOMOR baris untuk menyisipkan (akan terselip tepat di atas baris itu):");
    if (!target) return;
    const targetNum = parseInt(target, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > steps.length + 1) return alert("Nomor tidak valid!");
    
    const insertIndex = targetNum - 1;
    const prevCol = insertIndex > 0 ? steps[insertIndex - 1].pelaksanaCol : 0;
    
    const newSteps = [...steps];
    newSteps.splice(insertIndex, 0, { id: `step-${Date.now()}`, kegiatan: '', pelaksanaCol: prevCol, symbol: 'process', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' });
    setSteps(newSteps);
  };

  const toggleLoopTarget = (absIdx: number) => {
    const step = steps[absIdx];
    if (step.loopTarget) {
      updateStep(absIdx, 'loopTarget', undefined); 
    } else {
      const target = window.prompt("Panah cabang ini akan mengarah (kembali/lanjut) ke NOMOR TAMPILAN baris berapa? (Misal: 6)");
      if (target) updateStep(absIdx, 'loopTarget', target.trim());
    }
  };

  const getExecutorStyles = () => {
    const count = pelaksanaHeaders.length;
    if (count > 6) return "text-[8px] leading-tight";
    if (count > 5) return "text-[9px] leading-tight";
    if (count > 4) return "text-[9px] leading-tight";
    if (count > 3) return "text-[10px] leading-tight";
    return "text-[11px] leading-tight";
  };

  const getWaktuWidth = () => {
    const count = pelaksanaHeaders.length;
    if (count > 6) return '5%';
    if (count > 5) return '6%';
    if (count > 4) return '7%';
    if (count > 3) return '8%';
    return '9%';
  };

  const getWaktuFontClass = () => {
    const count = pelaksanaHeaders.length;
    if (count > 6) return 'text-[8px]';
    if (count > 5) return 'text-[9px]';
    if (count > 4) return 'text-[10px]';
    if (count > 3) return 'text-[11px]';
    return 'text-[12px]';
  };

  const displayNumbers = useMemo(() => {
    let counter = 1;
    return steps.map((step) => {
      if (step.nomorOverride !== undefined) {
        if (step.nomorOverride.trim() === '') {
          return '';
        } else {
          const match = step.nomorOverride.match(/^(\d+)/);
          if (match) {
            counter = parseInt(match[1], 10) + 1; 
          }
          return step.nomorOverride;
        }
      } else {
        const val = String(counter);
        counter++;
        return val;
      }
    });
  }, [steps]);

  const renderSymbolBox = (step: SOPStep, absIdx: number, colIdx: number, localIdx: number, chunkLength: number) => {
    const isCurr = step.pelaksanaCol === colIdx;
    
    // 1. Ambil data baris sebelumnya (jika ada)
    const prevStep = absIdx > 0 ? steps[absIdx - 1] : null;
    
    // 2. Gunakan localIdx > 0 untuk proteksi awal halaman
    const prevCol = (localIdx > 0 && prevStep && prevStep.arrowDown) ? prevStep.pelaksanaCol : null;
    
    const nextCol = absIdx < steps.length - 1 ? steps[absIdx + 1].pelaksanaCol : null;
    const isDiamond = step.symbol === 'decision';
    
    // Auto-scale shape & offset agar panah tidak error saat > 10 pelaksana
    let shapeClass = "w-14 h-8 text-[8px]";
    let offsetW = isDiamond ? '16px' : '28px';
    let offsetH = isDiamond ? '16px' : '16px';

    if (pelaksanaHeaders.length > 7) {
      shapeClass = "w-8 h-6 text-[6px]";
      offsetW = isDiamond ? '12px' : '16px';
      offsetH = isDiamond ? '12px' : '12px';
    } else if (pelaksanaHeaders.length > 5) {
      shapeClass = "w-10 h-6 text-[7px]";
      offsetW = isDiamond ? '14px' : '20px';
      offsetH = isDiamond ? '14px' : '12px';
    }

    if (!isCurr) {
      return (
        <>
          <div onClick={() => !isViewOnly && updateStep(absIdx, 'pelaksanaCol', colIdx)} className="absolute inset-0 cursor-pointer z-10 hover:bg-blue-50/50 transition-colors" />
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible" preserveAspectRatio="none">
            {prevCol !== null && (
              <>
                {colIdx === prevCol && (
                  <>
                    {localIdx > 0 && <line x1="50%" y1="0" x2="50%" y2="50%" stroke="black" strokeWidth="1.5" />}
                    <line x1="50%" y1="50%" x2={step.pelaksanaCol > colIdx ? "100%" : "0"} y2="50%" stroke="black" strokeWidth="1.5" />
                  </>
                )}
                {((colIdx > prevCol && colIdx < step.pelaksanaCol) || (colIdx < prevCol && colIdx > step.pelaksanaCol)) && (
                  <line x1="0" y1="50%" x2="100%" y2="50%" stroke="black" strokeWidth="1.5" />
                )}
              </>
            )}
          </svg>
        </>
      );
    }

    let Shape;
    const commonClass = `mx-auto bg-white border-2 border-black z-30 relative flex items-center justify-center font-bold ${shapeClass}`;
    const shapeId = `shape-${absIdx}`;
    
    switch (step.symbol) {
      case 'start': case 'end': Shape = <div id={shapeId} className={`${commonClass} rounded-full uppercase`}>START</div>; break;
      case 'decision': Shape = <div id={shapeId} className={`${commonClass.replace(/w-\d+ h-\d+/, "w-8 h-8")} rotate-45`}><div className="-rotate-45">?</div></div>; break;
      case 'connector': Shape = (
        <div id={shapeId} className="w-8 h-8 relative flex items-center justify-center mx-auto z-30">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible"><polygon points="0,0 100,0 100,65 50,100 0,65" fill="white" stroke="black" strokeWidth="6" /></svg>
          <span className="z-30 text-[8px] font-black pb-1">HAL</span>
        </div>
      ); break;
      default: Shape = <div id={shapeId} className={`${commonClass} uppercase`}>PROSES</div>;
    }

    const isLastInChunk = localIdx === chunkLength - 1;
    const isConnector = step.symbol === 'connector';
    const isFirstInChunk = localIdx === 0;
    const showDownLine = step.arrowDown && !isLastInChunk && !(isConnector && !isFirstInChunk);

    return (
      <>
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-20" preserveAspectRatio="none">
          <defs>
            <marker id={`head-${absIdx}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="black" /></marker>
          </defs>

          {prevCol !== null && (
            prevCol === colIdx ? (
              localIdx > 0 && <line x1="50%" y1="0" x2="50%" y2={`calc(50% - ${offsetH})`} stroke="black" strokeWidth="1.5" markerEnd={`url(#head-${absIdx})`} />
            ) : (
              <line x1={prevCol > colIdx ? "100%" : "0"} y1="50%" x2={`calc(50% ${prevCol > colIdx ? '+' : '-'} ${offsetW})`} y2="50%" stroke="black" strokeWidth="1.5" markerEnd={`url(#head-${absIdx})`} />
            )
          )}

          {nextCol !== null && showDownLine && (
            <g>
              <line x1="50%" y1={`calc(50% + ${offsetH})`} x2="50%" y2="100%" stroke="black" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {nextCol !== null && step.arrowDown && step.symbol === 'decision' && (
          <div className="absolute left-[calc(50%+4px)] top-[calc(50%+20px)] text-[9px] font-bold text-black leading-none pointer-events-none z-30 print:hidden">Ya</div>
        )}
        
        {(() => {
          let targetIdx = -1;
          if (step.loopTarget) {
            targetIdx = displayNumbers.findIndex(n => n === step.loopTarget);
            if (targetIdx === -1 && !isNaN(parseInt(step.loopTarget))) {
              targetIdx = parseInt(step.loopTarget) - 1;
            }
          }

          return (
            <>
              {step.loopTarget && targetIdx !== -1 && step.symbol === 'decision' && (
                <div className="absolute left-[calc(50%+22px)] top-[calc(50%-10px)] text-[9px] font-bold text-black leading-none pointer-events-none z-30 print:hidden">Tidak</div>
              )}
              {step.loopTarget && targetIdx !== -1 && (
                <BranchArrow sourceIdx={absIdx} targetIdx={targetIdx} loopTargetStr={step.loopTarget} />
              )}
            </>
          );
        })()}

        <div className="relative w-full h-full min-h-20 flex flex-col items-center justify-center z-30 group/sym pointer-events-none">
          <div className="relative pointer-events-auto">
            {Shape}
            {!isViewOnly && (
              <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex flex-col gap-1 bg-white border border-slate-300 p-1.5 rounded-lg shadow-xl opacity-0 group-hover/sym:opacity-100 transition-opacity z-50 no-print font-sans pointer-events-auto">
                <div className="flex gap-1 border-b border-slate-200 pb-1.5">
                  <button onClick={(e) => { e.stopPropagation(); updateStep(absIdx, 'symbol', 'start')}} className="p-1 hover:bg-slate-100 rounded" title="Start/End"><Circle size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); updateStep(absIdx, 'symbol', 'process')}} className="p-1 hover:bg-slate-100 rounded" title="Proses"><Square size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); updateStep(absIdx, 'symbol', 'decision')}} className="p-1 hover:bg-slate-100 rounded" title="Decision/Kondisi"><Diamond size={14}/></button>
                  <button onClick={(e) => { e.stopPropagation(); updateStep(absIdx, 'symbol', 'connector')}} className="p-1 hover:bg-slate-100 rounded" title="Konektor Halaman"><Shield size={14}/></button>
                </div>
                <div className="flex gap-1 pt-1 justify-center">
                  <button onClick={(e) => { e.stopPropagation(); updateStep(absIdx, 'arrowDown', !step.arrowDown)}} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${step.arrowDown ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                    TURUN
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleLoopTarget(absIdx)}} className={`text-[9px] font-bold px-2 py-1 rounded transition-colors ${step.loopTarget ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    CABANG
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  // --- PEMBAGIAN BARIS DINAMIS (Pintar / Smart Chunking) ---
  const chunkedSteps: SOPStep[][] = [];
  let currentChunk: SOPStep[] = [];
  let currentChunkWeight = 0;

  steps.forEach((step) => {
    currentChunk.push(step);
    
    const textLength = (step.kegiatan?.length || 0) + (step.syarat?.length || 0) + (step.output?.length || 0) + (step.ket?.length || 0);
    
    let rowWeight = 1; 
    if (textLength > 400) {
      rowWeight = 4; 
    } else if (textLength > 250) {
      rowWeight = 3; 
    } else if (textLength > 120) {
      rowWeight = 2; 
    }

    currentChunkWeight += rowWeight;

    if (step.isPageBreak || currentChunkWeight >= 8 || currentChunk.length >= 8) {
      chunkedSteps.push(currentChunk);
      currentChunk = [];
      currentChunkWeight = 0;
    }
  });
  
  if (currentChunk.length > 0) {
    chunkedSteps.push(currentChunk);
  }

  // --- LOGIKA PEMISAH COVER ---
  const coverRows = [
    { id: 1, minH: "min-h-12", leftTitle: "Dasar Hukum:", leftVal: dasarHukum, leftSetter: setDasarHukum, rightTitle: "Kualifikasi Pelaksana:", rightVal: kualifikasi, rightSetter: setKualifikasi },
    { id: 2, minH: "min-h-12", leftTitle: "Keterkaitan:", leftVal: keterkaitan, leftSetter: setKeterkaitan, rightTitle: "Peralatan / Perlengkapan:", rightVal: peralatan, rightSetter: setPeralatan },
    { id: 3, minH: "min-h-12", leftTitle: "Peringatan:", leftVal: peringatan, leftSetter: setPeringatan, rightTitle: "Pencatatan dan Pendataan:", rightVal: pencatatan, rightSetter: setPencatatan }
  ];

  const coverChunks: typeof coverRows[] = [];
  let currentCoverChunk: typeof coverRows = [];
  coverRows.forEach(row => {
    currentCoverChunk.push(row);
    if (coverBreaks[row.id]) {
      coverChunks.push(currentCoverChunk);
      currentCoverChunk = [];
    }
  });
  if (currentCoverChunk.length > 0) coverChunks.push(currentCoverChunk);

  return (
    <div className="h-full overflow-auto bg-slate-200 pb-20 p-2 md:p-6 print:h-auto print:overflow-visible print:bg-white print:p-0 flex flex-col items-center font-bookman">
      
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 no-print font-sans">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-800">Simpan Dokumen SOP</h3>
              <p className="text-sm text-slate-500 mt-1">Pilih tindakan yang ingin Anda lakukan terhadap dokumen draft ini.</p>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <button 
                onClick={() => { handleSaveFlow(false); setIsSaveModalOpen(false); }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 p-3 rounded-xl font-bold transition-colors"
              >
                <Save size={18} />
                Simpan sebagai Draft Lokal
              </button>
              <button 
                onClick={() => { handleSubmitOrtala(); setIsSaveModalOpen(false); }}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl font-bold shadow-md transition-colors"
              >
                <Send size={18} />
                Simpan & Kirim ke Biro Ortala
              </button>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="w-full max-w-[330mm] mb-4 bg-white p-3 rounded-2xl shadow-sm border flex flex-col justify-between items-center gap-4 no-print sticky top-0 z-40 font-sans">
        <div className="flex flex-wrap items-center justify-between w-full gap-2 border-b pb-2">
          <div className="flex gap-2">
            <button onClick={handleGoBack} className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95 border border-slate-200">
              <ArrowLeft size={16} /> Kembali
            </button>
            {!isViewOnly && (
              <>
                <button onClick={() => setIsSaveModalOpen(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><Save size={16} /> Simpan</button>
                <button onClick={() => setSteps([...steps, { id: `step-${Date.now()}`, kegiatan: '', pelaksanaCol: 0, symbol: 'process', arrowDown: true, waktu: '', syarat: '', output: '', ket: '' }])} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><Plus size={16} /> Tambah Baris Baru</button>
                <button onClick={handleInsertRow} className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><ArrowDownToLine size={16} /> Sisip baris sebelumnya</button>
                <button onClick={() => setPelaksanaHeaders([...pelaksanaHeaders, ''])} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><UserPlus size={16} /> Tambah Pelaksana</button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><FileSpreadsheet size={16} /> Excel</button>
            <button onClick={() => window.print()} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95"><Printer size={16} /> Cetak (F4)</button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center bg-slate-100 p-1 rounded-xl shadow-inner w-full">
          <button onClick={() => setActiveTab('cover')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex-1 ${activeTab === 'cover' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Cover SOP</button>
          {chunkedSteps.map((_, i) => (
            <button key={i} onClick={() => setActiveTab(i)} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex-1 ${activeTab === i ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Alur {i + 1}</button>
          ))}
        </div>
      </div>

      {/* BANNER INFORMASI - Hanya muncul saat di Cover & bukan view only */}
      {!isViewOnly && activeTab === 'cover' && (
        <div className="w-full max-w-[330mm] bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-sans p-3 rounded-xl mb-4 print:hidden flex items-start gap-2 shadow-sm">
          <Info size={16} className="shrink-0 mt-0.5" />
          <p><b>Fitur Pemisah Cover:</b> Jika kolom Dasar Hukum dsb terlalu panjang, Anda bisa menekan tombol <b>✂️ Pisah ke Halaman Baru</b>. Tombol ini hanya akan terlihat saat Anda mengedit web, dan tidak akan muncul di hasil PDF.</p>
        </div>
      )}

      {/* COVER UTAMA (FLEKSIBEL / RESPONSIVE) */}
      {coverChunks.map((chunk, chunkIdx) => (
        <React.Fragment key={`cover-chunk-${chunkIdx}`}>
          <div className={`paper-f4-landscape-auto shadow-2xl p-[6mm] border border-slate-300 text-black cover-page-container flex-col ${activeTab === 'cover' ? 'flex mb-8 print:mb-0' : 'hidden print:flex'}`}>
            <table className="w-full border-collapse border-2 border-black table-fixed cover-table mb-auto">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
              </colgroup>
              <tbody>
                {chunkIdx === 0 && (
                  <tr>
                    <td colSpan={4} className="border-2 border-black p-4 text-center align-middle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src="/e-sop-atrbpn/logo-bpn.png" 
                        alt="Logo ATR BPN" 
                        className="w-20 h-20 object-contain mb-3 mx-auto" 
                      />
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
                       <div className={`p-2 text-[12px] ${row.minH}`}><EditableCell value={row.leftVal} onChange={row.leftSetter} /></div>

                       {!isViewOnly && !coverBreaks[row.id] && row.id !== 3 && (
                         <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 z-50 no-print font-sans pointer-events-auto">
                           <button 
                             onClick={() => setCoverBreaks({...coverBreaks, [row.id]: true})}
                             className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full border border-slate-300 shadow-md transition-all active:scale-95 whitespace-nowrap"
                           >
                             ✂️ Pisah ke Halaman Baru
                           </button>
                         </div>
                       )}
                    </td>
                    <td colSpan={5} className="border-2 border-black align-top p-0">
                       <div className="p-1.5 bg-slate-100 font-bold uppercase text-[12px] border-b-2 border-black">{row.rightTitle}</div>
                       <div className={`p-2 text-[12px] ${row.minH}`}><EditableCell value={row.rightVal} onChange={row.rightSetter} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex-1 bg-transparent pointer-events-none" />
          </div>

          {!isViewOnly && activeTab === 'cover' && chunkIdx < coverChunks.length - 1 && (
             <div className="w-full max-w-[330mm] flex justify-center -mt-4 mb-8 relative z-10 print:hidden font-sans">
               <button 
                  onClick={() => {
                     const lastRowId = chunk[chunk.length - 1].id;
                     setCoverBreaks({...coverBreaks, [lastRowId]: false});
                  }} 
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-bold rounded-full border border-amber-300 shadow-md flex items-center gap-2 transition-all"
               >
                 🔗 Gabungkan Kembali Halaman
               </button>
             </div>
          )}
        </React.Fragment>
      ))}

      {/* HALAMAN ALUR */}
      {chunkedSteps.map((chunk, chunkIdx) => {
        const startAbsIdx = steps.findIndex(s => s.id === chunk[0].id);
        return (
          <div key={chunkIdx} className={`paper-f4-landscape shadow-2xl p-[6mm] border border-slate-300 text-black flex flex-col page-container ${activeTab === chunkIdx ? 'flex' : 'hidden print:flex'} font-bookman`}>
            
            {/* Header Kiri Atas dan Judul SOP Saja */}
            <div className="flex justify-between items-end mb-3 border-b-4 border-black pb-1 shrink-0">
              <h2 className="text-lg font-black uppercase">{judul || 'JUDUL SOP'}</h2>
            </div>
            
            <div className="flex-1 overflow-visible">
              <table className="w-full border-collapse border-2 border-black table-fixed overflow-visible relative font-bookman">
                
                <colgroup>
                  <col style={{ width: '3%' }} /> 
                  <col style={{ width: '18%' }} /> 
                  
                  {pelaksanaHeaders.map((_, i) => (
                    <col key={`col-pelaksana-${i}`} style={{ width: `${35 / Math.max(1, pelaksanaHeaders.length)}%` }} /> 
                  ))}
                  
                  <col style={{ width: '12%' }} /> 
                  <col style={{ width: getWaktuWidth() }} /> 
                  <col style={{ width: '12%' }} /> 
                  <col style={{ width: '10%' }} /> 
                  {!isViewOnly && <col style={{ width: '4%' }} className="no-print" />}
                </colgroup>

                <thead className={getExecutorStyles()}>
                  <tr className="bg-slate-100 font-black uppercase text-center h-8">
                    <th rowSpan={2} className="border-b-2 border-r-2 border-black p-1.5">No</th>
                    <th rowSpan={2} className="border-b-2 border-r-2 border-black p-1.5">Kegiatan</th>
                    <th colSpan={pelaksanaHeaders.length} className="border-b-2 border-r-2 border-black p-1">Pelaksana</th>
                    <th colSpan={3} className="border-b-2 border-r-2 border-black p-1">Mutu Baku</th>
                    <th rowSpan={2} className="border-b-2 border-r-2 border-black p-1">Keterangan</th>
                    {!isViewOnly && <th rowSpan={2} className="border-b-2 border-black p-1 no-print">Aksi</th>}
                  </tr>
                  <tr className="bg-slate-50 font-bold uppercase text-center h-8">
                    {pelaksanaHeaders.map((h, i) => (
                      <th key={i} className={`border-b-2 border-r-2 border-black p-1 relative group/h ${i === pelaksanaHeaders.length - 1 ? '' : 'border-r-2 border-black'}`}>
                        <EditableCell value={h} onChange={(val) => {const n=[...pelaksanaHeaders]; n[i]=val.toUpperCase(); setPelaksanaHeaders(n);}} center={true} placeholder={`P${i+1}`} className="font-black text-center wrap-break-word" />
                        {!isViewOnly && <button onClick={() => setPelaksanaHeaders(pelaksanaHeaders.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 text-red-600 no-print opacity-0 group-hover/h:opacity-100 active:scale-125 bg-white rounded-full z-50"><UserMinus size={10}/></button>}
                      </th>
                    ))}
                    <th className="border-b-2 border-r-2 border-black p-1">Kelengkapan</th>
                    <th className="border-b-2 border-r-2 border-black p-1">Waktu</th>
                    <th className="border-b-2 border-r-2 border-black p-1 italic">Output</th>
                  </tr>
                </thead>
                <tbody className="text-[12px] font-bold align-top divide-y-2 divide-black overflow-visible">
                  {chunk.map((step, localIdx) => {
                    const absIdx = startAbsIdx + localIdx;
                    return (
                      <tr key={step.id} className="overflow-visible">
                        <td className="border-r-2 border-black p-2 text-center font-black relative" title="Ketik 'auto' untuk mengembalikan ke urutan otomatis">
                          <EditableCell 
                            value={displayNumbers[absIdx]} 
                            onChange={(val) => {
                              if (val.trim().toLowerCase() === 'auto') {
                                updateStep(absIdx, 'nomorOverride', undefined);
                              } else {
                                updateStep(absIdx, 'nomorOverride', val);
                              }
                            }} 
                            center={true} 
                          />
                        </td>
                        <td className="border-r-2 border-black p-2 px-1.5 font-medium leading-snug relative overflow-visible align-top">
                          <EditableCell value={step.kegiatan} onChange={(val) => updateStep(absIdx, 'kegiatan', val)} placeholder="..." className="text-[12px]" />
                        </td>
                        
                        {pelaksanaHeaders.map((_, i) => (
                          <td key={i} className="border-r-2 border-black p-0 text-center align-middle relative h-full overflow-visible">
                            {renderSymbolBox(step, absIdx, i, localIdx, chunk.length)}
                          </td>
                        ))}

                        <td className="border-r-2 border-black p-2 px-1.5 font-medium leading-tight relative align-top">
                          <EditableCell value={step.syarat} onChange={(val) => updateStep(absIdx, 'syarat', val)} className="text-[12px]" />
                        </td>
                        
                        <td className={`border-r-2 border-black py-2 px-0.5 text-center font-bold leading-tight relative align-top ${getWaktuFontClass()}`}>
                          <EditableCell value={step.waktu} onChange={(val) => updateStep(absIdx, 'waktu', val)} center={true} className={`min-h-0! ${getWaktuFontClass()}`} />
                        </td>
                        
                        <td className="border-r-2 border-black p-2 px-1.5 font-medium leading-tight relative align-top italic">
                          <EditableCell value={step.output} onChange={(val) => updateStep(absIdx, 'output', val)} className="text-[12px] italic" />
                        </td>
                        <td className="border-r-2 border-black p-2 px-1.5 font-medium leading-tight relative align-top">
                          <EditableCell value={step.ket} onChange={(val) => updateStep(absIdx, 'ket', val)} placeholder="..." className="text-[12px]" />
                        </td>
                        
                        {!isViewOnly && (
                          <td className="p-1 text-center no-print align-middle relative z-50">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <button onClick={() => updateStep(absIdx, 'isPageBreak', !step.isPageBreak)} title={step.isPageBreak ? "Hapus Batas Halaman" : "Jadikan Batas Halaman (Potong ke Tab Baru)"} className={`p-1 rounded w-full border ${step.isPageBreak ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                                <span className="text-[8px] font-black leading-tight block">BATAS<br/>HAL</span>
                              </button>
                              <button onClick={() => setSteps(steps.filter((_, idx) => idx !== absIdx))} title="Hapus Baris" className="text-red-500 hover:text-white border border-red-200 hover:bg-red-500 p-1 rounded transition-colors w-full flex justify-center"><Trash2 size={14}/></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Keterangan Halaman di Kanan Bawah */}
            <div className="mt-auto pt-4 text-right text-[11px] font-bold uppercase shrink-0">
              Halaman {chunkIdx + 1}
            </div>
            
          </div>
        );
      })}
    </div>
  );
});

SOPBuilder.displayName = 'SOPBuilder';
export default SOPBuilder;