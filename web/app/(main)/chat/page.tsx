'use client';

// Chat kotak masuk bersama. User (Terbatas) punya SATU percakapan dengan "Tim Admin SIMPEL";
// admin & superadmin mana pun dapat membalasnya, sehingga pesan yang belum terbalas bisa
// diambil alih admin lain. Gaya mengikuti WhatsApp: gelembung, centang terkirim/dibaca,
// balas-kutip, edit (30 menit), hapus, lampiran.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, ChevronDown, Copy, Download, FileText, MessageCircle, MessageSquarePlus, Paperclip, Pencil, Reply, Search, Send, Trash2, X } from 'lucide-react';
import { useAppContext } from '@/lib/app-context';
import { useConfirm } from '@/components/ConfirmDialog';
import { API_CHAT, BarisDaftar, PesanChat, RiwayatChat, apiChat, bacaBase64, segarkanLencanaChat } from '@/lib/chat';

const MAKS_BERKAS = 3 * 1024 * 1024;
const TERIMA = '.png,.jpg,.jpeg,.pdf,.docx,.xlsx';
const BATAS_EDIT_MS = 30 * 60 * 1000;

const jam = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
const hariLabel = (iso: string) => {
  const d = new Date(iso); const s = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const kini = new Date(); const kemarin = new Date(Date.now() - 86400000);
  if (s(d, kini)) return 'Hari ini';
  if (s(d, kemarin)) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const waktuDaftar = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? jam(iso) : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
};
const inisial = (n: string) => (n.trim()[0] || '?').toUpperCase();
const ukuranTeks = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const labelPeran = (p: string) => (p === 'superadmin' ? 'Superadmin' : p === 'admin' ? 'Admin' : '');

