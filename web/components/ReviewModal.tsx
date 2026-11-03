'use client';

// Formulir ulasan pengguna: nama, unit kerja, empat penilaian bintang, dan testimoni.
// Satu akun dapat dipakai beberapa orang, jadi setiap pengiriman = ulasan baru (tanpa fitur memperbarui).
// Setelah terkirim muncul ucapan terima kasih dari pengembang + tautan dukungan yang bisa ditutup.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Heart, Coffee, DollarSign, Loader2 } from 'lucide-react';
import StarRating from './StarRating';
import QrisDialog from './QrisDialog';
import { useAppContext } from '@/lib/app-context';

const API_BASE = '/e-sop-atrbpn/api';
export const EVENT_ULASAN = 'simpel-ulasan-berubah';

const PENILAIAN: { key: 'rating' | 'mudah' | 'cepat' | 'tampilan'; label: string; ket: string }[] = [
  { key: 'rating', label: 'Penilaian keseluruhan', ket: 'Kesan Anda secara umum' },
  { key: 'mudah', label: 'Kemudahan', ket: 'Mudah dipahami dan dipakai' },
  { key: 'cepat', label: 'Kecepatan', ket: 'Cepat dibuka dan diproses' },
  { key: 'tampilan', label: 'Tampilan', ket: 'Rapi dan nyaman dilihat' },
];

