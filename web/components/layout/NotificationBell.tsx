'use client';

// Lonceng notifikasi header — semua role (kecuali viewer). Aksi admin
// (revisi/setujui/tetapkan) memberi tahu user unit terkait; aksi user (kirim ke
// Ortala/unggah TTD/tanggapan) memberi tahu admin & superadmin. Klik item →
// menuju halaman modul dengan pencarian terisi judul dokumen.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, GitBranch, FileText, ClipboardList, CheckCircle, AlertCircle, MessageSquare, Landmark, Upload, Clock, History, X } from 'lucide-react';

const API_BASE = '/e-sop-atrbpn/api';

interface NotifItem {
  id: number;
  kind: 'bpmn' | 'sop' | 'sp';
  model_id: number | null;
  judul: string | null;
  event: string;
  pesan: string;
  created_at: string;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  bpmn: <GitBranch className="w-4 h-4" />,
  sop: <FileText className="w-4 h-4" />,
  sp: <ClipboardList className="w-4 h-4" />,
};

const EVENT_STYLE: Record<string, { icon: React.ReactNode; cls: string }> = {
  rejected: { icon: <AlertCircle className="w-4 h-4" />, cls: 'bg-red-100 text-red-600' },
  pending: { icon: <Clock className="w-4 h-4" />, cls: 'bg-blue-100 text-blue-600' },
  penetapan: { icon: <Landmark className="w-4 h-4" />, cls: 'bg-violet-100 text-violet-600' },
  approved: { icon: <CheckCircle className="w-4 h-4" />, cls: 'bg-emerald-100 text-emerald-600' },
  terbit: { icon: <CheckCircle className="w-4 h-4" />, cls: 'bg-teal-100 text-teal-600' },
  verifikasi: { icon: <Upload className="w-4 h-4" />, cls: 'bg-indigo-100 text-indigo-600' },
  tanggapan: { icon: <MessageSquare className="w-4 h-4" />, cls: 'bg-indigo-100 text-indigo-600' },
};