/** Gambar/berkas lampiran: diambil lewat fetch ber-token (tag <img> tidak bisa mengirim header). */
function Lampiran({ id, nama, mime, ukuran, gelap }: { id: number; nama: string; mime: string; ukuran: number; gelap: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [lihat, setLihat] = useState(false);
  const gambar = mime.startsWith('image/');
  const ambil = useCallback(async (unduh: boolean) => {
    const r = await fetch(`${API_CHAT}/berkas/${id}${unduh ? '?unduh=1' : ''}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    if (!r.ok) throw new Error();
    return URL.createObjectURL(await r.blob());
  }, [id]);
  useEffect(() => {
    if (!gambar) return;
    let url: string | null = null; let hidup = true;
    ambil(false).then(u => { url = u; if (hidup) setSrc(u); else URL.revokeObjectURL(u); }).catch(() => {});
    return () => { hidup = false; if (url) URL.revokeObjectURL(url); };
  }, [gambar, ambil]);
  const unduh = async () => {
    try { const u = await ambil(true); const a = document.createElement('a'); a.href = u; a.download = nama; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); } catch { /* abaikan */ }
  };
  if (gambar) return (
    <>
      {src ? <img src={src} alt={nama} onClick={() => setLihat(true)} className="max-h-64 max-w-full rounded-lg cursor-zoom-in object-cover mb-1" /> : <div className="h-32 w-48 rounded-lg bg-black/10 animate-pulse mb-1" />}
      {lihat && src && (
        <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-4" onClick={() => setLihat(false)}>
          <button className="absolute top-4 right-4 text-white p-2" aria-label="Tutup"><X className="w-7 h-7" /></button>
          <img src={src} alt={nama} className="max-h-full max-w-full object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
  return (
    <button onClick={unduh} className={`flex items-center gap-2.5 w-full text-left rounded-lg px-3 py-2 mb-1 ${gelap ? 'bg-black/25' : 'bg-black/5'}`}>
      <FileText className="w-6 h-6 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{nama}</span><span className="text-xs opacity-60">{ukuranTeks(ukuran)}</span></span>
      <Download className="w-4 h-4 opacity-60 shrink-0" />
    </button>
  );
}

export default function ChatPage() {
  const { currentUser, isDarkMode: g } = useAppContext();
  const { confirm, confirmNode } = useConfirm();
  const role = currentUser?.role;
  const staf = role === 'admin' || role === 'superadmin';
  const bolehChat = staf || role === 'user';

  const [daftar, setDaftar] = useState<BarisDaftar[]>([]);
  const [tab, setTab] = useState<'semua' | 'menunggu'>('semua');
  const [cari, setCari] = useState('');
  const [terpilih, setTerpilih] = useState<number | null>(null); // id percakapan
  // Dialog "Chat baru": staf memilih unit kerja/akun tujuan; User cukup memberi judul topik.
  const [baruBuka, setBaruBuka] = useState(false);
  const [semuaKontak, setSemuaKontak] = useState<{ id: number; nama: string; unit: string }[]>([]);
  const [cariUnit, setCariUnit] = useState('');
  const [akunBaru, setAkunBaru] = useState<number | null>(null);
  const [judulBaru, setJudulBaru] = useState('');
  const [membuat, setMembuat] = useState(false);
  const [riwayat, setRiwayat] = useState<RiwayatChat | null>(null);
  const [galat, setGalat] = useState('');
  const [isi, setIsi] = useState('');
  const [berkas, setBerkas] = useState<File | null>(null);
  const [balasKe, setBalasKe] = useState<PesanChat | null>(null);
  const [edit, setEdit] = useState<PesanChat | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [kirim, setKirim] = useState(false);
  const bawah = useRef<HTMLDivElement>(null);
  const gulir = useRef<HTMLDivElement>(null);
  const dekatBawah = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const berkasRef = useRef<HTMLInputElement>(null);

  const thread = terpilih;
  const kunci = String(terpilih);

  const muatDaftar = useCallback(async () => {
    if (!bolehChat || document.hidden) return;
    try { setDaftar(await apiChat<BarisDaftar[]>('/daftar')); } catch { /* abaikan */ }
  }, [bolehChat]);

  const muatRiwayat = useCallback(async () => {
    if (thread === null || document.hidden) return;
    try { setRiwayat(await apiChat<RiwayatChat>(`/percakapan/${kunci}`)); setGalat(''); } catch (e) { setGalat((e as Error).message); }
  }, [thread, kunci]);

  // Polling: percakapan terbuka 3 dtk, daftar 6 dtk.
  useEffect(() => { muatDaftar(); const t = setInterval(muatDaftar, 6000); return () => clearInterval(t); }, [muatDaftar]);
  useEffect(() => {
    setRiwayat(null); setBalasKe(null); setEdit(null); setBerkas(null); setIsi(''); setMenuId(null);
    if (thread === null) return;
    muatRiwayat();
    const t = setInterval(muatRiwayat, 3000);
    const v = () => { if (!document.hidden) muatRiwayat(); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [thread, muatRiwayat]);

  // Tandai terbaca bila ada pesan lawan yang melewati penanda baca sisi saya & tab terlihat.
  const sudahDitandai = useRef(0);
  useEffect(() => {
    if (!riwayat || thread === null || document.hidden) return;
    const masuk = riwayat.pesan.filter(p => (staf ? p.dariUser : !p.dariUser) && !p.dihapus);
    const maks = masuk.length ? masuk[masuk.length - 1].id : 0;
    const penanda = staf ? riwayat.baca.staffSampai : riwayat.baca.userSampai;
    if (maks > penanda && maks > sudahDitandai.current) {
      sudahDitandai.current = maks;
      apiChat(`/percakapan/${kunci}/baca`, { method: 'POST' }).then(() => { segarkanLencanaChat(); muatDaftar(); muatRiwayat(); }).catch(() => {});
    }
  }, [riwayat, thread, staf, kunci, muatDaftar, muatRiwayat]);
  useEffect(() => { sudahDitandai.current = 0; }, [kunci]);

  // Dialog Chat baru (staf): muat akun User sekali saat dibuka.
  useEffect(() => {
    if (!baruBuka || !staf) return;
    apiChat<{ id: number; nama: string; unit: string }[]>('/kontak').then(setSemuaKontak).catch(() => setSemuaKontak([]));
  }, [baruBuka, staf]);

  const bukaBaru = () => { setBaruBuka(true); setCariUnit(''); setAkunBaru(null); setJudulBaru(''); setGalat(''); };
  const mulaiBaru = async () => {
    if (membuat || (staf && !akunBaru)) return;
    setMembuat(true);
    try {
      const r = await apiChat<{ id: number }>('/percakapan', { method: 'POST', body: { userId: akunBaru, judul: judulBaru } });
      setBaruBuka(false); await muatDaftar(); setTerpilih(r.id);
    } catch (e) { setGalat((e as Error).message); }
    setMembuat(false);
  };
  const kontakTampil = useMemo(() => {
    const k = cariUnit.trim().toLowerCase();
    const per: Record<string, { id: number; nama: string }[]> = {};
    semuaKontak.filter(x => !k || x.unit.toLowerCase().includes(k) || x.nama.toLowerCase().includes(k)).forEach(x => { (per[x.unit] ||= []).push(x); });
    return Object.entries(per);
  }, [semuaKontak, cariUnit]);

  // Gulir ke bawah hanya bila pengguna memang sedang di bawah (atau baru mengirim).
  useEffect(() => { if (dekatBawah.current) bawah.current?.scrollIntoView({ block: 'end' }); }, [riwayat?.pesan.length, riwayat?.lawan.id]);

  const kirimPesan = async () => {
    const teks = isi.trim();
    if (thread === null || kirim) return;
    if (edit) {
      if (!teks) return;
      setKirim(true);
      try { await apiChat(`/pesan/${edit.id}`, { method: 'PATCH', body: { isi: teks } }); setEdit(null); setIsi(''); await muatRiwayat(); } catch (e) { setGalat((e as Error).message); }
      setKirim(false); return;
    }
    if (!teks && !berkas) return;
    setKirim(true); setGalat('');
    try {
      await apiChat(`/percakapan/${kunci}/pesan`, {
        method: 'POST',
        body: { isi: teks, balasId: balasKe?.id, berkas: berkas ? { nama: berkas.name, data: await bacaBase64(berkas) } : undefined },
      });
      setIsi(''); setBerkas(null); setBalasKe(null); dekatBawah.current = true;
      await muatRiwayat(); muatDaftar(); segarkanLencanaChat();
    } catch (e) { setGalat((e as Error).message); }
    setKirim(false);
    inputRef.current?.focus();
  };

  const hapus = async (p: PesanChat) => {
    setMenuId(null);
    if (!(await confirm({ title: 'Hapus Pesan', message: 'Pesan ini akan dihapus untuk semua orang dan diganti penanda "pesan dihapus".', tone: 'danger', confirmText: 'Ya, Hapus' }))) return;
    try { await apiChat(`/pesan/${p.id}`, { method: 'DELETE' }); await muatRiwayat(); muatDaftar(); } catch (e) { setGalat((e as Error).message); }
  };

  const pilihBerkas = (f?: File) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    if (!TERIMA.includes(`.${ext}`)) return setGalat('Jenis berkas tidak didukung (PNG, JPG, PDF, DOCX, XLSX)');
    if (f.size > MAKS_BERKAS) return setGalat('Ukuran berkas maksimal 3 MB');
    setGalat(''); setBerkas(f);
  };

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return daftar.filter(d => (tab === 'semua' || d.menungguBalasan) && (!k || d.nama.toLowerCase().includes(k) || d.unit.toLowerCase().includes(k) || d.judul.toLowerCase().includes(k)));
  }, [daftar, tab, cari]);
  const jmlMenunggu = daftar.filter(d => d.menungguBalasan).length;

  // Pesan + pemisah tanggal.
  const baris = useMemo(() => {
    const out: ({ tipe: 'hari'; label: string } | { tipe: 'pesan'; p: PesanChat; ekor: boolean })[] = [];
    let hari = ''; let prev: PesanChat | null = null;
    (riwayat?.pesan || []).forEach(p => {
      const h = new Date(p.waktu).toDateString();
      if (h !== hari) { out.push({ tipe: 'hari', label: hariLabel(p.waktu) }); hari = h; prev = null; }
      out.push({ tipe: 'pesan', p, ekor: !prev || prev.dariUser !== p.dariUser || prev.pengirim !== p.pengirim });
      prev = p;
    });
    return out;
  }, [riwayat]);

  if (currentUser && !bolehChat) {
    return <div className="p-8 text-center text-sm opacity-70">HelpDesk hanya tersedia untuk User Terbatas dan Admin.</div>;
  }

  // ── Warna ──
  const panel = g ? 'bg-[#111827] border-slate-700' : 'bg-white border-slate-200';
  const teksSamar = g ? 'text-slate-400' : 'text-slate-500';
  const latar = g ? 'bg-[#0b141a]' : 'bg-[#efeae2]';
  const gelMasuk = g ? 'bg-[#202c33] text-slate-100' : 'bg-white text-slate-800';
  const gelKeluar = g ? 'bg-[#005c4b] text-slate-100' : 'bg-[#d9fdd3] text-slate-800';

  const dataDaftar = daftar.find(d => d.id === terpilih);
  const judulKonv = riwayat?.lawan.judul ?? dataDaftar?.judul ?? '';
  const namaLawan = staf ? (riwayat?.lawan.nama || dataDaftar?.nama || '') : (judulKonv || 'Tim Admin SIMPEL');
  const subLawan = staf ? [riwayat?.lawan.unit, judulKonv].filter(Boolean).join(' · ') : 'HelpDesk · dibalas oleh admin yang bertugas';
  const tampilPanelKiri = true;
  const bukaPercakapan = thread !== null;

  const gelembung = (p: PesanChat, ekor: boolean) => {
    // Sisi kanan: pesan dari sisi saya (staf: semua staf; User: akun User).
    const kanan = staf ? !p.dariUser : p.dariUser;
    const dibaca = p.dariUser ? p.id <= (riwayat?.baca.staffSampai || 0) : p.id <= (riwayat?.baca.userSampai || 0);
    const bolehEdit = p.saya && !p.dihapus && !p.berkas && Date.now() - new Date(p.waktu).getTime() < BATAS_EDIT_MS;
    const bolehHapus = !p.dihapus && (p.saya || role === 'superadmin');
    // Label pengirim: tampil pada pesan pertama dari satu pengirim — kecuali pesan saya sendiri (staf) agar tidak ramai.
    const tampilNama = ekor && (staf ? (p.dariUser || !p.saya) : !p.dariUser);
    const nama = p.dariUser ? (staf ? p.pengirim : 'Anda') : `${p.pengirim || 'Admin'}${labelPeran(p.peran) ? ` · ${labelPeran(p.peran)}` : ''}`;
    return (
      <div key={p.id} id={`pesan-${p.id}`} className={`group flex ${kanan ? 'justify-end' : 'justify-start'} ${ekor ? 'mt-2' : 'mt-0.5'}`}>
        <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-lg px-2.5 py-1.5 shadow-sm ${kanan ? gelKeluar : gelMasuk} ${ekor ? (kanan ? 'rounded-tr-none' : 'rounded-tl-none') : ''}`}>
          {tampilNama && <div className={`text-xs font-bold mb-0.5 ${p.dariUser ? 'text-teal-600' : 'text-indigo-500'}`}>{nama}</div>}
          {p.balas && (
            <button onClick={() => document.getElementById(`pesan-${p.balas!.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              className={`block w-full text-left rounded-md border-l-4 border-teal-500 px-2 py-1 mb-1 text-xs ${g ? 'bg-black/25' : 'bg-black/5'}`}>
              <span className="block font-bold text-teal-600 truncate">{p.balas.pengirim || 'Pesan'}</span>
              <span className="block truncate opacity-75">{p.balas.dihapus ? 'Pesan telah dihapus' : (p.balas.isi || (p.balas.berkas ? `📎 ${p.balas.berkas}` : ''))}</span>
            </button>
          )}
          {p.dihapus ? (
            <div className="text-sm italic opacity-60 pr-12">🚫 Pesan ini telah dihapus</div>
          ) : (
            <>
              {p.berkas && <Lampiran id={p.id} nama={p.berkas.nama} mime={p.berkas.mime} ukuran={p.berkas.ukuran} gelap={g} />}
              {p.isi && <div className="text-[15px] leading-snug whitespace-pre-wrap wrap-break-word pr-14">{p.isi}</div>}
            </>
          )}
          <div className={`flex items-center justify-end gap-1 text-[11px] leading-none ${p.isi || p.dihapus ? '-mt-1' : 'mt-0.5'} opacity-70 float-right ml-2 relative top-1`}>
            {p.diedit && !p.dihapus && <span className="italic">diedit</span>}
            <span>{jam(p.waktu)}</span>
            {kanan && !p.dihapus && (dibaca
              ? <span title={p.dariUser && riwayat?.baca.staffOleh ? `Dibaca oleh ${riwayat.baca.staffOleh}` : 'Dibaca'}><CheckCheck className="w-4 h-4 text-sky-500" /></span>
              : <span title="Terkirim"><Check className="w-4 h-4" /></span>)}
          </div>
          <div className="clear-both" />
          {!p.dihapus && (
            <button onClick={() => setMenuId(menuId === p.id ? null : p.id)} aria-label="Menu pesan"
              className={`absolute top-0.5 right-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-60 ${g ? 'bg-slate-700/80' : 'bg-white/80'}`}>
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {menuId === p.id && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuId(null)} />
              <div className={`absolute z-40 top-6 ${kanan ? 'right-0' : 'left-0'} min-w-40 rounded-xl border shadow-xl py-1 text-sm ${g ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-200 text-slate-700'}`}>
                <button onClick={() => { setBalasKe(p); setEdit(null); setMenuId(null); inputRef.current?.focus(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left"><Reply className="w-4 h-4" />Balas</button>
                {p.isi && <button onClick={() => { navigator.clipboard?.writeText(p.isi); setMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left"><Copy className="w-4 h-4" />Salin</button>}
                {bolehEdit && <button onClick={() => { setEdit(p); setBalasKe(null); setIsi(p.isi); setMenuId(null); inputRef.current?.focus(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left"><Pencil className="w-4 h-4" />Edit</button>}
                {bolehHapus && <button onClick={() => hapus(p)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-500 text-left"><Trash2 className="w-4 h-4" />Hapus</button>}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full p-0 sm:p-4">
      {confirmNode}
      {baruBuka && (
        <div className="fixed inset-0 z-[250] bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setBaruBuka(false)}>
          <div onClick={e => e.stopPropagation()} className={`w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl ${g ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800'}`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/10">
              <h3 className="font-bold flex items-center gap-2"><MessageSquarePlus className="w-5 h-5 text-teal-500" />Mulai Chat Baru</h3>
              <button onClick={() => setBaruBuka(false)} aria-label="Tutup"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto min-h-0">
              {staf && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider opacity-60">Pilih unit kerja</label>
                  <div className={`mt-1.5 flex items-center gap-2 rounded-xl px-3 border ${g ? 'bg-slate-800 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                    <Search className="w-4 h-4 opacity-50 shrink-0" />
                    <input value={cariUnit} onChange={e => setCariUnit(e.target.value)} placeholder="Cari nama unit kerja…" className="w-full bg-transparent py-2.5 text-base outline-none" />
                  </div>
                  <div className={`mt-2 max-h-64 overflow-y-auto rounded-xl border ${g ? 'border-slate-700' : 'border-slate-200'}`}>
                    {kontakTampil.length === 0 && <p className="p-4 text-sm text-center opacity-60">Unit kerja tidak ditemukan.</p>}
                    {kontakTampil.map(([unit, akun]) => (
                      <div key={unit} className={`border-b last:border-b-0 ${g ? 'border-slate-800' : 'border-slate-100'}`}>
                        {akun.map(a => (
                          <button key={a.id} onClick={() => setAkunBaru(a.id)} className={`w-full text-left px-3 py-2.5 flex items-center gap-3 ${akunBaru === a.id ? (g ? 'bg-teal-900/40' : 'bg-teal-50') : (g ? 'hover:bg-slate-800' : 'hover:bg-slate-50')}`}>
                            <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${akunBaru === a.id ? 'border-teal-500 bg-teal-500' : 'border-slate-400'}`} />
                            <span className="min-w-0"><span className="block text-sm font-semibold truncate">{unit}</span>{akun.length > 1 || a.nama !== unit ? <span className="block text-xs opacity-60 truncate">Akun: {a.nama}</span> : null}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider opacity-60">{staf ? 'Topik (opsional)' : 'Topik / nama bagian (opsional)'}</label>
                <input value={judulBaru} onChange={e => setJudulBaru(e.target.value.slice(0, 120))} placeholder={staf ? 'mis. Revisi SOP pengadaan' : 'mis. Bagian Perencanaan — kendala unggah cover'}
                  className={`mt-1.5 w-full rounded-xl px-3 py-2.5 text-base outline-none border ${g ? 'bg-slate-800 border-slate-600' : 'bg-slate-50 border-slate-200'}`} />
                {!staf && <p className="text-xs opacity-60 mt-1.5">Satu akun boleh punya beberapa percakapan, misalnya satu per bagian atau per topik.</p>}
              </div>
              {galat && <p className="text-sm text-red-500">{galat}</p>}
            </div>
            <div className="flex gap-2 justify-end px-5 py-4 border-t border-black/10">
              <button onClick={() => setBaruBuka(false)} className={`px-4 py-2.5 rounded-xl text-sm font-semibold border ${g ? 'border-slate-600' : 'border-slate-200'}`}>Batal</button>
              <button onClick={mulaiBaru} disabled={membuat || (staf && !akunBaru)} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white">Mulai Chat</button>
            </div>
          </div>
        </div>
      )}
      <div className={`h-full flex overflow-hidden sm:rounded-2xl border ${panel}`}>
        {/* ── Daftar percakapan (staf) ── */}
        {tampilPanelKiri && (
          <aside className={`${bukaPercakapan ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0 flex-col relative border-r ${g ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="p-3 space-y-2.5">
              <h2 className="text-lg font-bold flex items-center gap-2"><MessageCircle className="w-5 h-5 text-teal-500" />{staf ? 'HelpDesk Pengguna' : 'HelpDesk'}</h2>
              <div className={`flex items-center gap-2 rounded-xl px-3 ${g ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Search className="w-4 h-4 opacity-50 shrink-0" />
                <input value={cari} onChange={e => setCari(e.target.value)} placeholder={staf ? 'Cari unit kerja / nama / judul…' : 'Cari percakapan…'} className="w-full bg-transparent py-2.5 text-base outline-none" />
                {cari && <button onClick={() => setCari('')} aria-label="Bersihkan"><X className="w-4 h-4 opacity-50" /></button>}
              </div>
              {staf && <div className="flex gap-1.5">
                {([['semua', 'Semua'], ['menunggu', `Menunggu balasan${jmlMenunggu ? ` (${jmlMenunggu})` : ''}`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${tab === k ? 'bg-teal-600 text-white border-teal-600' : (g ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600')}`}>{l}</button>
                ))}
              </div>}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {tampil.length === 0 && <p className={`p-6 text-center text-sm ${teksSamar}`}>{tab === 'menunggu' ? 'Semua pesan sudah terbalas. 🎉' : staf ? 'Belum ada percakapan. Klik ikon chat baru di atas untuk memulai.' : 'Belum ada percakapan. Klik ikon chat baru di atas untuk bertanya ke admin.'}</p>}
              {tampil.map(d => (
                <button key={d.id} onClick={() => setTerpilih(d.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b ${g ? 'border-slate-800' : 'border-slate-100'} ${terpilih === d.id ? (g ? 'bg-slate-800' : 'bg-teal-50') : (g ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50')}`}>
                  <span className="w-11 h-11 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold shrink-0">{inisial(staf ? d.nama : (d.judul || 'P'))}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold truncate">{staf ? d.nama : (d.judul || 'Percakapan tanpa judul')}</span>
                      <span className={`text-[11px] shrink-0 ${d.belumDibaca ? 'text-teal-500 font-bold' : teksSamar}`}>{waktuDaftar(d.waktu)}</span>
                    </span>
                    {staf && (d.unit || d.judul) && <span className={`block text-[11px] truncate ${teksSamar}`}>{[d.unit, d.judul].filter(Boolean).join(' · ')}</span>}
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-sm truncate ${teksSamar}`}>{!d.dariUser && <span className="opacity-80">{d.pengirim?.split(' ')[0]}: </span>}{d.pesanTerakhir}</span>
                      {d.belumDibaca > 0 && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-teal-500 text-white text-[11px] font-bold flex items-center justify-center">{d.belumDibaca}</span>}
                    </span>
                    {d.menungguBalasan && <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Menunggu balasan</span>}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={bukaBaru} title="Mulai chat baru" aria-label="Mulai chat baru"
              className="absolute bottom-5 right-5 z-10 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-900/30 flex items-center justify-center transition-transform active:scale-95">
              <MessageSquarePlus className="w-6 h-6" />
            </button>
          </aside>
        )}

        {/* ── Percakapan ── */}
        <section className={`${!bukaPercakapan ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col`}>
          {!bukaPercakapan ? (
            <div className={`flex-1 flex flex-col items-center justify-center text-center p-8 ${latar}`}>
              <MessageCircle className="w-16 h-16 text-teal-500/60 mb-3" />
              <p className="font-bold text-lg">HelpDesk SIMPEL</p>
              <p className={`text-sm max-w-sm mt-1 ${teksSamar}`}>Pilih percakapan di sebelah kiri atau mulai chat baru lewat ikon di atas daftar. Satu akun dapat memiliki beberapa percakapan, dan setiap pesan dapat dibalas oleh admin atau superadmin mana pun.</p>
            </div>
          ) : (
            <>
              <header className={`flex items-center gap-3 px-3 py-2.5 border-b ${g ? 'border-slate-700 bg-[#1f2c34]' : 'border-slate-200 bg-slate-50'}`}>
                <button onClick={() => setTerpilih(null)} className="md:hidden p-1.5 -ml-1" aria-label="Kembali"><ArrowLeft className="w-5 h-5" /></button>
                <span className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold shrink-0">{inisial(namaLawan || '?')}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate leading-tight">{namaLawan || '…'}</p>
                  <p className={`text-xs truncate ${teksSamar}`}>{subLawan}</p>
                </div>
              </header>

              <div ref={gulir} onScroll={e => { const el = e.currentTarget; dekatBawah.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
                className={`flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-3 ${latar}`}>
                {!staf && (
                  <div className={`mx-auto max-w-md text-center text-xs rounded-lg px-3 py-2 mb-3 ${g ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                    Tulis pertanyaan atau kendala Anda. Akun ini dipakai bersama, jadi sebutkan nama dan bagian Anda di pesan. Admin mana pun dapat membalas. Untuk topik atau bagian lain, mulai chat baru lewat ikon di daftar.
                  </div>
                )}
                {staf && riwayat && riwayat.pesan.length === 0 && (
                  <div className={`mx-auto max-w-md text-center text-xs rounded-lg px-3 py-2 mb-3 ${g ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600'}`}>Belum ada pesan. Kirim pesan pertama untuk memulai percakapan.</div>
                )}
                {!riwayat && !galat && <p className={`text-center text-sm py-6 ${teksSamar}`}>Memuat…</p>}
                {baris.map((b, i) => b.tipe === 'hari'
                  ? <div key={`h${i}`} className="flex justify-center my-3"><span className={`text-xs px-3 py-1 rounded-lg shadow-sm ${g ? 'bg-[#182229] text-slate-300' : 'bg-white/90 text-slate-600'}`}>{b.label}</span></div>
                  : gelembung(b.p, b.ekor))}
                <div ref={bawah} />
              </div>

              {galat && <div className="px-4 py-2 text-sm bg-red-50 text-red-600 border-t border-red-200 flex items-center justify-between gap-2"><span>{galat}</span><button onClick={() => setGalat('')} aria-label="Tutup"><X className="w-4 h-4" /></button></div>}

              <footer className={`border-t ${g ? 'border-slate-700 bg-[#1f2c34]' : 'border-slate-200 bg-slate-50'}`}>
                {(balasKe || edit || berkas) && (
                  <div className="px-3 pt-2 flex items-center gap-2">
                    <div className={`flex-1 min-w-0 rounded-lg border-l-4 border-teal-500 px-3 py-1.5 text-xs ${g ? 'bg-slate-800' : 'bg-white'}`}>
                      {edit ? <><b className="text-teal-600">Mengedit pesan</b><span className="block truncate opacity-70">{edit.isi}</span></>
                        : balasKe ? <><b className="text-teal-600">Membalas {balasKe.dariUser && !staf ? 'Anda' : balasKe.pengirim}</b><span className="block truncate opacity-70">{balasKe.isi || (balasKe.berkas ? `📎 ${balasKe.berkas.nama}` : '')}</span></>
                        : <><b className="text-teal-600">Lampiran</b><span className="block truncate opacity-70">📎 {berkas!.name} · {ukuranTeks(berkas!.size)}</span></>}
                      {(balasKe || edit) && berkas && <span className="block truncate opacity-70">📎 {berkas.name}</span>}
                    </div>
                    <button onClick={() => { setBalasKe(null); setEdit(null); setBerkas(null); if (edit) setIsi(''); }} className="p-1.5 opacity-60 hover:opacity-100" aria-label="Batal"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2 p-3">
                  <input ref={berkasRef} type="file" accept={TERIMA} className="hidden" onChange={e => { pilihBerkas(e.target.files?.[0]); e.target.value = ''; }} />
                  {!edit && <button onClick={() => berkasRef.current?.click()} title="Lampirkan berkas (maks 3 MB)" aria-label="Lampirkan berkas" className={`p-2.5 rounded-full shrink-0 ${g ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-200'}`}><Paperclip className="w-5 h-5" /></button>}
                  <textarea ref={inputRef} value={isi} rows={1} maxLength={2000} placeholder="Ketik pesan…"
                    onPaste={e => {
                      if (edit) return;
                      const gbr = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
                      if (!gbr) return;
                      e.preventDefault();
                      const ext = gbr.type === 'image/jpeg' ? 'jpg' : 'png';
                      pilihBerkas(new File([gbr], `gambar-${Date.now()}.${ext}`, { type: gbr.type }));
                    }}
                    onChange={e => { setIsi(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); kirimPesan(); } if (e.key === 'Escape') { setBalasKe(null); setEdit(null); } }}
                    className={`flex-1 resize-none rounded-2xl px-4 py-2.5 text-base outline-none border max-h-36 ${g ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500' : 'bg-white border-slate-200'}`} />
                  <button onClick={kirimPesan} disabled={kirim || (!isi.trim() && !berkas)} aria-label={edit ? 'Simpan perubahan' : 'Kirim'}
                    className="p-3 rounded-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white shrink-0 transition-colors">
                    {edit ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
