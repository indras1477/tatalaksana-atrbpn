'use client';

// Standar Pelayanan (SP) — modul baru. Saat ini diisi lewat Usulan & Dokumen
// Manual (belum ada studio penyusun). Struktur meniru modul BPMN/SOP:
// tab Daftar Usulan · Proses Penyusunan · Daftar Standar Pelayanan (terbit),
// dengan rekap per Unit Kerja (L1 → L2) untuk admin/superadmin.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, CheckCircle, Search, FileEdit, FileSignature, Stamp, Trash2,
  Calendar, ChevronRight, Building2, FileUp, ExternalLink,
  FileStack, Clock, AlertCircle, Landmark, X, Edit, MessageSquare, RotateCcw,
  History as HistoryIcon, GitCommit, Lock, Save, FileDown, Copy, Eye, Maximize2, Loader2, XCircle, Link2,
} from 'lucide-react';
import DocHistoryModal from '@/components/DocHistoryModal';
import ShareButton from '@/components/ShareButton';
import PratinjauPdf from '@/components/PratinjauPdf';
import TrashModal from '@/components/TrashModal';
import { useAppContext } from '@/lib/app-context';
import { useConfirm } from '@/components/ConfirmDialog';
import { HIERARKI_UNIT } from '@/lib/constants';
import { KLASIFIKASI_SP, parseSPDoc, type TautanDok } from '@/lib/spTemplate';
import ManualDocModal from '@/components/ManualDocModal';
import ManualDocDetailModal from '@/components/ManualDocDetailModal';

const API_BASE = '/e-sop-atrbpn/api';
function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
}

interface SPModel {
  id: number; process_title: string; l1_id: number | null; l2_id: number | null;
  status: string; catatan?: string | null; version: number; created_by: number;
  created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
  is_manual?: boolean | null; manual_nomor?: string | null; manual_link?: string | null;
  manual_file_name?: string | null; manual_tanggal?: string | null;
  catatan_at?: string | null; tanggapan?: string | null;
  // Naskah disusun lewat Studio SP (bukan unggahan manual) — lihat sp_data.
  has_studio?: boolean | null;
}
interface AuthUser { id: number; username: string; role: string; unit_l1?: string; unit_l2?: string }

