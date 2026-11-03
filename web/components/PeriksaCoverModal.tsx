'use client';

/* Popup "Periksa Cover" SOP — menampilkan cover bertanda tangan (PDF/gambar) di dalam
   aplikasi (bukan tab baru) dengan zoom, plus tombol Setujui Cover / Kembalikan untuk
   admin saat status verifikasi. Aksi memakai alur yang sudah ada di halaman daftar
   (Setujui → popup nomor SOP; Kembalikan → popup catatan). */

import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, ExternalLink, FileSignature, CheckCircle, RotateCcw, Loader2 } from 'lucide-react';
import PratinjauPdf from '@/components/PratinjauPdf';

const API_BASE = '/e-sop-atrbpn/api';
const LANGKAH = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export default function PeriksaCoverModal({ model, token, isDarkMode, bolehPutuskan, adaTteAsli, onSetujui, onKembalikan, onClose }: {
  model: { id: number; process_title: string; process_key?: string | null };
  token: string;
  isDarkMode?: boolean;
  /** Admin & status verifikasi → tampilkan tombol Setujui Cover / Kembalikan. */
  bolehPutuskan: boolean;
  /** Ada berkas TTE utuh yang tersimpan → tombol buka dokumen asli. */
  adaTteAsli?: boolean;
  onSetujui: () => void;
  onKembalikan: () => void;
  onClose: () => void;
}) {
  const [berkas, setBerkas] = useState<{ url: string; mime: string } | null>(null);
  const [galat, setGalat] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let aktif = true, url: string | null = null;
    fetch(`${API_BASE}/sop/models/${model.id}/cover`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error('Cover belum tersedia.');
        const blob = await r.blob();
        if (!aktif) return;
        url = URL.createObjectURL(blob);
        setBerkas({ url, mime: blob.type });
      })
      .catch(e => { if (aktif) setGalat(e instanceof Error ? e.message : 'Gagal memuat cover.'); });
    return () => { aktif = false; if (url) URL.revokeObjectURL(url); };
  }, [model.id, token]);

  // Tutup dengan Esc; zoom dengan Ctrl + / Ctrl − / Ctrl 0.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); ubahZoom(1); }
      else if (e.key === '-') { e.preventDefault(); ubahZoom(-1); }
      else if (e.key === '0') { e.preventDefault(); setZoom(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ubahZoom = (arah: 1 | -1) => setZoom(z => {
    const i = LANGKAH.findIndex(v => v >= z - 1e-6);
    const j = Math.min(LANGKAH.length - 1, Math.max(0, (i < 0 ? LANGKAH.length - 1 : i) + arah));
    return LANGKAH[j];
  });

  const bukaAsli = async (asli: boolean) => {
    try {
      const r = await fetch(`${API_BASE}/sop/models/${model.id}/cover${asli ? '?asli=1' : ''}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const u = URL.createObjectURL(await r.blob());
      window.open(u, '_blank');
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch { alert('Berkas tidak tersedia.'); }
  };

  const dm = isDarkMode;
  const tombolIkon = `p-2 rounded-lg transition-colors disabled:opacity-40 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`;
  const isPdf = berkas?.mime.includes('pdf');

  return (
    <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className={`w-full max-w-6xl h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        {/* Kepala */}
        <div className={`flex items-center gap-3 px-4 sm:px-5 py-3 border-b shrink-0 ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 grid place-items-center shrink-0"><FileSignature className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm sm:text-base font-bold ${dm ? 'text-white' : 'text-[#002855]'}`}>Periksa Cover Bertanda Tangan</h3>
            <p className={`text-xs truncate ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{model.process_title}{model.process_key ? ` · No: ${model.process_key}` : ''}</p>
          </div>
          <button onClick={onClose} title="Tutup (Esc)" className={tombolIkon}><X className="w-5 h-5" /></button>
        </div>

        {/* Bilah zoom */}
        <div className={`flex items-center gap-1 px-3 sm:px-4 py-2 border-b shrink-0 flex-wrap ${dm ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
          <button onClick={() => ubahZoom(-1)} disabled={zoom <= LANGKAH[0]} title="Perkecil (Ctrl −)" className={tombolIkon}><ZoomOut className="w-4 h-4" /></button>
          <span className={`w-14 text-center text-xs font-bold tabular-nums ${dm ? 'text-slate-200' : 'text-slate-700'}`}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => ubahZoom(1)} disabled={zoom >= LANGKAH[LANGKAH.length - 1]} title="Perbesar (Ctrl +)" className={tombolIkon}><ZoomIn className="w-4 h-4" /></button>
          <button onClick={() => setZoom(1)} title="Pas lebar (Ctrl 0)" className={`${tombolIkon} flex items-center gap-1 text-xs font-bold`}><Maximize2 className="w-4 h-4" /> <span className="hidden sm:inline">Pas lebar</span></button>
          <div className="flex-1" />
          {adaTteAsli && (
            <button onClick={() => bukaAsli(true)} title="Buka dokumen TTE utuh seperti yang diunggah" className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${dm ? 'border-emerald-700 text-emerald-300 hover:bg-emerald-900/30' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>Dokumen TTE Asli</button>
          )}
          <button onClick={() => bukaAsli(false)} title="Buka cover di tab baru" className={`${tombolIkon} flex items-center gap-1 text-xs font-bold`}><ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">Tab baru</span></button>
        </div>

        {/* Penampil */}
        <div className={`flex-1 min-h-0 ${dm ? 'bg-slate-900' : 'bg-slate-200'}`}>
          {galat ? (
            <div className="h-full grid place-items-center text-sm font-semibold text-slate-500">{galat}</div>
          ) : !berkas ? (
            <div className="h-full grid place-items-center text-sm font-semibold text-slate-500"><span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat cover…</span></div>
          ) : isPdf ? (
            <PratinjauPdf url={berkas.url} zoom={zoom} className="p-3 sm:p-5" />
          ) : (
            <div className="h-full overflow-auto p-3 sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={berkas.url} alt="Cover bertanda tangan" className="block mx-auto bg-white shadow" style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
            </div>
          )}
        </div>

        {/* Aksi */}
        <div className={`flex items-center gap-2 px-4 sm:px-5 py-3 border-t shrink-0 flex-wrap ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
          <p className={`text-[11px] flex-1 min-w-48 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
            {bolehPutuskan ? 'Periksa tanda tangan pimpinan dan nomor SOP pada cover, lalu putuskan.' : 'Cover bertanda tangan yang diunggah unit kerja.'}
          </p>
          {bolehPutuskan ? (<>
            <button onClick={onKembalikan} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-50 hover:bg-red-500 hover:text-white text-red-700 border border-red-200 flex items-center gap-1.5 transition-colors"><RotateCcw className="w-4 h-4" /> Kembalikan</button>
            <button onClick={onSetujui} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition-colors"><CheckCircle className="w-4 h-4" /> Setujui Cover</button>
          </>) : (
            <button onClick={onClose} className={`px-5 py-2.5 rounded-xl text-sm font-bold border ${dm ? 'border-slate-600 text-slate-200' : 'border-slate-200 text-slate-700'}`}>Tutup</button>
          )}
        </div>
      </div>
    </div>
  );
}