export default function ReviewModal({ onClose }: { onClose: () => void }) {
  const { currentUser, isDarkMode } = useAppContext();
  const [mounted, setMounted] = useState(false);
  const [nama, setNama] = useState('');
  const [unit, setUnit] = useState('');
  const [nilai, setNilai] = useState({ rating: 0, mudah: 0, cepat: 0, tampilan: 0 });
  const [komentar, setKomentar] = useState('');
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState('');
  const [selesai, setSelesai] = useState(false);
  const [qris, setQris] = useState(false);

  useEffect(() => setMounted(true), []);

  // Unit kerja mengikuti akun (User/Viewer): dikunci. Admin/Superadmin mengisi sendiri.
  const unitAkun = [
    currentUser?.unit_l2 && currentUser.unit_l2.toUpperCase() !== 'SELURUH UNIT' ? currentUser.unit_l2 : '',
    currentUser?.unit_l1 && currentUser.unit_l1.toUpperCase() !== 'PUSAT' ? currentUser.unit_l1 : '',
  ].filter(Boolean).join(', ');
  const unitTerkunci = (currentUser?.role === 'user' || currentUser?.role === 'viewer') && !!unitAkun;

  // Satu akun dipakai beberapa orang: formulir selalu kosong (tidak mengisi ulang ulasan orang lain).
  useEffect(() => { setUnit(unitTerkunci ? unitAkun : ''); }, [unitAkun, unitTerkunci]);

  const kirimUlasan = async () => {
    setGalat('');
    if (nama.trim().length < 3) return setGalat('Nama lengkap wajib diisi.');
    if (unit.trim().length < 2) return setGalat('Unit kerja asal wajib diisi.');
    if (Object.values(nilai).some(v => !v)) return setGalat('Mohon isi keempat penilaian bintang.');
    setKirim(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_BASE}/reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nama, unit, rating: nilai.rating, mudah: nilai.mudah, cepat: nilai.cepat, tampilan: nilai.tampilan, komentar }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setGalat(d.error || 'Gagal mengirim ulasan.'); return; }
      setSelesai(true);
      window.dispatchEvent(new Event(EVENT_ULASAN));
    } catch { setGalat('Gagal terhubung ke server.'); }
    finally { setKirim(false); }
  };

  const dm = isDarkMode;
  const panel = dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white';
  const heading = dm ? 'text-white' : 'text-[#002855]';
  const body = dm ? 'text-slate-300' : 'text-slate-600';
  const muted = dm ? 'text-slate-400' : 'text-slate-500';
  const input = `w-full rounded-xl border px-3.5 py-2.5 text-base outline-none focus:ring-2 focus:ring-[#A29061]/50 ${dm ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'}`;

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className={`w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col ${panel}`} style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
          <div className="min-w-0">
            <p className={`font-extrabold text-base ${heading}`}>{selesai ? 'Terima kasih!' : 'Beri Ulasan untuk SIMPEL'}</p>
            {!selesai && <p className={`text-xs mt-0.5 ${muted}`}>Pendapat Anda membantu kami terus memperbaiki aplikasi.</p>}
          </div>
          <button onClick={onClose} aria-label="Tutup" className={`p-1.5 rounded-lg shrink-0 ${dm ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}><X className="w-5 h-5" /></button>
        </div>

        {selesai ? (
          <div className="px-5 py-6 overflow-y-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mb-4"><Heart className="w-6 h-6 fill-rose-500" /></div>
            <p className={`text-sm leading-relaxed ${body}`}>
              Ulasan Anda sudah kami terima dan kini tampil di halaman About. 
              Terima kasih sudah meluangkan waktu. Setiap masukan, sekecil apa pun, menjadi bahan nyata untuk memperbaiki SIMPEL.
            </p>
            <p className={`text-sm leading-relaxed mt-3 ${body}`}>
              Bila SIMPEL membantu pekerjaan Anda dan Anda ingin ikut merawatnya, dukungan secangkir kopi akan sangat berarti. Tidak wajib, dan boleh diabaikan.
            </p>
            <p className={`text-sm mt-3 font-semibold ${heading}`}>— Pengembang SIMPEL</p>
            <div className="mt-5 flex items-center gap-2.5">
              <button onClick={onClose} className={`px-5 py-2.5 rounded-xl text-sm font-bold border ${dm ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Tutup</button>
              <button type="button" onClick={() => setQris(true)} title="Dukung Pengembang" aria-label="Dukung Pengembang" className="relative inline-flex items-center justify-center w-12 h-11 rounded-xl text-white bg-linear-to-r from-[#001F43] to-[#000F24] hover:from-[#002855] hover:to-[#001F43] shadow-sm active:scale-95 transition-all">
                <Coffee className="w-5 h-5" />
                <DollarSign className="w-3.5 h-3.5 absolute top-1.5 right-1.5 text-amber-300" strokeWidth={3} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${heading}`}>Nama lengkap <span className="text-red-500">*</span></label>
                <input value={nama} onChange={e => setNama(e.target.value)} maxLength={100} placeholder="Nama Anda (ditampilkan bersama ulasan)" className={input} />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${heading}`}>Unit kerja asal <span className="text-red-500">*</span></label>
                <input value={unit} onChange={e => setUnit(e.target.value)} maxLength={200} readOnly={unitTerkunci} placeholder="mis. Biro Ortala MR" className={`${input} ${unitTerkunci ? (dm ? 'opacity-80 cursor-not-allowed' : 'bg-slate-100 cursor-not-allowed text-slate-600') : ''}`} />
                {unitTerkunci && <p className={`text-[11px] mt-1 ${muted}`}>Mengikuti unit kerja akun Anda.</p>}
              </div>
              <div className={`rounded-xl border divide-y ${dm ? 'border-slate-700 divide-slate-700' : 'border-slate-200 divide-slate-100'}`}>
                {PENILAIAN.map((p, i) => (
                  <div key={p.key} className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${i === 0 ? (dm ? 'bg-slate-800/50' : 'bg-amber-50/60') : ''}`}>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${heading}`}>{p.label} <span className="text-red-500">*</span></p>
                      <p className={`text-[11px] ${muted}`}>{p.ket}</p>
                    </div>
                    <StarRating value={nilai[p.key]} onChange={v => setNilai(n => ({ ...n, [p.key]: v }))} size={24} label={p.label} />
                  </div>
                ))}
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${heading}`}>Testimoni, apresiasi, atau masukan</label>
                <textarea value={komentar} onChange={e => setKomentar(e.target.value)} maxLength={1000} rows={4} placeholder="Ceritakan pengalaman Anda memakai SIMPEL, atau saran perbaikan…" className={`${input} resize-none`} />
                <p className={`text-[11px] mt-1 text-right ${muted}`}>{komentar.length}/1000</p>
              </div>
              {galat && <p className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{galat}</p>}
            </div>
            <div className={`px-5 py-3.5 border-t flex justify-end gap-2.5 shrink-0 ${dm ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-sm font-bold ${dm ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Batal</button>
              <button onClick={kirimUlasan} disabled={kirim} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold text-white bg-linear-to-r from-[#A29061] to-[#8c7a4b] shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-60">
                {kirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Kirim Ulasan
              </button>
            </div>
          </>
        )}
      </div>
      {qris && <QrisDialog onClose={() => setQris(false)} isDarkMode={dm} />}
    </div>,
    document.body,
  );
}