export default function SPPage() {
  const router = useRouter();
  const { isDarkMode } = useAppContext();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const { confirm, confirmNode } = useConfirm();
  const [token, setToken] = useState('');
  const [models, setModels] = useState<SPModel[]>([]);
  const [loading, setLoading] = useState(true);
  // Tab bawaan = Proses Penyusunan, sama seperti Buat SOP: yang paling sering
  // dikerjakan adalah dokumen yang masih berjalan, bukan yang sudah terbit.
  const [listTab, setListTab] = useState<'usulan' | 'penyusunan' | 'terbit'>('penyusunan');
  const [rekapDrill, setRekapDrill] = useState<{ l1: string | null; l2: string | null }>({ l1: null, l2: null });
  const [searchQuery, setSearchQuery] = useState('');
  // Dari klik notifikasi: /halaman?q=<judul> → langsung terisi di pencarian.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearchQuery(q);
  }, []);
  const [showManualDoc, setShowManualDoc] = useState(false);
  // Impor Word dari halaman daftar: berkas dibaca server lebih dulu, lalu
  // formulir identitas SP dibuka dengan hasil bacaan terlampir.
  const [sumberWord, setSumberWord] = useState<{ nama: string; doc: Record<string, unknown>; jumlah: number } | null>(null);
  const [membacaWord, setMembacaWord] = useState(false);
  const [membuatDariWord, setMembuatDariWord] = useState(false);
  const inputWordRef = useRef<HTMLInputElement>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [detailModel, setDetailModel] = useState<SPModel | null>(null);
  const [cardFilter, setCardFilter] = useState<null | 'total' | 'draft' | 'pending' | 'pengesahan' | 'penetapan' | 'terbit' | 'rejected'>(null);
  const [usulanForm, setUsulanForm] = useState({ isOpen: false, title: '', l1: '', l2: '' });
  // Identitas naskah dikumpulkan lebih dulu lewat modal (pola sama dengan
  // "Informasi SOP Baru") agar studio langsung terbuka dengan data lengkap.
  const [konfigSP, setKonfigSP] = useState({ isOpen: false, judul: '', klasifikasi: '', l1: '', l2: '' });
  // Modal "Detail Dokumen SP" (klik baris) — sepadan dgn Proses Bisnis & SOP.
  const [previewModel, setPreviewModel] = useState<SPModel | null>(null);
  const [editMeta, setEditMeta] = useState({ process_title: '', klasifikasi_proses: '' });
  const [savingMeta, setSavingMeta] = useState(false);
  const [showHistoryFor, setShowHistoryFor] = useState<SPModel | null>(null);
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean; modelId: number; note: string; mode: 'reject' | 'edit' }>({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
  const [tanggapanModal, setTanggapanModal] = useState<{ isOpen: boolean; model: SPModel | null; pesan: string }>({ isOpen: false, model: null, pesan: '' });
  const [sendingTanggapan, setSendingTanggapan] = useState(false);
  // Pratinjau PDF naskah studio di dalam modal detail.
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pdfFull, setPdfFull] = useState(false);
  // Keterkaitan dokumen naskah studio (SOP/Proses Bisnis), ditampilkan
  // hanya-baca di modal detail. Disimpan di dalam sp_data — yang sengaja TIDAK
  // ikut di daftar (payload), jadi diambil per dokumen saat modal dibuka.
  const [tautanDok, setTautanDok] = useState<TautanDok[] | null>(null);
  const [salinBusy, setSalinBusy] = useState(false);
  const [savingUsulan, setSavingUsulan] = useState(false);

  useEffect(() => {
    const tok = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!tok || !userStr) { router.replace('/login'); return; }
    try {
      const parsedUser = JSON.parse(userStr);
      // Superadmin = superset admin: berlaku seperti admin di halaman ini.
      if (parsedUser.role === 'superadmin') { setIsSuperadmin(true); parsedUser.role = 'admin'; }
      setCurrentUser(parsedUser);
      setToken(tok);
    } catch { router.replace('/login'); }
  }, [router]);

  const muatDaftar = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiFetch('/sp/models', token)
      .then(r => r.ok ? r.json() : [])
      .then(data => setModels(Array.isArray(data) ? data : []))
      .catch(() => { /* jaringan putus — biarkan daftar lama, jangan unhandled rejection */ })
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { muatDaftar(); }, [muatDaftar]);

  const isAdmin = currentUser?.role === 'admin';
  const filtered = useMemo(() => models.filter(m =>
    !searchQuery || m.process_title.toLowerCase().includes(searchQuery.toLowerCase())
  ), [models, searchQuery]);

  const tabOf = (s?: string) => s === 'usulan' ? 'usulan' : s === 'terbit' ? 'terbit' : 'penyusunan';

  // Rekap per unit (admin) berlaku di SEMUA tab — termasuk Daftar SP Terbit, agar SP
  // yang sudah terbit pun ditelusuri per Unit Kerja Level 1 → Level 2.
  const isAdminRekap = isAdmin && ['penyusunan', 'usulan', 'terbit'].includes(listTab);
  // Tab usulan & terbit cukup SATU kolom jumlah (semua dokumen berstatus sama).
  const rekapRingkas = listTab === 'usulan' || listTab === 'terbit';
  const rekapDataset = useMemo(() => (
    listTab === 'usulan' ? filtered.filter(m => m.status === 'usulan')
      : listTab === 'terbit' ? filtered.filter(m => m.status === 'terbit')
      : filtered.filter(m => m.status !== 'terbit')
  ), [filtered, listTab]);
  const progressCounts = (docs: SPModel[]) => ({
    usulan: docs.filter(m => m.status === 'usulan').length,
    draft: docs.filter(m => !m.status || m.status === 'draft').length,
    pending: docs.filter(m => m.status === 'pending').length,
    pengesahan: docs.filter(m => ['approved', 'verifikasi', 'penetapan'].includes(m.status)).length,
    revisi: docs.filter(m => m.status === 'rejected').length,
    total: docs.length,
  });
  const rekapBadge = (n: number, tone: 'slate' | 'indigo' | 'blue' | 'violet' | 'red') => {
    if (!n) return <span className="text-slate-300 font-bold">–</span>;
    const map = {
      slate: isDarkMode ? 'bg-slate-700/60 text-slate-200' : 'bg-slate-100 text-slate-700',
      indigo: isDarkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
      blue: isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700',
      violet: isDarkMode ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-50 text-violet-700',
      red: isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700',
    };
    return <span className={`inline-flex min-w-8 justify-center px-2 py-1 rounded-lg text-xs font-black ${map[tone]}`}>{n}</span>;
  };
  const rekapRows = useMemo(() => {
    const atL2 = rekapDrill.l1 !== null;
    const src = atL2 ? rekapDataset.filter(m => (m.unit_l1 || '(Tanpa Unit)') === rekapDrill.l1) : rekapDataset;
    const groups: Record<string, SPModel[]> = {};
    src.forEach(m => {
      const k = atL2 ? (m.unit_l2 || '(Tanpa Sub-Unit)') : (m.unit_l1 || '(Tanpa Unit)');
      (groups[k] ||= []).push(m);
    });
    return Object.entries(groups).map(([nama, docs]) => ({ nama, ...progressCounts(docs) })).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [rekapDataset, rekapDrill]);

  const visibleModels = useMemo(() => {
    if (isAdminRekap && rekapDrill.l2 !== null) {
      return rekapDataset.filter(m => (m.unit_l1 || '(Tanpa Unit)') === rekapDrill.l1 && (m.unit_l2 || '(Tanpa Sub-Unit)') === rekapDrill.l2);
    }
    return filtered.filter(m => tabOf(m.status) === listTab);
  }, [filtered, listTab, isAdminRekap, rekapDrill, rekapDataset]);
  const countUsulan = useMemo(() => filtered.filter(m => m.status === 'usulan').length, [filtered]);
  const countPenyusunan = useMemo(() => filtered.filter(m => tabOf(m.status) === 'penyusunan').length, [filtered]);
  const countTerbit = useMemo(() => filtered.filter(m => m.status === 'terbit').length, [filtered]);
  useEffect(() => { setRekapDrill({ l1: null, l2: null }); }, [listTab]);

  // Panel "klik kartu" — sama seperti modul SOP: semua dokumen berstatus kartu, lintas unit.
  const CARD_MATCH: Record<string, (m: SPModel) => boolean> = {
    total: () => true,
    draft: m => m.status === 'usulan' || !m.status || m.status === 'draft',
    pending: m => m.status === 'pending',
    pengesahan: m => ['approved', 'verifikasi'].includes(m.status),
    penetapan: m => m.status === 'penetapan',
    terbit: m => m.status === 'terbit',
    rejected: m => m.status === 'rejected',
  };
  const CARD_LABEL: Record<string, string> = {
    total: 'Semua Dokumen Standar Pelayanan', draft: 'Draft (Usulan & Dalam Proses)',
    pending: 'Menunggu Review Ortala MR', pengesahan: 'Proses Pengesahan Pimpinan (disetujui/verifikasi TTD)', penetapan: 'Proses Penetapan Menteri', terbit: 'Telah Ditetapkan (Terbit)', rejected: 'Perlu Revisi',
  };
  const cardFilterModels = useMemo(() => {
    if (!cardFilter) return [];
    return filtered.filter(m => CARD_MATCH[cardFilter](m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardFilter, filtered]);
  // Kartu bisa diklik admin/superadmin & user (rekap/filter); aksi tetap mengikuti izin masing-masing.
  const canFilterCards = currentUser?.role === 'admin' || currentUser?.role === 'user';
  const toggleCard = (key: typeof cardFilter) => { if (canFilterCards) setCardFilter(cur => cur === key ? null : key); };
  const countDraftProses = useMemo(() => filtered.filter(m => !m.status || m.status === 'draft').length, [filtered]);

  const statusBadge = (s: string) => {
    const map: Record<string, [string, string]> = {
      usulan: ['USULAN', isDarkMode ? 'bg-slate-700/60 text-slate-200 border-slate-600' : 'bg-slate-100 text-slate-600 border-slate-200'],
      draft: ['DRAFT', 'bg-indigo-50 text-indigo-700 border-indigo-200'],
      pending: ['REVIEW ORTALA MR', 'bg-blue-50 text-blue-700 border-blue-200'],
      approved: ['PENGESAHAN PIMPINAN', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
      penetapan: ['PENETAPAN MENTERI', 'bg-violet-50 text-violet-700 border-violet-200'],
      verifikasi: ['VERIFIKASI TTD', 'bg-cyan-50 text-cyan-700 border-cyan-200'],
      rejected: ['PERLU REVISI', 'bg-red-50 text-red-700 border-red-200'],
      terbit: ['TERBIT', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    };
    const [label, cls] = map[s] || [s?.toUpperCase() || '-', 'bg-slate-100 text-slate-600 border-slate-200'];
    return <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cls}`}>{label}</span>;
  };

  // Membuka dokumen: unggahan manual → popup dokumen manual; naskah studio →
  // modal "Detail Dokumen SP" (dari sana baru masuk studio). Sama seperti alur
  // Proses Bisnis & SOP: klik baris memperlihatkan informasi dokumen dulu.
  const TERKUNCI = ['verifikasi', 'penetapan', 'terbit'];
  // Studio terbuka untuk superadmin, admin, dan user terbatas. User hanya untuk
  // dokumen unit kerjanya sendiri (batas kerasnya tetap dijaga server lewat
  // assertModelAccess); viewer tidak punya akses naskah.
  const bisaStudio = (m: SPModel) => {
    if (!currentUser || currentUser.role === 'viewer' || m.is_manual) return false;
    if (isAdmin) return true; // admin & superadmin
    return m.created_by === currentUser.id ||
      (!!currentUser.unit_l1 && (m.unit_l1 || '').trim().toLowerCase() === currentUser.unit_l1.trim().toLowerCase());
  };
  const bukaStudio = (m: SPModel) =>
    router.push(`/sp/studio?id=${m.id}${TERKUNCI.includes(m.status) ? '&mode=view' : ''}`);
  const bukaDetail = (m: SPModel) => {
    setPreviewModel(m);
    setEditMeta({ process_title: m.process_title, klasifikasi_proses: m.klasifikasi_proses || '' });
  };
  const bukaDokumen = (m: SPModel) => { if (m.is_manual) setDetailModel(m); else bukaDetail(m); };

  const perbarui = (id: number, tambalan: Partial<SPModel>) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, ...tambalan } : m));
    setPreviewModel(prev => prev && prev.id === id ? { ...prev, ...tambalan } : prev);
  };

  const ubahStatus = async (m: SPModel, status: string, catatan = '', pesanSukses = '') => {
    try {
      const res = await apiFetch(`/sp/models/status/${m.id}`, token, {
        method: 'PATCH', body: JSON.stringify({ status, catatan }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); alert(`❌ ${e.error || 'Gagal memperbarui status.'}`); return false; }
      const row = await res.json();
      perbarui(m.id, { status, catatan: catatan || null, catatan_at: row.catatan_at });
      if (pesanSukses) alert(pesanSukses);
      return true;
    } catch { alert('❌ Gagal memperbarui status — periksa koneksi.'); return false; }
  };

  const handleSetujui = async (m: SPModel) => {
    if (!(await confirm({ title: 'Setujui Standar Pelayanan', message: `Setujui dokumen "${m.process_title}"? Selanjutnya menunggu pengesahan pimpinan.`, tone: 'success', confirmText: 'Ya, Setujui' }))) return;
    await ubahStatus(m, 'approved', '', '✅ Disetujui. Menunggu pengesahan pimpinan.');
  };
  const handleDitetapkan = async (m: SPModel) => {
    if (!(await confirm({ title: 'Tetapkan Standar Pelayanan', message: `Tetapkan (terbitkan) dokumen "${m.process_title}"? Dokumen akan tercatat di registry Dashboard.`, tone: 'success', confirmText: 'Ya, Tetapkan' }))) return;
    await ubahStatus(m, 'terbit', '', '✅ Dokumen ditetapkan dan tercatat di Dashboard.');
  };
  // Mundur satu tahap: terbit → penetapan, penetapan/verifikasi → approved,
  // approved → pending (kembali ke review Ortala MR).
  const handleBatalkan = async (m: SPModel) => {
    const tujuan = m.status === 'terbit' ? 'penetapan' : ['penetapan', 'verifikasi'].includes(m.status) ? 'approved' : 'pending';
    const label: Record<string, string> = { penetapan: 'Proses Penetapan Menteri', approved: 'Proses Pengesahan Pimpinan', pending: 'Review Ortala MR' };
    if (!(await confirm({ title: 'Batalkan Tahap', message: `Kembalikan "${m.process_title}" ke tahap ${label[tujuan]}?${m.status === 'terbit' ? ' Dokumen juga dihapus dari registry Dashboard.' : ''}`, tone: 'warning', confirmText: 'Ya, Batalkan' }))) return;
    await ubahStatus(m, tujuan, '', `✅ Dokumen kembali ke tahap ${label[tujuan]}.`);
  };

  const submitReject = async () => {
    if (!rejectModal.note.trim()) return alert('Catatan tidak boleh kosong.');
    const m = models.find(x => x.id === rejectModal.modelId);
    if (!m) return;
    const ok = await ubahStatus(m, 'rejected', rejectModal.note.trim(),
      rejectModal.mode === 'edit' ? '✅ Catatan revisi diperbarui.' : '✅ Dokumen dikembalikan untuk diperbaiki.');
    if (ok) setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
  };

  // Penyusun/unit boleh menanggapi catatan revisi admin saat status 'rejected'.
  // Siapa yang boleh menghapus — SAMA dengan Buat SOP: user terbatas boleh
  // menghapus dokumen unitnya selama belum disetujui Ortala MR. Sengaja bukan
  // "pembuat = saya": dokumen impor dibuat superadmin & satu akun unit dipakai
  // bersama. Batas antar-unit dijaga server (assertDeleteAccess).
  const bolehHapus = (m: SPModel) => {
    if (!currentUser || currentUser.role === 'viewer') return false;
    if (isAdmin) return true; // admin & superadmin
    return ['draft', 'usulan', 'rejected', 'pending', ''].includes(m.status || '');
  };

  const bisaTanggapi = (m: SPModel) => currentUser?.role === 'user' && m.status === 'rejected';
  const submitTanggapan = async () => {
    const m = tanggapanModal.model;
    if (!m) return;
    if (!tanggapanModal.pesan.trim()) return alert('Tulis tanggapan terlebih dahulu.');
    setSendingTanggapan(true);
    try {
      const res = await apiFetch(`/sp/models/${m.id}/tanggapan`, token, { method: 'PATCH', body: JSON.stringify({ pesan: tanggapanModal.pesan.trim() }) });
      if (res.ok) {
        const row = await res.json();
        perbarui(m.id, { tanggapan: row.tanggapan });
        setTanggapanModal({ isOpen: false, model: null, pesan: '' });
        alert('✅ Tanggapan terkirim ke admin.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal mengirim tanggapan.'); }
    } finally { setSendingTanggapan(false); }
  };

  const simpanMeta = async () => {
    if (!previewModel) return;
    if (!editMeta.process_title.trim()) return alert('Nama Pelayanan tidak boleh kosong.');
    setSavingMeta(true);
    try {
      const res = await apiFetch(`/sp/models/${previewModel.id}/meta`, token, {
        method: 'PATCH',
        body: JSON.stringify({ process_title: editMeta.process_title.trim(), klasifikasi_proses: editMeta.klasifikasi_proses || null }),
      });
      if (res.ok) {
        const row = await res.json();
        perbarui(previewModel.id, { process_title: row.process_title, klasifikasi_proses: row.klasifikasi_proses });
        alert('✅ Informasi dokumen tersimpan.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(`❌ ${e.error || 'Gagal menyimpan.'}`); }
    } finally { setSavingMeta(false); }
  };

  // Unduh PDF / Word naskah studio (hanya untuk dokumen yang punya sp_data).
  const unduhNaskah = async (m: SPModel, jenis: 'pdf' | 'docx') => {
    try {
      const res = await apiFetch(`/sp/models/${m.id}/${jenis}`, token);
      if (!res.ok) { const e = await res.json().catch(() => ({} as { error?: string })); alert(`❌ ${e.error || 'Gagal mengunduh.'}`); return; }
      const blob = await res.blob();
      const aman = m.process_title.replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `SP - ${aman}.${jenis}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { alert('❌ Gagal mengunduh — periksa koneksi.'); }
  };

  // ── Impor Word ───────────────────────────────────────────────────────────
  // 1) Berkas .docx dibaca server (/sp/import-docx — tidak menyimpan apa pun).
  // 2) Formulir "Informasi SP" terbuka dengan Nama Pelayanan dari naskah Word.
  // 3) "Buka di Studio" menyimpan draft berisi naskah hasil impor lalu membuka
  //    studionya — naskah tidak dikirim lewat URL karena bisa sangat panjang.
  const pilihBerkasWord = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) { alert('Hanya berkas .docx (Word 2007 ke atas) yang didukung. Simpan ulang dokumen sebagai .docx.'); return; }
    if (f.size > 8 * 1024 * 1024) { alert('Berkas Word terlalu besar (maksimal 8 MB).'); return; }
    const pembaca = new FileReader();
    pembaca.onload = async () => {
      setMembacaWord(true);
      try {
        const res = await apiFetch('/sp/import-docx', token, {
          method: 'POST', body: JSON.stringify({ file_data: String(pembaca.result || '').split(',').pop() || '' }),
        });
        const d = await res.json().catch(() => ({} as { error?: string }));
        if (!res.ok) { alert(`❌ ${(d as { error?: string }).error || 'Gagal membaca berkas Word.'}`); return; }
        const hasil = d as { doc: Record<string, unknown>; jumlahKomponen: number };
        setSumberWord({ nama: f.name, doc: hasil.doc, jumlah: hasil.jumlahKomponen });
        setKonfigSP({
          isOpen: true, judul: String(hasil.doc.judul || '').trim(), klasifikasi: '',
          l1: currentUser?.role === 'user' ? (currentUser.unit_l1 || '') : '', l2: '',
        });
      } catch { alert('❌ Gagal membaca berkas Word — periksa koneksi.'); }
      finally { setMembacaWord(false); }
    };
    pembaca.onerror = () => alert('Berkas tidak dapat dibaca.');
    pembaca.readAsDataURL(f);
  };

  const buatDariWord = async () => {
    if (!sumberWord || !konfigSP.judul.trim() || !konfigSP.klasifikasi || !konfigSP.l1) return;
    setMembuatDariWord(true);
    try {
      const naskah = {
        ...sumberWord.doc,
        judul: konfigSP.judul.trim(), klasifikasi: konfigSP.klasifikasi,
        unitKerja: konfigSP.l1, subUnitKerja: konfigSP.l2 || '',
      };
      const res = await apiFetch('/sp/models', token, {
        method: 'POST',
        body: JSON.stringify({
          process_title: konfigSP.judul.trim(), klasifikasi_proses: konfigSP.klasifikasi,
          unit_l1: konfigSP.l1, unit_l2: konfigSP.l2 || null, status: 'draft', sp_data: JSON.stringify(naskah),
        }),
      });
      const d = await res.json().catch(() => ({} as { error?: string; id?: number }));
      if (!res.ok || !(d as { id?: number }).id) { alert(`❌ ${(d as { error?: string }).error || 'Gagal membuat dokumen dari Word.'}`); return; }
      setKonfigSP(k => ({ ...k, isOpen: false }));
      setSumberWord(null);
      router.push(`/sp/studio?id=${(d as { id: number }).id}`);
    } catch { alert('❌ Gagal membuat dokumen — periksa koneksi.'); }
    finally { setMembuatDariWord(false); }
  };

  // Identitas dari modal dibawa ke studio lewat query — naskah baru langsung
  // terisi Nama Pelayanan, klasifikasi, dan unit kerjanya.
  const mulaiStudioSP = () => {
    if (!konfigSP.judul.trim() || !konfigSP.klasifikasi || !konfigSP.l1) return;
    const q = new URLSearchParams({
      title: konfigSP.judul.trim(),
      klasifikasi: konfigSP.klasifikasi,
      l1: konfigSP.l1,
      ...(konfigSP.l2 ? { l2: konfigSP.l2 } : {}),
    });
    setKonfigSP(k => ({ ...k, isOpen: false }));
    router.push(`/sp/studio?${q.toString()}`);
  };

  // Tombol aksi per baris. Bentuk & warnanya SENGAJA mengikuti daftar SOP agar
  // seragam antar-modul: tindakan alur = pil pastel berlabel (bg-{warna}-100 /
  // text-{warna}-700), sedangkan alat bantu (edit, salin, bagikan, hapus) =
  // ikon polos abu yang mewarna saat disentuh.
  const AKSI_PIL = 'px-2.5 py-2.5 font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap transition-colors';
  // Tombol bergaris di kaki modal detail — ukuran & bentuknya sama dengan
  // modal "Detail Dokumen SOP" (rounded-xl, px-3 py-2.5, ikon 4×4).
  const KAKI_GARIS = 'px-3 py-2.5 text-xs sm:text-sm font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-colors';
  const aksiIkon = (warna: 'teal' | 'amber' | 'red' | 'indigo') => {
    const hover = { teal: 'hover:text-teal-600 hover:bg-teal-50', amber: 'hover:text-amber-600 hover:bg-amber-50',
      red: 'hover:text-red-600 hover:bg-red-50', indigo: 'hover:text-indigo-600 hover:bg-indigo-50' }[warna];
    return `p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-colors ${hover} ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`;
  };

  const tombolAksi = (m: SPModel) => (
    <div className="flex items-center justify-center gap-1.5 flex-wrap min-w-max">
      {bisaTanggapi(m) && (
        <button onClick={e => { e.stopPropagation(); setTanggapanModal({ isOpen: true, model: m, pesan: '' }); }}
          title="Tanggapi catatan revisi admin" className={`${AKSI_PIL} bg-indigo-100 text-indigo-700`}>
          <MessageSquare className="w-3.5 h-3.5" /> Tanggapi
        </button>
      )}
      {isAdmin && m.status === 'pending' && (<>
        <button onClick={e => { e.stopPropagation(); handleSetujui(m); }}
          title="Setujui — lanjut pengesahan pimpinan" className={`${AKSI_PIL} bg-emerald-100 text-emerald-700`}>
          <CheckCircle className="w-3.5 h-3.5" /> Setujui
        </button>
        <button onClick={e => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: m.id, note: '', mode: 'reject' }); }}
          title="Kembalikan dengan catatan revisi" className={`${AKSI_PIL} bg-red-100 text-red-700`}>
          <XCircle className="w-3.5 h-3.5" /> Tolak
        </button>
      </>)}
      {isAdmin && m.status === 'rejected' && (
        <button onClick={e => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: m.id, note: m.catatan || '', mode: 'edit' }); }}
          title="Ubah catatan revisi" className={`${AKSI_PIL} bg-amber-100 text-amber-700`}>
          <Edit className="w-3.5 h-3.5" /> Edit Revisi
        </button>
      )}
      {isAdmin && m.status === 'penetapan' && (
        <button onClick={e => { e.stopPropagation(); handleDitetapkan(m); }}
          title="Tetapkan / terbitkan dokumen" className={`${AKSI_PIL} bg-violet-100 text-violet-700`}>
          <Landmark className="w-3.5 h-3.5" /> Ditetapkan
        </button>
      )}
      {isAdmin && ['approved', 'verifikasi', 'penetapan', 'terbit'].includes(m.status) && (
        <button onClick={e => { e.stopPropagation(); handleBatalkan(m); }}
          title="Kembalikan ke tahap sebelumnya" className={`${AKSI_PIL} bg-amber-100 text-amber-700`}>
          <RotateCcw className="w-3.5 h-3.5" /> Batalkan
        </button>
      )}
      {!isAdmin && m.status === 'penetapan' && (
        <span className="px-2.5 py-2 text-[10px] font-bold text-violet-700 bg-violet-50 rounded-lg border border-violet-200 self-center">Penetapan menteri</span>
      )}

      {m.is_manual && (
        <button onClick={e => { e.stopPropagation(); setDetailModel(m); }} title="Lihat Dokumen" className={aksiIkon('teal')}>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Bentuk pil berlabel — sama dengan tombol Edit di Buat SOP (emerald)
          dan Buat Proses Bisnis (biru); SP memakai teal sesuai warna modulnya. */}
      {bisaStudio(m) && (
        <button onClick={e => { e.stopPropagation(); bukaStudio(m); }}
          title={TERKUNCI.includes(m.status) ? 'Buka naskah (mode hanya lihat)' : m.has_studio ? 'Edit naskah di Studio SP' : 'Susun naskah di Studio SP'}
          className="px-2.5 py-2.5 text-teal-600 bg-teal-50 font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap transition-colors hover:bg-teal-100">
          {TERKUNCI.includes(m.status)
            ? <><Eye className="w-3 h-3" /> Lihat</>
            : <><Edit className="w-3 h-3" /> Edit</>}
        </button>
      )}
      {bisaStudio(m) && m.has_studio && (
        <button onClick={e => { e.stopPropagation(); salinDokumen(m); }} disabled={salinBusy}
          title="Salin menjadi draft baru" className={`${aksiIkon('amber')} disabled:opacity-50`}>
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
      {currentUser?.role !== 'viewer' && (
        <span onClick={e => e.stopPropagation()}>
          <ShareButton kind="sp" modelId={m.id} token={token} isDarkMode={isDarkMode} />
        </span>
      )}
      {bolehHapus(m) && (
        <button onClick={e => { e.stopPropagation(); handleDelete(m); }} title="Hapus" className={aksiIkon('red')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  // Pratinjau dirender ulang tiap modal dibuka: naskah SP dirender server dari
  // sp_data (tanpa memuat aplikasi) sehingga cukup cepat untuk tidak di-cache.
  useEffect(() => {
    setPreviewPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPdfFull(false);
    if (!previewModel?.has_studio || !token || !bisaStudio(previewModel)) return;
    let aktif = true;
    setLoadingPreview(true);
    apiFetch(`/sp/models/${previewModel.id}/pdf`, token)
      .then(async r => { if (aktif && r.ok) setPreviewPdfUrl(URL.createObjectURL(await r.blob())); })
      .catch(() => {})
      .finally(() => { if (aktif) setLoadingPreview(false); });
    return () => {
      aktif = false;
      setPreviewPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModel?.id, previewModel?.has_studio, token, currentUser]);

  // Ambil keterkaitan dokumen dari naskah (sp_data) saat modal detail dibuka.
  useEffect(() => {
    setTautanDok(null);
    if (!previewModel?.has_studio || !token || !bisaStudio(previewModel)) return;
    let aktif = true;
    apiFetch(`/sp/models/${previewModel.id}`, token)
      .then(async r => {
        if (!aktif || !r.ok) return;
        const d = await r.json();
        const doc = parseSPDoc(d?.sp_data ?? null);
        if (aktif) setTautanDok(doc.tautan || []);
      })
      .catch(() => {});
    return () => { aktif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModel?.id, previewModel?.has_studio, token, currentUser]);

  // Salin dokumen → draft baru (untuk merevisi naskah yang sudah terkunci).
  const salinDokumen = async (m: SPModel) => {
    if (!(await confirm({ title: 'Salin Dokumen SP', message: `Buat salinan dari "${m.process_title}"? Salinan berstatus Draft di unit kerja yang sama.`, tone: 'success', confirmText: 'Ya, Salin' }))) return;
    setSalinBusy(true);
    try {
      const res = await apiFetch(`/sp/models/${m.id}/copy`, token, { method: 'POST', body: JSON.stringify({}) });
      if (res.ok) {
        const baru = await res.json();
        setModels(prev => [baru, ...prev]);
        setPreviewModel(null);
        alert('✅ Salinan dibuat sebagai Draft.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(`❌ ${e.error || 'Gagal menyalin.'}`); }
    } finally { setSalinBusy(false); }
  };

  const handleDelete = async (m: SPModel) => {
    if (!(await confirm({
      title: 'Hapus Dokumen SP',
      message: `Hapus "${m.process_title}"?\n\nDokumen dipindahkan ke Kotak Sampah dan masih dapat dipulihkan dari Kotak Sampah dalam 30 hari.${m.is_manual ? ' Berkas/tautan dokumen manual ikut terbawa.' : ''}`,
      tone: 'danger', confirmText: 'Ya, Hapus',
    }))) return;
    try {
      const res = await apiFetch(`/sp/models/${m.id}`, token, { method: 'DELETE' });
      if (res.ok) setModels(prev => prev.filter(x => x.id !== m.id));
      else { const e = await res.json().catch(() => ({})); alert(`❌ ${e.error || 'Gagal menghapus dokumen.'}`); }
    } catch { alert('❌ Gagal menghapus — periksa koneksi.'); }
  };

  const submitUsulan = async () => {
    if (!usulanForm.title.trim()) { alert('Judul wajib diisi.'); return; }
    setSavingUsulan(true);
    try {
      const res = await apiFetch('/sp/models', token, {
        method: 'POST',
        body: JSON.stringify({ process_title: usulanForm.title.trim(), status: 'usulan', unit_l1: usulanForm.l1 || null, unit_l2: usulanForm.l2 || null }),
      });
      if (res.ok) {
        const created = await res.json();
        setModels(prev => [created, ...prev]);
        setUsulanForm({ isOpen: false, title: '', l1: '', l2: '' });
        setListTab('usulan');
      } else alert('Gagal menyimpan usulan.');
    } finally { setSavingUsulan(false); }
  };

  if (!currentUser) return <div className="p-8 text-center text-slate-400">Memuat…</div>;

  const card = isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200';

  return (
    <div className="@container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {confirmNode}
      {/* Header */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3 2xl:gap-4 mb-6">
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {isAdmin ? 'Manajemen Standar Pelayanan (Pusat)' : `${currentUser.unit_l1}${currentUser.unit_l2 ? ' › ' + currentUser.unit_l2 : ''}`}
        </p>
        <div className="flex flex-wrap items-center gap-2 self-start 2xl:self-auto 2xl:justify-end">
          {currentUser.role !== 'viewer' && (<>
            <button onClick={() => inputWordRef.current?.click()} disabled={membacaWord}
              title="Buat naskah Standar Pelayanan dari berkas Word (.docx) yang sudah ada"
              className={`whitespace-nowrap shrink-0 px-3 py-2.5 xl:px-4 xl:py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all disabled:opacity-60 ${isDarkMode ? 'border-blue-700 text-blue-400 hover:bg-blue-900/30' : 'border-blue-300 text-blue-700 hover:bg-blue-50'}`}>
              {membacaWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} {membacaWord ? 'Membaca…' : 'Impor Word'}
            </button>
            <input ref={inputWordRef} type="file" accept=".docx" className="hidden" onChange={pilihBerkasWord} />
          </>)}
          {currentUser.role !== 'viewer' && (
            <button onClick={() => setShowTrash(true)} title="Kotak Sampah — dokumen terhapus (30 hari)"
              className={`whitespace-nowrap shrink-0 px-3 py-2.5 xl:px-4 xl:py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/20' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Kotak Sampah</span>
            </button>
          )}
          <button onClick={() => setShowManualDoc(true)} className={`whitespace-nowrap shrink-0 px-3 py-2.5 xl:px-4 xl:py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/30' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
            <FileUp className="w-4 h-4" /> Dokumen Manual
          </button>
          {currentUser.role !== 'viewer' && (
            <button onClick={() => { setSumberWord(null); setKonfigSP({ isOpen: true, judul: '', klasifikasi: '', l1: currentUser.role === 'user' ? (currentUser.unit_l1 || '') : '', l2: '' }); }}
              title="Susun naskah Standar Pelayanan di studio (kertas F4, ekspor PDF/Word)"
              className="whitespace-nowrap shrink-0 px-4 py-2.5 xl:px-5 xl:py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all">
              <Plus size={18} /> Buat SP Baru
            </button>
          )}
        </div>
      </div>

      {/* Kartu status — sama seperti modul SOP */}
      <div className="grid grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @6xl:grid-cols-7 gap-3 sm:gap-4 mb-8">
        <div onClick={() => toggleCard('total')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm flex justify-between items-center gap-2 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'total' ? 'ring-2 ring-[#002855]' : ''} ${card}`}>
          <div className="min-w-0"><p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Total</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{filtered.length}</p></div>
          <div className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileStack className="w-5 h-5 sm:w-6 sm:h-6" /></div>
        </div>
        <div onClick={() => toggleCard('draft')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-slate-400 flex items-center min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'draft' ? 'ring-2 ring-slate-400' : ''} ${card}`}>
          <div className="min-w-0 w-full">
            <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Draft</p>
            <div className="flex items-center gap-2.5">
              <p className={`text-2xl sm:text-3xl font-black leading-none shrink-0 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{countUsulan + countDraftProses}</p>
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold w-fit ${isDarkMode ? 'bg-slate-700/60 text-slate-300' : 'bg-slate-100 text-slate-600'}`}><b className="font-black">{countUsulan}</b> Usulan</span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold w-fit ${isDarkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}><b className="font-black">{countDraftProses}</b> Dalam Proses</span>
              </div>
            </div>
          </div>
        </div>
        <div onClick={() => toggleCard('pending')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'pending' ? 'ring-2 ring-blue-500' : ''} ${card}`}>
          <p className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-wide leading-tight wrap-break-word">Review Ortala MR</p>
          <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
            <p className="text-2xl sm:text-3xl font-black text-blue-600 leading-none">{filtered.filter(m => m.status === 'pending').length}</p>
            <div className="p-2 sm:p-2.5 bg-blue-50 rounded-xl text-blue-400 shrink-0"><Clock className="w-5 h-5" /></div>
          </div>
        </div>
        <div onClick={() => toggleCard('rejected')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-red-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'rejected' ? 'ring-2 ring-red-500' : ''} ${card}`}>
          <p className="text-[10px] sm:text-xs font-bold text-red-400 uppercase tracking-wide leading-tight wrap-break-word">Perlu Revisi</p>
          <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
            <p className="text-2xl sm:text-3xl font-black text-red-600 leading-none">{filtered.filter(m => m.status === 'rejected').length}</p>
            <div className="p-2 sm:p-2.5 bg-red-50 rounded-xl text-red-400 shrink-0"><AlertCircle className="w-5 h-5" /></div>
          </div>
        </div>
        <div onClick={() => toggleCard('pengesahan')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'pengesahan' ? 'ring-2 ring-emerald-500' : ''} ${card}`}>
          <p className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wide leading-tight wrap-break-word">Proses Pengesahan Pimpinan</p>
          <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 leading-none">{filtered.filter(m => ['approved', 'verifikasi'].includes(m.status)).length}</p>
            <div className="p-2 sm:p-2.5 bg-emerald-50 rounded-xl text-emerald-400 shrink-0"><CheckCircle className="w-5 h-5" /></div>
          </div>
        </div>
        <div onClick={() => toggleCard('penetapan')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-violet-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'penetapan' ? 'ring-2 ring-violet-500' : ''} ${card}`}>
          <p className="text-[10px] sm:text-xs font-bold text-violet-400 uppercase tracking-wide leading-tight wrap-break-word">Proses Penetapan Menteri</p>
          <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
            <p className="text-2xl sm:text-3xl font-black text-violet-600 leading-none">{filtered.filter(m => m.status === 'penetapan').length}</p>
            <div className="p-2 sm:p-2.5 bg-violet-50 rounded-xl text-violet-400 shrink-0"><Landmark className="w-5 h-5" /></div>
          </div>
        </div>
        <div onClick={() => toggleCard('terbit')} className={`col-span-2 sm:col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-teal-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'terbit' ? 'ring-2 ring-teal-500' : ''} ${card}`}>
          <p className="text-[10px] sm:text-xs font-bold text-teal-500 uppercase tracking-wide leading-tight wrap-break-word">Telah Ditetapkan (Terbit)</p>
          <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
            <p className="text-2xl sm:text-3xl font-black text-teal-600 leading-none">{filtered.filter(m => m.status === 'terbit').length}</p>
            <div className="p-2 sm:p-2.5 bg-teal-50 rounded-xl text-teal-500 shrink-0"><Stamp className="w-5 h-5" /></div>
          </div>
        </div>
      </div>

      {/* Panel hasil klik kartu — read-only lintas unit, alur penetapan tidak berubah */}
      {canFilterCards && cardFilter && (
        <div className={`rounded-2xl border shadow-sm overflow-hidden mb-8 ${card}`}>
          <div className={`flex items-center justify-between gap-3 p-4 sm:p-5 border-b ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{CARD_LABEL[cardFilter]}</p>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{cardFilterModels.length} dokumen · klik judul untuk membuka</p>
            </div>
            <button onClick={() => setCardFilter(null)} className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}><X className="w-4 h-4" /> Tutup</button>
          </div>
          <div className="overflow-x-auto max-h-128 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className={`text-[11px] font-bold uppercase tracking-wider border-b sticky top-0 ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                <tr>
                  <th className="px-4 sm:px-6 py-3">Informasi Dokumen</th>
                  <th className="px-4 sm:px-6 py-3">Unit Kerja</th>
                  <th className="px-4 sm:px-6 py-3 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-center w-px whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {cardFilterModels.length === 0 ? (
                  <tr><td colSpan={4} className={`px-6 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada dokumen.</td></tr>
                ) : cardFilterModels.map(m => (
                  <tr key={m.id} onClick={() => bukaDokumen(m)} title="Klik baris untuk membuka dokumen" className={`transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/40'}`}>
                    <td className="px-4 sm:px-6 py-3.5">
                      <button onClick={(e) => { e.stopPropagation(); bukaDokumen(m); }} className={`font-bold text-left hover:underline cursor-pointer ${isDarkMode ? 'text-white hover:text-teal-400' : 'text-[#002855] hover:text-teal-600'}`}>{m.process_title}</button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {m.is_manual && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-amber-300 bg-amber-900/30 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>Manual{m.manual_nomor ? ` · ${m.manual_nomor}` : ''}</span>}
                        <span className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}><Calendar className="w-3 h-3" />{new Date(m.manual_tanggal || m.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3.5">
                      <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{m.unit_l1 || '—'}</p>
                      {m.unit_l2 && <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{m.unit_l2}</p>}
                    </td>
                    <td className="px-4 sm:px-6 py-3.5 text-center">{statusBadge(m.status)}</td>
                    <td className="px-4 sm:px-6 py-3.5 w-px whitespace-nowrap align-middle">
                      {tombolAksi(m)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!cardFilter && (
      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        {/* Tabs + cari */}
        <div className={`p-4 sm:p-5 border-b flex flex-col gap-3 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
          <div className={`flex gap-1 p-1 rounded-xl overflow-x-auto ${isDarkMode ? 'bg-[#0F172A] border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
            {([
              { key: 'usulan', icon: FileEdit, label: 'Daftar Usulan', count: countUsulan },
              { key: 'penyusunan', icon: FileSignature, label: 'Proses Penyusunan', count: countPenyusunan },
              { key: 'terbit', icon: Stamp, label: 'Daftar SP Terbit', count: countTerbit },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setListTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${listTab === t.key ? (isDarkMode ? 'bg-slate-700 text-white shadow' : 'bg-white text-[#002855] shadow') : (isDarkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700')}`}>
                <t.icon className="w-4 h-4" /> {t.label}
                <span className={`min-w-5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${listTab === t.key ? 'bg-teal-100 text-teal-700' : (isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-500')}`}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cari judul…"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
          </div>
        </div>

        {/* Rekap per unit (admin) — Usulan & Penyusunan */}
        {isAdminRekap && rekapDrill.l2 === null ? (
          <div className="p-4 sm:p-5">
            {listTab === 'usulan' && (
              <div className={`-m-4 sm:-m-5 mb-3 sm:mb-4 p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/30' : 'border-slate-100 bg-teal-50/30'}`}>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Daftar Usulan Standar Pelayanan per <b>Unit Kerja</b>. Klik unit untuk melihat usulannya.</p>
                <button onClick={() => setUsulanForm(f => ({ ...f, isOpen: true, l1: currentUser.role === 'user' ? (currentUser.unit_l1 || '') : '' }))} className="px-4 py-2.5 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> Tambah Usulan SP</button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm font-semibold mb-1 flex-wrap">
              <button onClick={() => setRekapDrill({ l1: null, l2: null })} className={rekapDrill.l1 !== null ? 'text-teal-600 hover:underline' : (isDarkMode ? 'text-slate-200' : 'text-[#002855]')}>Semua Unit Kerja</button>
              {rekapDrill.l1 !== null && (<><ChevronRight className="w-4 h-4 text-slate-400" /><span className={isDarkMode ? 'text-white' : 'text-[#002855]'}>{rekapDrill.l1}</span></>)}
            </div>
            <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{rekapDrill.l1 === null ? `Rekap ${listTab === 'usulan' ? 'usulan' : listTab === 'terbit' ? 'SP terbit' : 'dokumen'} per Unit Kerja Level 1. Klik baris untuk melihat sub-unit (Level 2).` : 'Klik sub-unit untuk melihat daftar dokumennya.'}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className={`text-[10px] font-bold uppercase tracking-wide border-b ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50/80 border-slate-200'}`}>
                  <tr>
                    <th className="px-4 py-3 text-left">{rekapDrill.l1 === null ? 'Unit Kerja (Level 1)' : 'Sub-Unit (Level 2)'}</th>
                    {rekapRingkas ? (
                      <th className="px-2 py-3 text-center">{listTab === 'usulan' ? 'Jumlah Usulan' : 'Jumlah SP Terbit'}</th>
                    ) : (<>
                      <th className="px-2 py-3 text-center">Draft Usulan</th>
                      <th className="px-2 py-3 text-center">Draft Proses</th>
                      <th className="px-2 py-3 text-center">Review Ortala MR</th>
                      <th className="px-2 py-3 text-center">Pengesahan Pimpinan</th>
                      <th className="px-2 py-3 text-center">Perlu Revisi</th>
                      <th className="px-2 py-3 text-center">Total</th>
                    </>)}
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {rekapRows.length === 0 ? (
                    <tr><td colSpan={rekapRingkas ? 3 : 8} className={`px-4 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'usulan' ? 'Belum ada usulan.' : listTab === 'terbit' ? 'Belum ada Standar Pelayanan yang terbit.' : 'Tidak ada dokumen dalam proses penyusunan.'}</td></tr>
                  ) : rekapRows.map(row => (
                    <tr key={row.nama} onClick={() => setRekapDrill(rekapDrill.l1 === null ? { l1: row.nama, l2: null } : { l1: rekapDrill.l1, l2: row.nama })} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/50'}`}>
                      <td className={`px-4 py-3 font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{row.nama}</td>
                      {rekapRingkas ? (
                        <td className="px-2 py-3 text-center"><span className={`inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg text-xs font-black text-white ${listTab === 'terbit' ? 'bg-teal-600' : (isDarkMode ? 'bg-teal-600' : 'bg-[#002855]')}`}>{listTab === 'usulan' ? row.usulan : row.total}</span></td>
                      ) : (<>
                        <td className="px-2 py-3 text-center">{rekapBadge(row.usulan, 'slate')}</td>
                        <td className="px-2 py-3 text-center">{rekapBadge(row.draft, 'indigo')}</td>
                        <td className="px-2 py-3 text-center">{rekapBadge(row.pending, 'blue')}</td>
                        <td className="px-2 py-3 text-center">{rekapBadge(row.pengesahan, 'violet')}</td>
                        <td className="px-2 py-3 text-center">{rekapBadge(row.revisi, 'red')}</td>
                        <td className="px-2 py-3 text-center"><span className={`inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg text-xs font-black text-white ${isDarkMode ? 'bg-teal-600' : 'bg-[#002855]'}`}>{row.total}</span></td>
                      </>)}
                      <td className="px-2 py-3 text-slate-400"><ChevronRight className="w-4 h-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (<>
          {isAdminRekap && rekapDrill.l2 !== null && (
            <div className={`p-4 sm:p-5 border-b flex items-center gap-1.5 text-sm font-semibold flex-wrap ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setRekapDrill({ l1: null, l2: null })} className="text-teal-600 hover:underline">Semua Unit</button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button onClick={() => setRekapDrill({ l1: rekapDrill.l1, l2: null })} className="text-teal-600 hover:underline">{rekapDrill.l1}</button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className={isDarkMode ? 'text-white' : 'text-[#002855]'}>{rekapDrill.l2}</span>
            </div>
          )}

          {/* Aksi tambah usulan */}
          {listTab === 'usulan' && (
            <div className={`p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/30' : 'border-slate-100 bg-teal-50/30'}`}>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Daftar rencana Standar Pelayanan yang akan disusun.</p>
              <button onClick={() => setUsulanForm(f => ({ ...f, isOpen: true, l1: currentUser.role === 'user' ? (currentUser.unit_l1 || '') : '' }))} className="px-4 py-2.5 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> Tambah Usulan SP</button>
            </div>
          )}

          {/* Daftar dokumen */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50/80 border-slate-200'}`}>
                <tr>
                  <th className="px-6 py-4 w-2/5">Informasi Dokumen</th>
                  <th className="px-6 py-4 w-1/4">Unit Kerja</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Aksi / Tindakan</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {loading ? (
                  <tr><td colSpan={4} className={`px-6 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Memuat data…</td></tr>
                ) : visibleModels.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-16 text-center">
                    <Search className={`w-12 h-12 mb-3 mx-auto ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                    <p className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'terbit' ? 'Belum ada Standar Pelayanan yang ditetapkan — unggah lewat Dokumen Manual.' : listTab === 'usulan' ? 'Belum ada usulan.' : 'Tidak ada dokumen dalam penyusunan.'}</p>
                  </td></tr>
                ) : visibleModels.map(m => (
                  <tr key={m.id} onClick={() => bukaDokumen(m)} title="Klik baris untuk membuka detail dokumen"
                    className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/40'}`}>
                    <td className="px-6 py-4">
                      <button onClick={e => { e.stopPropagation(); bukaDokumen(m); }}
                        className={`font-bold text-base text-left hover:underline cursor-pointer ${isDarkMode ? 'text-white hover:text-teal-400' : 'text-[#002855] hover:text-teal-600'}`}>
                        {m.process_title}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {!m.is_manual && m.has_studio && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-teal-300 bg-teal-900/30 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-300'}`}>
                            Studio SP
                          </span>
                        )}
                        {m.is_manual && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-amber-300 bg-amber-900/30 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>
                            Manual{m.manual_nomor ? ` · ${m.manual_nomor}` : ''}
                          </span>
                        )}
                        {m.jenis_proses && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-violet-300 bg-violet-900/30 border-violet-700' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>{m.jenis_proses}</span>}
                        {m.klasifikasi_proses && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-teal-300 bg-teal-900/30 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-200'}`}>{m.klasifikasi_proses}</span>}
                        <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                          <Calendar className="w-3 h-3" />{new Date(m.manual_tanggal || m.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-1.5">
                        <Building2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                        <div>
                          <p className={`text-sm font-semibold leading-tight ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{m.unit_l1 || '—'}</p>
                          {m.unit_l2 && <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{m.unit_l2}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">{statusBadge(m.status)}</td>
                    <td className="px-6 py-4 w-px whitespace-nowrap align-middle">
                      {tombolAksi(m)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
      )}

      {/* ── Detail Dokumen SP (klik baris) — sepadan Proses Bisnis & SOP ── */}
      {previewModel && (() => {
        const terkunci = TERKUNCI.includes(previewModel.status);
        return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setPreviewModel(null)}>
          <div onClick={e => e.stopPropagation()}
            className={`w-full sm:max-w-lg md:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}>
            {/* Kepala */}
            <div className={`flex items-start justify-between p-4 sm:p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-xl shrink-0 ${isDarkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-600'}`}>
                  <FileSignature className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Detail Dokumen SP</p>
                  <p className={`text-xs truncate max-w-55 sm:max-w-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{previewModel.manual_nomor ? `No: ${previewModel.manual_nomor}` : '—'}</p>
                </div>
              </div>
              <div className="flex items-center shrink-0 ml-2">
                <button onClick={() => setShowHistoryFor(previewModel)} title="Riwayat / log aktivitas dokumen"
                  className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 mr-1 ${isDarkMode ? 'border-slate-700 text-indigo-400 hover:bg-indigo-900/30' : 'border-slate-200 text-indigo-600 hover:bg-indigo-50'}`}>
                  <HistoryIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Riwayat</span>
                </button>
                <button onClick={() => setPreviewModel(null)}
                  className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Isi */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                {statusBadge(previewModel.status)}
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-medium ${isDarkMode ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  <Building2 className="w-3 h-3" />
                  {previewModel.unit_l1 || '—'}{previewModel.unit_l2 ? ` › ${previewModel.unit_l2}` : ''}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-bold text-teal-600 ${isDarkMode ? 'bg-teal-900/20 border-teal-800' : 'bg-teal-50 border-teal-200'}`}>
                  <GitCommit className="w-3 h-3" />Versi {previewModel.version}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-bold ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}>
                  <Calendar className="w-3 h-3" />{new Date(previewModel.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>

              {previewModel.catatan && (
                <div className={`rounded-xl p-3 border text-sm ${isDarkMode ? 'bg-red-900/10 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <p className="font-bold text-xs uppercase tracking-wide mb-1">Catatan Revisi</p>
                  <p className="leading-relaxed whitespace-pre-wrap wrap-break-word">{previewModel.catatan}</p>
                </div>
              )}
              {previewModel.tanggapan && (
                <div className={`rounded-xl p-3 border text-sm ${isDarkMode ? 'bg-indigo-900/10 border-indigo-800 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                  <p className="font-bold text-xs uppercase tracking-wide mb-1">Tanggapan Penyusun</p>
                  <p className="leading-relaxed whitespace-pre-wrap wrap-break-word">{previewModel.tanggapan}</p>
                </div>
              )}

              {terkunci && (
                <div className={`flex items-start gap-2 text-xs font-semibold rounded-xl p-3 border ${isDarkMode ? 'bg-teal-900/20 border-teal-800 text-teal-300' : 'bg-teal-50 border-teal-200 text-teal-700'}`}>
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{previewModel.status === 'terbit'
                    ? <>Dokumen sudah <b>terbit (ditetapkan)</b> — informasi &amp; naskah terkunci.</>
                    : <>Dokumen sedang <b>diproses (verifikasi/penetapan)</b> — informasi &amp; naskah terkunci.</>}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nama Pelayanan <span className="text-red-500">*</span></label>
                  <input type="text" value={editMeta.process_title} disabled={terkunci}
                    onChange={e => setEditMeta(prev => ({ ...prev, process_title: e.target.value }))}
                    className={`w-full min-h-11 px-3 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi SP</label>
                  <select value={editMeta.klasifikasi_proses} disabled={terkunci}
                    onChange={e => setEditMeta(prev => ({ ...prev, klasifikasi_proses: e.target.value }))}
                    className={`w-full min-h-11 px-3 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="">— Pilih —</option>
                    {KLASIFIKASI_SP.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>

              {/* Keterkaitan dokumen (hanya-baca) — disunting di panel properti
                  Studio SP. Judul dibiarkan MELIPAT, bukan dipotong titik-titik,
                  supaya penyusun bisa membacanya utuh. */}
              {!!tautanDok?.length && (
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    <Link2 className="w-3.5 h-3.5 text-teal-600" /> Keterkaitan Dokumen
                  </p>
                  <div className="space-y-1.5">
                    {tautanDok.map(t => {
                      const label = t.kind === 'sop' ? 'SOP' : 'Proses Bisnis';
                      const bisaBuka = t.sumber !== 'registri' || !!t.link;
                      const buka = () => {
                        if (t.sumber === 'registri') { if (t.link) window.open(t.link, '_blank', 'noopener'); return; }
                        window.open(`/e-sop-atrbpn/${t.kind}/studio?id=${t.id}&mode=view`, '_blank');
                      };
                      return (
                        <div key={`${t.sumber || 'studio'}:${t.kind}:${t.id}`}
                          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${isDarkMode ? 'border-teal-800 bg-teal-900/20' : 'border-teal-200 bg-teal-50/60'}`}>
                          <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${t.kind === 'sop' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {label}
                          </span>
                          <span className="min-w-0 flex-1">
                            <button onClick={buka} disabled={!bisaBuka}
                              title={bisaBuka ? `Buka ${label} di tab baru` : 'Dokumen ini belum punya tautan berkas'}
                              className={`block w-full text-left text-xs font-bold wrap-break-word enabled:hover:underline disabled:cursor-default ${isDarkMode ? 'text-teal-300' : 'text-teal-800'}`}>
                              {t.judul || `${label} #${t.id}`}
                            </button>
                            <span className={`block text-[10px] mt-0.5 ${isDarkMode ? 'text-teal-500/80' : 'text-teal-600/80'}`}>
                              {t.sumber === 'registri' ? 'Dashboard' : 'Naskah studio'}
                              {t.tahun ? ` · ${t.tahun}` : ''}{t.unit ? ` · ${t.unit}` : ''}
                            </span>
                          </span>
                          {bisaBuka && (
                            <button onClick={buka} title="Buka di tab baru"
                              className="shrink-0 p-1.5 rounded-lg text-teal-600 hover:bg-teal-100"><ExternalLink className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pratinjau naskah studio — PDF dirender server dari sp_data. */}
              {previewModel.has_studio && (
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Pratinjau Dokumen</p>
                  {loadingPreview ? (
                    <div className={`rounded-xl border flex items-center justify-center gap-2 py-10 text-xs font-semibold ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                      <Loader2 className="w-4 h-4 animate-spin" /> Merender naskah…
                    </div>
                  ) : previewPdfUrl ? (
                    <div className={`relative rounded-xl border overflow-hidden ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                      <button onClick={() => setPdfFull(true)} title="Perbesar"
                        className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 shadow-md backdrop-blur-sm hover:bg-white">
                        <Maximize2 className="w-3.5 h-3.5" /> Perbesar
                      </button>
                      <div className="w-full h-105 overflow-hidden bg-slate-100">
                        <PratinjauPdf url={previewPdfUrl} className="p-2" jarak={8} />
                      </div>
                    </div>
                  ) : (
                    <div className={`rounded-xl border px-3 py-6 text-center text-xs ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                      {previewModel && bisaStudio(previewModel) ? 'Pratinjau tidak tersedia.' : 'Naskah milik unit kerja lain — pratinjau tidak tersedia.'}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button onClick={() => unduhNaskah(previewModel, 'pdf')}
                      className={`${KAKI_GARIS} ${isDarkMode ? 'border-red-800 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
                      <FileDown className="w-4 h-4" /> Unduh PDF
                    </button>
                    <button onClick={() => unduhNaskah(previewModel, 'docx')}
                      className={`${KAKI_GARIS} ${isDarkMode ? 'border-blue-800 text-blue-400 hover:bg-blue-900/20' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                      <FileDown className="w-4 h-4" /> Unduh Word
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Kaki */}
            <div className={`p-4 border-t shrink-0 flex flex-wrap items-center gap-2 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-100 bg-slate-50'}`}>
              {bisaStudio(previewModel) && (<>
                {!terkunci && (
                  <button onClick={() => bukaStudio(previewModel)}
                    className={`${KAKI_GARIS} ${isDarkMode ? 'border-teal-700 text-teal-400 hover:bg-teal-900/20' : 'border-teal-200 text-teal-600 hover:bg-teal-50'}`}>
                    <FileEdit className="w-4 h-4" /> Edit di Studio
                  </button>
                )}
                {/* Mode hanya lihat: membuka studio terkunci — aman dibuka siapa
                    pun tanpa risiko mengubah naskah (juga saat dokumen aktif). */}
                <button onClick={() => router.push(`/sp/studio?id=${previewModel.id}&mode=view`)}
                  title="Buka naskah tanpa bisa mengubah apa pun"
                  className={`${KAKI_GARIS} ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  <Eye className="w-4 h-4" /> Hanya Lihat
                </button>
                {previewModel.has_studio && (
                  <button onClick={() => salinDokumen(previewModel)} disabled={salinBusy}
                    className={`${KAKI_GARIS} disabled:opacity-50 ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/20' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                    <Copy className="w-4 h-4" /> Salin
                  </button>
                )}
              </>)}
              {currentUser?.role !== 'viewer' && (
                <ShareButton kind="sp" modelId={previewModel.id} token={token} isDarkMode={isDarkMode} />
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setPreviewModel(null)}
                  className={`px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Tutup</button>
                {!terkunci && (
                  <button onClick={simpanMeta} disabled={savingMeta}
                    className="px-5 py-2.5 text-xs sm:text-sm font-bold bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95">
                    <Save className="w-4 h-4" /> {savingMeta ? 'Menyimpan…' : 'Simpan'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Pratinjau layar penuh */}
      {pdfFull && previewPdfUrl && (
        <div className="fixed inset-0 z-70 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between gap-2 p-3 shrink-0">
            <p className="text-xs font-bold text-white/80 truncate">{previewModel?.process_title}</p>
            <button onClick={() => setPdfFull(false)} className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-slate-100"><PratinjauPdf url={previewPdfUrl} className="p-3" /></div>
        </div>
      )}

      {/* Riwayat dokumen */}
      {showHistoryFor && (
        <DocHistoryModal kind="sp" modelId={showHistoryFor.id} title={showHistoryFor.process_title}
          token={token} isDarkMode={isDarkMode} onClose={() => setShowHistoryFor(null)} />
      )}

      {/* Catatan revisi (Tolak / Edit Revisi) */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                {rejectModal.mode === 'edit' ? 'Ubah Catatan Revisi' : 'Kembalikan untuk Diperbaiki'}
              </h3>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })}
                className={`p-2 rounded-lg ${isDarkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              <p className={`text-xs mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Tuliskan poin yang perlu diperbaiki. Catatan ini tampil ke unit penyusun dan tersimpan permanen di Riwayat.
              </p>
              <textarea rows={6} value={rejectModal.note}
                onChange={e => setRejectModal({ ...rejectModal, note: e.target.value })}
                placeholder="Contoh: Komponen Jangka Waktu Penyelesaian belum sesuai peraturan terbaru."
                className={`w-full border rounded-xl p-3.5 text-base outline-none focus:ring-2 focus:ring-red-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
            </div>
            <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })}
                className={`px-4 py-2.5 rounded-xl border text-sm font-bold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'}`}>Batal</button>
              <button onClick={submitReject}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold">
                {rejectModal.mode === 'edit' ? 'Simpan Catatan' : 'Kembalikan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tanggapan penyusun atas catatan revisi */}
      {tanggapanModal.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Tanggapi Catatan Revisi</h3>
              <button onClick={() => setTanggapanModal({ isOpen: false, model: null, pesan: '' })}
                className={`p-2 rounded-lg ${isDarkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              {tanggapanModal.model?.catatan && (
                <div className={`rounded-xl p-3 border text-xs mb-3 ${isDarkMode ? 'bg-red-900/10 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <p className="font-bold uppercase tracking-wide mb-1">Catatan Admin</p>
                  <p className="whitespace-pre-wrap">{tanggapanModal.model.catatan}</p>
                </div>
              )}
              <textarea rows={5} value={tanggapanModal.pesan}
                onChange={e => setTanggapanModal({ ...tanggapanModal, pesan: e.target.value })}
                placeholder="Tulis tanggapan Anda kepada admin…"
                className={`w-full border rounded-xl p-3.5 text-base outline-none focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`} />
            </div>
            <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setTanggapanModal({ isOpen: false, model: null, pesan: '' })}
                className={`px-4 py-2.5 rounded-xl border text-sm font-bold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'}`}>Batal</button>
              <button onClick={submitTanggapan} disabled={sendingTanggapan}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold">
                {sendingTanggapan ? 'Mengirim…' : 'Kirim Tanggapan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "Informasi SP Baru" — identitas naskah sebelum masuk kanvas */}
      {konfigSP.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => { setKonfigSP(k => ({ ...k, isOpen: false })); setSumberWord(null); }}>
          <div onClick={e => e.stopPropagation()}
            className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className="flex justify-between items-center p-6 pb-3 shrink-0">
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{sumberWord ? 'Impor SP dari Word' : 'Informasi SP Baru'}</h3>
              <button onClick={() => { setKonfigSP(k => ({ ...k, isOpen: false })); setSumberWord(null); }}
                className={`p-2.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}><X size={20} /></button>
            </div>
            <div className="px-6 pb-4 overflow-y-auto">
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Lengkapi data identitas Standar Pelayanan sebelum masuk ke halaman penyusunan komponen.
              </p>
              {sumberWord && (
                <div className={`-mt-3 mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${isDarkMode ? 'border-blue-800 bg-blue-900/20 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                  <FileUp className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <b className="block wrap-break-word">{sumberWord.nama}</b>
                    <span className="text-xs">{sumberWord.jumlah} komponen terbaca. Naskah disimpan sebagai <b>Draft</b> lalu dibuka di Studio untuk diperiksa.</span>
                  </span>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Nama Pelayanan <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={konfigSP.judul} autoFocus
                    onChange={e => setKonfigSP(k => ({ ...k, judul: e.target.value }))}
                    placeholder="Contoh: Pemberian Peta Analisis Penatagunaan Tanah"
                    className={`w-full min-h-11 px-4 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
                </div>

                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Klasifikasi SP <span className="text-red-500">*</span>
                  </label>
                  <select value={konfigSP.klasifikasi}
                    onChange={e => setKonfigSP(k => ({ ...k, klasifikasi: e.target.value }))}
                    className={`w-full min-h-11 px-4 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="">-- Pilih Klasifikasi --</option>
                    {KLASIFIKASI_SP.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Unit Kerja Utama (Level 1) <span className="text-red-500">*</span>
                  </label>
                  <select value={konfigSP.l1}
                    onChange={e => setKonfigSP(k => ({ ...k, l1: e.target.value, l2: '' }))}
                    className={`w-full min-h-11 px-4 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="">-- Pilih Unit Utama --</option>
                    {Object.keys(HIERARKI_UNIT).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Unit (Level 2)</label>
                  <select value={konfigSP.l2} disabled={!konfigSP.l1}
                    onChange={e => setKonfigSP(k => ({ ...k, l2: e.target.value }))}
                    className={`w-full min-h-11 px-4 py-2.5 text-base border rounded-xl outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer disabled:opacity-60 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="">-- Tidak Ada / Kosong --</option>
                    {(konfigSP.l1 && HIERARKI_UNIT[konfigSP.l1] ? Object.keys(HIERARKI_UNIT[konfigSP.l1]) : []).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className={`flex justify-end gap-2 px-6 py-4 border-t shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => { setKonfigSP(k => ({ ...k, isOpen: false })); setSumberWord(null); }}
                className={`px-5 py-2.5 rounded-xl border text-sm font-bold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'}`}>Batal</button>
              <button onClick={sumberWord ? buatDariWord : mulaiStudioSP}
                disabled={!konfigSP.judul.trim() || !konfigSP.klasifikasi || !konfigSP.l1 || membuatDariWord}
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center gap-2 shadow-md transition-all">
                {membuatDariWord ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {sumberWord ? 'Buka di Studio' : 'Buat SP'} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Usulan SP */}
      {usulanForm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setUsulanForm(f => ({ ...f, isOpen: false }))}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl ${isDarkMode ? 'bg-[#0F172A] text-white' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h3 className="font-bold">Tambah Usulan Standar Pelayanan</h3>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Judul *</label>
                <input value={usulanForm.title} onChange={e => setUsulanForm(f => ({ ...f, title: e.target.value }))} placeholder="mis. Standar Pelayanan Pengecekan Sertipikat"
                  className={`w-full min-h-11 px-3.5 py-2.5 rounded-xl border text-base outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'}`} />
              </div>
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Unit Kerja Level 1</label>
                <select value={usulanForm.l1} onChange={e => setUsulanForm(f => ({ ...f, l1: e.target.value, l2: '' }))}
                  className={`w-full min-h-11 px-3.5 py-2.5 rounded-xl border text-base outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                  <option value="">-- Pilih Unit Kerja L1 --</option>
                  {Object.keys(HIERARKI_UNIT).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Unit Kerja Level 2 (Opsional)</label>
                <select value={usulanForm.l2} onChange={e => setUsulanForm(f => ({ ...f, l2: e.target.value }))} disabled={!usulanForm.l1}
                  className={`w-full min-h-11 px-3.5 py-2.5 rounded-xl border text-base outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300'}`}>
                  <option value="">-- Pilih Unit Kerja L2 --</option>
                  {(usulanForm.l1 && HIERARKI_UNIT[usulanForm.l1] ? Object.keys(HIERARKI_UNIT[usulanForm.l1]) : []).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className={`flex justify-end gap-2 px-5 py-4 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setUsulanForm(f => ({ ...f, isOpen: false }))} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'}`}>Batal</button>
              <button onClick={submitUsulan} disabled={savingUsulan} className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:bg-slate-300">
                {savingUsulan ? 'Menyimpan…' : 'Simpan Usulan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Lihat Dokumen + alur persetujuan (baris manual) */}
      {detailModel && (
        <ManualDocDetailModal
          kind="sp"
          model={detailModel}
          token={token}
          role={currentUser.role}
          isDarkMode={isDarkMode}
          onClose={() => setDetailModel(null)}
          onChanged={(row) => {
            const upd = row as unknown as SPModel;
            setModels(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x));
            setDetailModel(prev => prev ? { ...prev, ...upd } : prev);
          }}
        />
      )}

      {/* Kotak Sampah — dokumen terhapus (30 hari) lintas BPMN/SOP/SP */}
      {showTrash && currentUser && (
        <TrashModal token={token} role={isSuperadmin ? 'superadmin' : currentUser.role} isDarkMode={isDarkMode}
          onClose={() => setShowTrash(false)}
          onRestored={muatDaftar} />
      )}

      {/* Modal Dokumen Manual SP */}
      {showManualDoc && (
        <ManualDocModal
          kind="sp"
          token={token}
          isDarkMode={isDarkMode}
          defaultL1={currentUser.role === 'user' ? (currentUser.unit_l1 || '') : ''}
          defaultL2={currentUser.role === 'user' ? (currentUser.unit_l2 || '') : ''}
          onClose={() => setShowManualDoc(false)}
          onSaved={(row) => { setModels(prev => [row as unknown as SPModel, ...prev]); setListTab('penyusunan'); }}
        />
      )}

      <div className={`mt-4 flex items-center gap-2 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
        <CheckCircle className="w-3.5 h-3.5" />
        {currentUser.role !== 'viewer'
          ? <>Naskah dapat disusun langsung lewat <b>Buat SP Baru</b> (Studio SP, kertas F4 · ekspor PDF/Word), diunggah sebagai <b>Dokumen Manual</b>, atau dicatat rencananya lewat <b>Tambah Usulan SP</b>.</>
          : <>Dokumen jadi diunggah lewat <b>Dokumen Manual</b>, dan rencana penyusunan dicatat lewat <b>Tambah Usulan SP</b>.</>}
      </div>
    </div>
  );
}
