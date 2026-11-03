'use client';

// Kartu hasil ulasan di halaman About: rata-rata bintang, nilai per aspek, dan testimoni
// yang bergulir otomatis (berhenti saat disorot/disentuh). Admin & superadmin dapat menghapus.
import { useCallback, useEffect, useState } from 'react';
import { Star, Trash2, MessageSquareQuote, PenLine } from 'lucide-react';
import StarRating from './StarRating';
import ReviewModal, { EVENT_ULASAN } from './ReviewModal';
import { useAppContext } from '@/lib/app-context';
import { useConfirm } from './ConfirmDialog';

const API_BASE = '/e-sop-atrbpn/api';

interface Ringkasan { jumlah: number; rata: number | null; mudah: number | null; cepat: number | null; tampilan: number | null; sebaran: number[] }
interface Ulasan { id: number; nama: string; unit: string | null; rating: number; komentar: string; created_at: string; updated_at: string; mine: boolean }

const bulan = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

export default function ReviewPanel() {
  const { currentUser, isDarkMode } = useAppContext();
  const { confirm, confirmNode } = useConfirm();
  const [data, setData] = useState<{ ringkasan: Ringkasan; items: Ulasan[] } | null>(null);
  const [galat, setGalat] = useState(false);
  const [buka, setBuka] = useState(false);
  const bisaHapus = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const muat = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_BASE}/reviews`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      setData(await r.json()); setGalat(false);
    } catch { setGalat(true); }
  }, []);
  useEffect(() => { muat(); }, [muat]);
  useEffect(() => { const f = () => muat(); window.addEventListener(EVENT_ULASAN, f); return () => window.removeEventListener(EVENT_ULASAN, f); }, [muat]);

  const hapus = async (u: Ulasan) => {
    if (!(await confirm({ title: 'Hapus Testimoni', message: `Hapus ulasan dari "${u.nama}"? Tindakan ini tidak dapat dibatalkan.`, tone: 'danger', confirmText: 'Ya, Hapus' }))) return;
    const token = localStorage.getItem('token');
    const r = await fetch(`${API_BASE}/reviews/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) muat(); else alert('Gagal menghapus ulasan.');
  };

  const dm = isDarkMode;
  const heading = dm ? 'text-white' : 'text-[#002855]';
  const body = dm ? 'text-slate-300' : 'text-slate-600';
  const muted = dm ? 'text-slate-400' : 'text-slate-500';
  const garis = dm ? 'border-slate-800' : 'border-slate-100';
  const r = data?.ringkasan;
  const items = data?.items ?? [];
  const bergulir = items.length >= 3;
  const detik = Math.max(18, items.length * 7);

  const kartu = (u: Ulasan, kunci: string) => (
    <div key={kunci} className={`rounded-xl border p-3.5 mb-3 ${dm ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[13px] font-extrabold leading-tight truncate ${heading}`}>{u.nama}</p>
          <p className={`text-[11px] leading-tight mt-0.5 truncate ${muted}`}>{u.unit} · {bulan(u.updated_at)}</p>
        </div>
        {bisaHapus && (
          <button onClick={() => hapus(u)} title="Hapus testimoni" aria-label="Hapus testimoni" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <div className="mt-1.5"><StarRating value={u.rating} size={14} /></div>
      <p className={`text-[13px] leading-relaxed mt-1.5 ${body}`}>&ldquo;{u.komentar}&rdquo;</p>
    </div>
  );

  return (
    <aside className={`rounded-2xl border overflow-hidden flex flex-col lg:sticky lg:top-0 ${dm ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
      {confirmNode}
      <style>{`
        @keyframes simpel-gulir { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        .simpel-gulir { animation: simpel-gulir var(--dur) linear infinite; }
        .simpel-gulir-wadah:hover .simpel-gulir, .simpel-gulir-wadah:focus-within .simpel-gulir, .simpel-gulir-wadah:active .simpel-gulir { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .simpel-gulir { animation: none; } }
      `}</style>

      <div className={`px-5 py-4 border-b ${garis} ${dm ? 'bg-slate-900/40' : 'bg-slate-50/60'}`}>
        <p className={`text-base font-extrabold flex items-center gap-2 ${heading}`}><MessageSquareQuote className="w-4 h-4 text-[#A29061]" /> Ulasan Pengguna</p>
        <p className={`text-xs mt-0.5 ${muted}`}>Kata mereka yang memakai SIMPEL setiap hari</p>
      </div>

      <div className="px-5 py-4 shrink-0">
        {!r || r.jumlah === 0 ? (
          <p className={`text-sm ${muted}`}>{galat ? 'Ulasan belum dapat dimuat.' : 'Belum ada ulasan. Jadilah yang pertama memberi penilaian.'}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <p className={`text-4xl font-extrabold leading-none ${heading}`}>{String(r.rata).replace('.', ',')}</p>
              <div>
                <StarRating value={r.rata ?? 0} size={18} />
                <p className={`text-xs mt-1 ${muted}`}>dari {r.jumlah} ulasan</p>
              </div>
            </div>
            <div className="mt-3.5 space-y-2">
              {[['Kemudahan', r.mudah], ['Kecepatan', r.cepat], ['Tampilan', r.tampilan]].map(([nama, v]) => (
                <div key={nama as string} className="flex items-center gap-2.5">
                  <span className={`text-xs w-20 shrink-0 ${body}`}>{nama}</span>
                  <div className={`flex-1 h-2 rounded-full overflow-hidden ${dm ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${((v as number) / 5) * 100}%` }} />
                  </div>
                  <span className={`text-xs font-bold w-8 text-right ${heading}`}>{String(v).replace('.', ',')}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <button onClick={() => setBuka(true)} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-extrabold text-white bg-linear-to-r from-[#A29061] to-[#8c7a4b] shadow-sm hover:shadow-md active:scale-95 transition-all">
          <PenLine className="w-4 h-4" /> Beri Ulasan
        </button>
      </div>

      {items.length > 0 && (
        <div className={`border-t ${garis} px-4 pt-3 pb-1 shrink-0`}>
          <p className={`text-[10px] font-extrabold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${muted}`}><Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Testimoni</p>
          <div className={`simpel-gulir-wadah relative max-h-80 ${bergulir ? 'h-80 overflow-hidden' : 'overflow-y-auto'}`} tabIndex={0}>
            <div className={bergulir ? 'simpel-gulir' : ''} style={{ ['--dur' as string]: `${detik}s` }}>
              {items.map(u => kartu(u, `a${u.id}`))}
              {bergulir && items.map(u => kartu(u, `b${u.id}`))}
            </div>
          </div>
        </div>
      )}
      {buka && <ReviewModal onClose={() => setBuka(false)} />}
    </aside>
  );
}
