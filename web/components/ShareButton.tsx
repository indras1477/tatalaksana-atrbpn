'use client';

// Tombol "Bagikan" — buat tautan view-only publik (tanpa login) untuk sebuah
// dokumen BPMN/SOP/SP, lalu tampilkan modal berisi tautan + salin/WhatsApp/buka.
import { useState } from 'react';
import { Share2, Copy, Check, ExternalLink, X, Loader2 } from 'lucide-react';

const API_BASE = '/e-sop-atrbpn/api';

export default function ShareButton({ kind, modelId, token, isDarkMode, variant = 'icon' }: {
  kind: 'bpmn' | 'sop' | 'sp';
  modelId: number;
  token: string;
  isDarkMode?: boolean;
  variant?: 'icon' | 'button' | 'solid';
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true); setLoading(true); setErr(''); setCopied(false);
    try {
      const res = await fetch(`${API_BASE}/${kind}/models/${modelId}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json().catch(() => ({} as { error?: string })); throw new Error(d.error || 'Gagal membuat tautan'); }
      const d = await res.json();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setUrl(`${origin}/e-sop-atrbpn/share/${kind}/${d.token}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Gagal'); }
    finally { setLoading(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard mungkin diblokir */ }
  };

  return (
    <>
      {variant === 'solid' ? (
        <button onClick={handleShare} title="Bagikan (tautan view-only, tanpa perlu login)"
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-1.5 transition-all active:scale-95">
          <Share2 size={16} /> Bagikan
        </button>
      ) : variant === 'icon' ? (
        <button onClick={handleShare} title="Bagikan (tautan view-only)"
          className={`p-2.5 rounded-lg transition-colors hover:text-teal-600 hover:bg-teal-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          <Share2 className="w-4 h-4" />
        </button>
      ) : (
        <button onClick={handleShare}
          className={`px-3 py-2.5 text-teal-600 hover:bg-teal-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-teal-200`}>
          <Share2 className="w-4 h-4" /> Bagikan
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-700"><Share2 className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold text-sm">Bagikan Dokumen</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tautan view-only — bisa dibuka tanpa login.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="flex flex-col items-center gap-2 py-6 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-xs">{kind === 'sop' ? 'Menyiapkan dokumen (render PDF)…' : 'Membuat tautan…'}</p>
                </div>
              ) : err ? (
                <p className="text-sm text-red-500 py-4 text-center">{err}</p>
              ) : (
                <>
                  <label className={`text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Tautan Publik</label>
                  <div className="flex gap-2 mt-1">
                    <input readOnly value={url} onClick={e => (e.target as HTMLInputElement).select()}
                      className={`flex-1 min-w-0 px-3 py-2.5 rounded-xl border text-xs outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`} />
                    <button onClick={copy} className={`shrink-0 px-3 rounded-xl text-sm font-bold flex items-center gap-1.5 ${copied ? 'bg-emerald-600 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
                      {copied ? <><Check className="w-4 h-4" /> Tersalin</> : <><Copy className="w-4 h-4" /> Salin</>}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <a href={url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><ExternalLink className="w-4 h-4" /> Buka</a>
                  </div>
                  <p className={`text-[11px] mt-3 leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Siapa pun yang punya tautan ini dapat melihat dokumen (tanpa mengubah).{kind === 'sop' ? ' PDF diperbarui setiap kali dibagikan ulang.' : ''}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