function waktuRelatif(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const hari = Math.floor(h / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NotificationBell({ isDarkMode, role }: { isDarkMode?: boolean; role?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [allItems, setAllItems] = useState<NotifItem[] | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Waktu-baca yang ditahan: diterapkan saat panel ditutup agar sorotan "BARU"
  // masih terlihat selama panel dibuka, lalu menjadi polos setelahnya.
  const pendingSeenRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const d = await res.json();
      setItems(d.items || []);
      setUnseen(d.unseen || 0);
      setSeenAt(d.seenAt || null);
    } catch { /* jaringan — abaikan, poll berikutnya mencoba lagi */ }
  }, []);

  useEffect(() => {
    if (role === 'viewer') return;
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, role]);

  // Tutup saat klik di luar
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); applyPendingSeen(); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  // Terapkan penanda sudah-dibaca yang tertahan → item tak lagi disorot hijau.
  const applyPendingSeen = () => {
    if (pendingSeenRef.current) { setSeenAt(pendingSeenRef.current); pendingSeenRef.current = null; }
  };

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) { applyPendingSeen(); return; }
    if (unseen > 0) {
      // Tandai terbaca di server saat panel dibuka; sorotan hijau tetap tampil
      // sampai panel ditutup agar pengguna sempat melihat mana yang baru.
      pendingSeenRef.current = new Date().toISOString();
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE}/notifications/seen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        setUnseen(0);
      } catch { /* abaikan */ }
    }
  };

  // Klik notifikasi → buka halaman modul DAN langsung tampilkan detail dokumennya
  // (param doc=<id>; halaman /bpmn & /sop membuka modal detail + memilih tab yang tepat).
  const openDoc = (n: NotifItem) => {
    setOpen(false);
    setShowAll(false);
    const params = new URLSearchParams();
    // BPMN & SOP: cukup id dokumen — modalnya dibuka langsung, TANPA mengisi
    // pencarian (kalau diisi, setelah modal ditutup tabel & kartu ringkasan
    // ikut terfilter jadi 1 dokumen). SP belum punya pembuka modal → pakai q.
    if (n.model_id && (n.kind === 'bpmn' || n.kind === 'sop')) {
      params.set('doc', String(n.model_id));
      // Penanda sekali-pakai: bila URL ini dipulihkan browser/Next saat navigasi
      // balik, halaman tahu param sudah pernah dipakai → popup tidak muncul lagi.
      params.set('n', String(Date.now()));
    } else if (n.judul) params.set('q', n.judul);
    const qs = params.toString();
    const target = `/${n.kind}${qs ? `?${qs}` : ''}`;
    // Navigasi klien (instan). Bila SUDAH berada di halaman modul yang sama,
    // komponen halaman tidak dipasang ulang sehingga param tak terbaca —
    // untuk kasus itu barulah pakai muat ulang penuh.
    if (pathname === `/${n.kind}`) window.location.href = `/e-sop-atrbpn${target}`;
    else router.push(target);
  };

  // Riwayat notifikasi (popup terpisah) — memuat hingga 300 entri tersimpan.
  const openRiwayat = async () => {
    setShowAll(true);
    setOpen(false);
    setAllItems(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/notifications?all=1`, { headers: { Authorization: `Bearer ${token}` } });
      const d = res.ok ? await res.json() : { items: [] };
      setAllItems(d.items || []);
    } catch { setAllItems([]); }
  };

  if (role === 'viewer') return null;

  const isNew = (n: NotifItem) => !seenAt || new Date(n.created_at) > new Date(seenAt);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        onClick={toggle}
        title="Notifikasi"
        className={`relative p-2 rounded-lg transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
      >
        <Bell className="w-5 h-5" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-88 max-w-[calc(100vw-1.5rem)] rounded-2xl border shadow-2xl overflow-hidden z-60 ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`px-4 py-3 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-100 bg-slate-50'}`}>
            <p className={`text-sm font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Notifikasi</p>
            <span className={`text-[10px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{items.length} terbaru</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className={`px-4 py-10 text-center text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Belum ada notifikasi.
              </div>
            ) : items.map(n => {
              const ev = EVENT_STYLE[n.event] || { icon: KIND_ICON[n.kind] || <Bell className="w-4 h-4" />, cls: 'bg-slate-100 text-slate-500' };
              return (
                <button
                  key={n.id}
                  onClick={() => openDoc(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b last:border-b-0 transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-50 hover:bg-blue-50/50'} ${isNew(n) ? (isDarkMode ? 'bg-emerald-900/40 border-l-4 border-l-emerald-400' : 'bg-emerald-100 border-l-4 border-l-emerald-500') : ''}`}
                >
                  <span className={`p-2 rounded-xl shrink-0 mt-0.5 ${ev.cls}`}>{ev.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs leading-relaxed wrap-break-word ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{n.pesan}</span>
                    <span className={`flex items-center gap-1.5 mt-1 text-[10px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <span className="inline-flex items-center gap-1 uppercase">{KIND_ICON[n.kind]}{n.kind === 'bpmn' ? 'Proses Bisnis' : n.kind === 'sop' ? 'SOP' : 'SP'}</span>
                      · {waktuRelatif(n.created_at)}
                      {isNew(n) && <span className="ml-1 px-2 py-px rounded-full bg-emerald-600 text-white font-black shadow-sm">BARU</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button onClick={openRiwayat}
            className={`w-full px-4 py-2.5 text-xs font-bold border-t transition-colors flex items-center justify-center gap-1.5 ${isDarkMode ? 'border-slate-700 text-indigo-400 hover:bg-slate-800' : 'border-slate-100 text-indigo-600 hover:bg-indigo-50'}`}>
            <History className="w-3.5 h-3.5" /> Lihat Riwayat Notifikasi
          </button>
        </div>
      )}

      {/* POPUP RIWAYAT NOTIFIKASI */}
      {showAll && (
        <div className="fixed inset-0 z-70 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-2 sm:p-4" onClick={() => setShowAll(false)}>
          <div className={`w-full max-w-lg my-4 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? 'bg-[#151F32] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700"><History className="w-5 h-5" /></div>
                <div>
                  <h3 className="font-bold text-sm">Riwayat Notifikasi</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Klik salah satu untuk membuka dokumennya. Riwayat tersimpan 3 hari.</p>
                </div>
              </div>
              <button onClick={() => setShowAll(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto">
              {allItems === null ? (
                <p className={`text-sm py-10 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Memuat riwayat…</p>
              ) : allItems.length === 0 ? (
                <p className={`text-sm py-10 text-center ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Belum ada notifikasi tersimpan.</p>
              ) : allItems.map(n => {
                const ev = EVENT_STYLE[n.event] || { icon: KIND_ICON[n.kind] || <Bell className="w-4 h-4" />, cls: 'bg-slate-100 text-slate-500' };
                return (
                  <button key={n.id} onClick={() => openDoc(n)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b last:border-b-0 transition-colors ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-50 hover:bg-blue-50/50'} ${isNew(n) ? (isDarkMode ? 'bg-emerald-900/40 border-l-4 border-l-emerald-400' : 'bg-emerald-100 border-l-4 border-l-emerald-500') : ''}`}>
                    <span className={`p-2 rounded-xl shrink-0 mt-0.5 ${ev.cls}`}>{ev.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs leading-relaxed wrap-break-word ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{n.pesan}</span>
                      <span className={`flex items-center gap-1.5 mt-1 text-[10px] font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="inline-flex items-center gap-1 uppercase">{KIND_ICON[n.kind]}{n.kind === 'bpmn' ? 'Proses Bisnis' : n.kind === 'sop' ? 'SOP' : 'SP'}</span>
                        · {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={`text-[11px] px-5 py-3 border-t shrink-0 ${isDarkMode ? 'text-slate-500 border-slate-800' : 'text-slate-400 border-slate-100'}`}>
              Notifikasi tersimpan hingga 30 hari. Untuk jejak lengkap per dokumen, gunakan tombol <b>Riwayat</b> pada detail dokumen.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
