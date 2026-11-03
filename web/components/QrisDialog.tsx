'use client';

// Popup QRIS untuk mendukung pengembang (menggantikan tautan langsung ke situs donasi).
// Tidak bergantung pada konteks aplikasi agar bisa dipakai juga di halaman login/bagikan.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function QrisDialog({ onClose, isDarkMode = false }: { onClose: () => void; isDarkMode?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  if (!mounted) return null;

  const dm = isDarkMode;
  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col ${dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`} style={{ maxHeight: '94vh' }} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
          <p className={`font-extrabold text-sm ${dm ? 'text-white' : 'text-[#002855]'}`}>Dukung Pengembang</p>
          <button onClick={onClose} aria-label="Tutup" className={`p-1.5 rounded-lg ${dm ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/e-sop-atrbpn/qris-dukung.jpg" alt="Kode QRIS untuk mendukung pengembang E-SIMPEL" className="w-full max-h-[68vh] object-contain rounded-xl border border-slate-200 bg-white" />
          <p className={`text-xs text-center leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
            Pindai dengan aplikasi e-wallet atau m-banking apa pun yang mendukung QRIS. Terima kasih atas dukungannya.
          </p>
          <button onClick={onClose} className={`px-6 py-2 rounded-xl text-sm font-bold border ${dm ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Tutup</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
