'use client';

// Panel catatan revisi MENGAMBANG untuk admin/superadmin di dalam studio.
// Dibuat karena memberi catatan lewat daftar dokumen menyulitkan: admin harus
// mengingat isi kanvas lalu keluar untuk menuliskannya. Panel ini melayang di sisi
// layar sehingga catatan bisa ditulis sambil menggulir & membaca dokumennya.
import { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus, X, Send, Loader2, AlertCircle, Minus, History, ChevronDown, ChevronUp } from 'lucide-react';

const API = '/e-sop-atrbpn/api';

// Status yang masih masuk akal untuk dikembalikan ke unit kerja.
const BISA_DIREVISI = ['pending', 'verifikasi', 'approved', 'draft'];

interface Props {
  kind: 'sop' | 'bpmn';
  modelId: number;
  token: string;
}

const tglSingkat = (s: string) => {
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
};

export default function CatatanRevisiPanel({ kind, modelId, token }: Props) {
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [catatanBerlaku, setCatatanBerlaku] = useState('');
  const [judul, setJudul] = useState('');
  const [terbuka, setTerbuka] = useState(false);
  const [teks, setTeks] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const [pesan, setPesan] = useState('');
  // Riwayat catatan revisi terdahulu — penting karena catatan "berlaku" sengaja
  // dikosongkan tiap unit kerja mengirim ulang perbaikan.
  const [riwayat, setRiwayat] = useState<{ id: number; detail: string; created_at: string; nama: string }[]>([]);
  const [bukaRiwayat, setBukaRiwayat] = useState(false);

  useEffect(() => {
    try { setRole(JSON.parse(localStorage.getItem('user') || '{}').role || ''); } catch { /* abaikan */ }
  }, []);

  const muat = useCallback(async () => {
    if (!token || !modelId) return;
    try {
      const r = await fetch(`${API}/${kind}/models/${modelId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return;
      const d = await r.json();
      setStatus(d.status || 'draft');
      setCatatanBerlaku(d.catatan || '');
      setJudul(d.process_title || '');

      const rh = await fetch(`${API}/${kind}/models/${modelId}/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (rh.ok) {
        const semua = await rh.json();
        setRiwayat(
          (Array.isArray(semua) ? semua : [])
            .filter((h: { action?: string; detail?: string }) => h.action === 'rejected' && (h.detail || '').trim())
            .map((h: { id: number; detail: string; created_at: string; nama_lengkap?: string; username?: string }) => ({
              id: h.id, detail: h.detail, created_at: h.created_at, nama: h.nama_lengkap || h.username || 'Admin',
            }))
            .reverse(), // terbaru di atas
        );
      }
    } catch { /* abaikan */ }
  }, [kind, modelId, token]);

  useEffect(() => { muat(); }, [muat]);

  const bolehMemberiCatatan = (role === 'admin' || role === 'superadmin') && !!status && BISA_DIREVISI.includes(status);
  if (!bolehMemberiCatatan) return null;

  const kirim = async () => {
    const isi = teks.trim();
    if (!isi) { setPesan('Catatan belum diisi.'); return; }
    setMengirim(true); setPesan('');
    try {
      const r = await fetch(`${API}/${kind}/models/status/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'rejected', catatan: isi }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setPesan(e.error || 'Gagal mengirim catatan.');
        return;
      }
      setPesan('✓ Catatan terkirim. Dokumen kembali ke unit kerja untuk diperbaiki.');
      setTeks('');
      await muat();
      setTimeout(() => setTerbuka(false), 1800);
    } catch {
      setPesan('Gagal mengirim — periksa koneksi.');
    } finally { setMengirim(false); }
  };

  // Tombol pemicu (saat panel tertutup)
  if (!terbuka) {
    return (
      <button
        onClick={() => setTerbuka(true)}
        title="Tulis catatan revisi sambil membaca dokumen"
        className="no-print fixed bottom-5 right-5 z-60 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 font-bold text-sm text-white shadow-lg shadow-amber-500/30 hover:bg-amber-600 active:scale-95 transition-all"
      >
        <MessageSquarePlus className="w-5 h-5" />
        <span className="hidden sm:inline">Catatan Revisi</span>
      </button>
    );
  }

  return (
    <div className="no-print fixed bottom-5 right-5 z-60 w-[min(92vw,26rem)] rounded-2xl border border-amber-300 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-amber-50 px-4 py-3 border-b border-amber-200">
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
            <MessageSquarePlus className="w-4 h-4 shrink-0" /> Catatan Revisi
          </p>
          {judul && <p className="text-[11px] text-amber-700/80 truncate mt-0.5">{judul}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setTerbuka(false)} title="Kecilkan" className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100"><Minus className="w-4 h-4" /></button>
          <button onClick={() => { setTerbuka(false); setTeks(''); setPesan(''); }} title="Tutup" className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {catatanBerlaku && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Catatan yang sedang berlaku</p>
            <p className="text-xs text-slate-600 whitespace-pre-wrap wrap-break-word max-h-24 overflow-y-auto">{catatanBerlaku}</p>
          </div>
        )}

        {riwayat.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
              onClick={() => setBukaRiwayat(v => !v)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-slate-50 hover:bg-slate-100 text-left"
            >
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> Riwayat catatan sebelumnya ({riwayat.length})
              </span>
              {bukaRiwayat ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {bukaRiwayat && (
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                {riwayat.map((h, i) => (
                  <div key={h.id} className="px-2.5 py-2">
                    <p className="text-[10px] text-slate-400 mb-0.5">
                      Revisi ke-{riwayat.length - i} · {tglSingkat(h.created_at)} · {h.nama}
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap wrap-break-word">{h.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          value={teks}
          onChange={e => setTeks(e.target.value)}
          rows={5}
          autoFocus
          placeholder="Tulis hal yang perlu diperbaiki — mis. “Tahap 4 belum mencantumkan output; mutu baku waktu pada tahap 7 tidak sesuai.”"
          className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-sm text-slate-900 outline-none focus:ring-2 focus:ring-amber-400"
        />

        {/* Ikon & teks dibungkus <span> — tanpa itu tiap potongan teks menjadi
            item flex tersendiri dan kalimatnya pecah berkolom. */}
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Mengirim catatan mengubah status dokumen menjadi <b>Perlu Revisi</b> dan memberi tahu unit kerja terkait.</span>
        </p>

        {pesan && (
          <p className={`text-xs font-semibold ${pesan.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{pesan}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => { setTerbuka(false); setTeks(''); setPesan(''); }} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800">Batal</button>
          <button
            onClick={kirim}
            disabled={mengirim || !teks.trim()}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold flex items-center gap-2 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mengirim ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {mengirim ? 'Mengirim…' : 'Kirim Catatan'}
          </button>
        </div>
      </div>
    </div>
  );
}
