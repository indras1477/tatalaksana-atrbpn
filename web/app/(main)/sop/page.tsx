"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Edit, CheckCircle,
  Clock, XCircle, Search, X, FileEdit, FileStack, AlertCircle, Filter,
  Trash2, Calendar, GitCommit, FileSignature, Lock, HelpCircle, ChevronRight,
  Save, ExternalLink, Building2, Copy, Upload, Stamp, Eye, ClipboardCheck, Landmark, FileUp, FileSpreadsheet, FileText, MessageSquare
} from 'lucide-react';
import { SOPSymbolsSection } from '@/components/PanduanSymbols';
import ManualDocModal from '@/components/ManualDocModal';
import ManualDocDetailModal from '@/components/ManualDocDetailModal';
import ManualDocImportModal from '@/components/ManualDocImportModal';
import ShareButton from '@/components/ShareButton';
import { useAppContext } from '@/lib/app-context';
import { HIERARKI_UNIT } from '@/lib/constants';

const API_BASE = '/e-sop-atrbpn/api';

const JENIS_OPTIONS = ['Pusat', 'Kantor Wilayah', 'Kantor Pertanahan'];
const KLASIFIKASI_OPTIONS_SOP = [
  'SOP Administrasi Pemerintah',
  'SOP Layanan Pertanahan',
  'SOP Layanan Tata Ruang',
  'SOP Layanan Pengaduan dan Informasi',
  'SOP Layanan Data, Keamanan dan Infrastruktur',
];

function apiFetch(path: string, token: string, options?: RequestInit) {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${API_BASE}${safePath}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}

interface SOPModel {
  id: number; process_title: string; process_key: string | null; l1_id: number | null; l2_id: number | null;
  description: string | null; sop_data: string | null;
  status: string; catatan?: string | null; catatan_at?: string | null; tanggapan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
  has_cover?: boolean;
  penetapan_dasar?: string | null; penetapan_tanggal?: string | null;
  is_manual?: boolean | null; manual_nomor?: string | null; manual_link?: string | null;
  manual_file_name?: string | null; manual_tanggal?: string | null;
}

interface AuthUser {
  id: number; username: string; role: string;
  unit_l1?: string; unit_l2?: string;
}

// FUNGSI HELPER: Ekstrak Unit Kerja langsung dari JSON (Pencegah Null)
const getDisplayUnitL1 = (m: SOPModel) => {
  if (m.unit_l1) return m.unit_l1;
  try { return JSON.parse(m.sop_data || '{}').unitKerja || '-'; } catch { return '-'; }
};
const getDisplayUnitL2 = (m: SOPModel) => {
  if (m.unit_l2) return m.unit_l2;
  try { return JSON.parse(m.sop_data || '{}').subUnitKerja || ''; } catch { return ''; }
};

export default function SOPDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [savedModels, setSavedModels] = useState<SOPModel[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnit, setFilterUnit] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState({
    processTitle: '',
    processKey: '',
    orgUnitL1: '',
    orgUnitL2: '',
    description: '',
    jenisSOP: '',
    klasifikasiSOP: '',
    jabatanPengesah: '',
    namaPengesah: '',
    nipPengesah: '',
  });

  // mode 'reject' = tolak pengajuan (pending → rejected); mode 'cover' = kembalikan cover (verifikasi → approved)
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean; modelId: number; note: string; mode: 'reject' | 'cover' | 'edit' }>({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
  const [tanggapanModal, setTanggapanModal] = useState<{ isOpen: boolean; model: SOPModel | null; pesan: string }>({ isOpen: false, model: null, pesan: '' });
  const [sendingTanggapan, setSendingTanggapan] = useState(false);
  const [showPanduan, setShowPanduan] = useState(false);
  const [showManualDoc, setShowManualDoc] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [manualDetail, setManualDetail] = useState<SOPModel | null>(null);

  // Tab daftar: 'pengajuan' (draft/pending/rejected/approved-menunggu cover) vs 'terbit' (Daftar SOP)
  const [listTab, setListTab] = useState<'usulan' | 'penyusunan' | 'terbit'>('penyusunan');
  // Filter cepat klik kartu ringkasan (admin/superadmin).
  const [cardFilter, setCardFilter] = useState<null | 'total' | 'draft' | 'pending' | 'pengesahan' | 'penetapan' | 'terbit' | 'rejected'>(null);
  const [usulanForm, setUsulanForm] = useState<{ isOpen: boolean; title: string; l1: string; l2: string; jenis: string; klasifikasi: string }>({ isOpen: false, title: '', l1: '', l2: '', jenis: '', klasifikasi: '' });
  const [addingUsulan, setAddingUsulan] = useState(false);
  const [continuingUsulanId, setContinuingUsulanId] = useState<number | null>(null);
  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  // Drill-down rekap admin: null = daftar L1; l1 set = daftar L2; l2 set = daftar dokumen
  const [rekapDrill, setRekapDrill] = useState<{ l1: string | null; l2: string | null }>({ l1: null, l2: null });
  // Modal unggah cover bertanda tangan
  const [coverModal, setCoverModal] = useState<{ isOpen: boolean; model: SOPModel | null }>({ isOpen: false, model: null });
  const [coverData, setCoverData] = useState<{ dataUrl: string; name: string; size: number } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const MAX_COVER_BYTES = 2 * 1024 * 1024;
  // Modal isian penetapan (dasar hukum & tanggal) saat menekan "Ditetapkan"
  const [penetapanModal, setPenetapanModal] = useState<{ isOpen: boolean; model: SOPModel | null; dasar: string; tanggal: string }>({ isOpen: false, model: null, dasar: '', tanggal: '' });
  const [submittingPenetapan, setSubmittingPenetapan] = useState(false);

  const [previewModel, setPreviewModel] = useState<SOPModel | null>(null);
  const [editMeta, setEditMeta] = useState({ process_title: '', jenis_proses: '', klasifikasi_proses: '' });
  const [savingMeta, setSavingMeta] = useState(false);

  const [copyModal, setCopyModal] = useState<{ isOpen: boolean; source: SOPModel | null; form: { process_title: string; jenis_proses: string; klasifikasi_proses: string } }>({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } });
  const [copyingDoc, setCopyingDoc] = useState(false);

  const { isDarkMode } = useAppContext();

  const l1Options = Object.keys(HIERARKI_UNIT);
  const l2Options = config.orgUnitL1 && HIERARKI_UNIT[config.orgUnitL1] ? Object.keys(HIERARKI_UNIT[config.orgUnitL1]) : [];

  useEffect(() => {
    const initAuth = async () => {
      const tok = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!tok || !userStr) { window.location.replace('/e-sop-atrbpn/login'); return; }
      try {
        const parsedUser = JSON.parse(userStr);
        // Superadmin = superset admin: berlaku seperti admin di seluruh halaman ini.
        if (parsedUser.role === 'superadmin') { setIsSuperadmin(true); parsedUser.role = 'admin'; }
        setCurrentUser(parsedUser);
        setToken(tok);
      } catch {
        window.location.replace('/e-sop-atrbpn/login');
      }
    };
    initAuth();
  }, [router]);

  useEffect(() => {
    if (!token || !currentUser) return;

    apiFetch('/sop/models', token)
      .then(async (r) => {
          const text = await r.text();
          try { return JSON.parse(text); } catch { return []; }
      })
      .then(data => {
        if (Array.isArray(data)) {
          if (currentUser.role === 'admin') {
            setSavedModels(data);
          } else {
            const userL1 = currentUser.unit_l1?.trim().toLowerCase();
            const userL2 = currentUser.unit_l2?.trim().toLowerCase();
            const filteredByUnit = data.filter((m: SOPModel) => {
              if (m.created_by === currentUser.id) return true;
              const modelL1 = getDisplayUnitL1(m).trim().toLowerCase();
              const modelL2 = getDisplayUnitL2(m).trim().toLowerCase();
              if (userL1 && (!userL2 || userL2 === '' || userL2 === 'seluruh unit')) return modelL1 === userL1;
              if (userL1 && userL2) return modelL1 === userL1 && modelL2 === userL2;
              return false;
            });
            setSavedModels(filteredByUnit);
          }
        }
      })
      .catch(err => console.error("Gagal mengambil data SOP:", err))
      .finally(() => setLoading(false));
  }, [token, currentUser]);

  const handleL1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig({ ...config, orgUnitL1: e.target.value, orgUnitL2: '' });
  };

  const handleOpenNewSOP = () => {
    setContinuingUsulanId(null);
    if (currentUser?.role === 'user' && currentUser.unit_l1) {
      setConfig(c => ({ ...c, orgUnitL1: currentUser.unit_l1 || '', orgUnitL2: '' }));
    }
    setShowConfigModal(true);
  };

  const handleStartSOP = () => {
    if (!config.processTitle || !config.orgUnitL1) {
      return alert("Harap lengkapi Judul SOP dan Unit Kerja Utama.");
    }
    if (typeof window !== 'undefined') localStorage.removeItem('e-sop-draft-local');

    const params: Record<string, string> = {
      title: config.processTitle,
      l1: config.orgUnitL1,
    };
    if (config.processKey) params.key = config.processKey;
    if (config.orgUnitL2) params.l2 = config.orgUnitL2;
    if (config.jenisSOP) params.jenis = config.jenisSOP;
    if (config.klasifikasiSOP) params.klasifikasi = config.klasifikasiSOP;
    if (config.jabatanPengesah) params.jabatan = config.jabatanPengesah;
    if (config.namaPengesah) params.nama = config.namaPengesah;
    if (config.nipPengesah) params.nip = config.nipPengesah;
    // Bila melanjutkan sebuah Usulan, lanjutkan pada dokumen yang sama (jadi draft saat disimpan).
    if (continuingUsulanId) params.id = String(continuingUsulanId);

    window.location.href = `/e-sop-atrbpn/sop/studio?${new URLSearchParams(params).toString()}`;
  };

  // Buka modal usulan (prefill unit L1 untuk user).
  // Buka dokumen manual: tautan eksternal langsung; PDF unggahan via blob.
  const openUsulanModal = () => {
    setUsulanForm({
      isOpen: true, title: '', l1: currentUser?.role === 'user' ? (currentUser.unit_l1 || '') : '', l2: '', jenis: '', klasifikasi: '',
    });
  };

  // Simpan usulan (judul + unit + jenis + klasifikasi) → status 'usulan'.
  const submitUsulan = async () => {
    if (!usulanForm.title.trim()) return alert('Judul rencana SOP wajib diisi.');
    if (!usulanForm.l1) return alert('Unit Kerja Level 1 wajib dipilih.');
    setAddingUsulan(true);
    try {
      const res = await apiFetch('/sop/models', token, {
        method: 'POST',
        body: JSON.stringify({ process_title: usulanForm.title.trim(), status: 'usulan', unit_l1: usulanForm.l1, unit_l2: usulanForm.l2, jenis_proses: usulanForm.jenis || null, klasifikasi_proses: usulanForm.klasifikasi || null }),
      });
      if (res.ok) {
        const created = await res.json();
        setSavedModels(prev => [created, ...prev]);
        setUsulanForm({ isOpen: false, title: '', l1: '', l2: '', jenis: '', klasifikasi: '' });
      } else {
        const e = await res.json().catch(() => ({}));
        alert(`❌ ${e.error || 'Gagal menambah usulan.'}`);
      }
    } catch (e) { console.error(e); alert('❌ Gagal menambah usulan.'); }
    finally { setAddingUsulan(false); }
  };

  // Lanjut Penyusunan dari sebuah usulan → buka modal info (prefill semua), lalu ke Studio.
  const handleLanjutPenyusunan = (model: SOPModel) => {
    setContinuingUsulanId(model.id);
    setConfig(c => ({
      ...c,
      processTitle: model.process_title || '',
      orgUnitL1: getDisplayUnitL1(model) !== '-' ? getDisplayUnitL1(model) : (currentUser?.unit_l1 || ''),
      orgUnitL2: getDisplayUnitL2(model) || (currentUser?.unit_l2 && currentUser.unit_l2 !== 'SELURUH UNIT' ? currentUser.unit_l2 : ''),
      jenisSOP: model.jenis_proses || '',
      klasifikasiSOP: model.klasifikasi_proses || '',
    }));
    setShowConfigModal(true);
  };

  const currentFilteredModels = useMemo(() => {
    return savedModels.filter(m => {
      const title = m.process_title || '';
      const key = m.process_key || '';
      const unitL1 = getDisplayUnitL1(m);
      const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            key.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUnit = filterUnit === 'Semua' || unitL1 === filterUnit;
      const currentStatus = (m.status || 'draft').toLowerCase();
      const targetStatus = filterStatus.toLowerCase();
      const matchesStatus = filterStatus === 'Semua' || currentStatus === targetStatus;

      return matchesSearch && matchesUnit && matchesStatus;
    });
  }, [savedModels, searchQuery, filterUnit, filterStatus]);

  // Pisahkan berdasarkan tab. SOP baru pindah ke Daftar SOP saat berstatus 'terbit'
  // (cover bertanda tangan sudah diunggah); 'approved' tetap di Pengajuan (menunggu cover TTD).
  // Kelompokkan per tab: usulan (rencana) / penyusunan (draft s/d penetapan) / terbit
  const tabOf = (s?: string) => s === 'usulan' ? 'usulan' : s === 'terbit' ? 'terbit' : 'penyusunan';

  // FASE 2 — tampilan admin: rekap per unit (drill-down L1 → L2 → dokumen)
  // untuk tab Penyusunan DAN tab Usulan (dikelompokkan per unit kerja).
  const isAdminRekap = currentUser?.role === 'admin' && (listTab === 'penyusunan' || listTab === 'usulan');
  const rekapDataset = useMemo(() => (
    listTab === 'usulan'
      ? currentFilteredModels.filter(m => m.status === 'usulan')
      : currentFilteredModels.filter(m => m.status !== 'terbit')
  ), [currentFilteredModels, listTab]);
  const progressCounts = (docs: SOPModel[]) => ({
    usulan: docs.filter(m => m.status === 'usulan').length,
    draft: docs.filter(m => !m.status || m.status === 'draft').length,
    pending: docs.filter(m => m.status === 'pending').length,
    pengesahan: docs.filter(m => ['approved', 'verifikasi', 'penetapan'].includes(m.status)).length,
    revisi: docs.filter(m => m.status === 'rejected').length,
    total: docs.length,
  });
  const rekapBadge = (n: number, tone: 'slate' | 'indigo' | 'blue' | 'emerald' | 'red') => {
    if (!n) return <span className="text-slate-300 font-bold">–</span>;
    const map = {
      slate: isDarkMode ? 'bg-slate-700/60 text-slate-200' : 'bg-slate-100 text-slate-700',
      indigo: isDarkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
      blue: isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700',
      emerald: isDarkMode ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-50 text-emerald-700',
      red: isDarkMode ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-700',
    };
    return <span className={`inline-flex min-w-8 justify-center px-2 py-1 rounded-lg text-xs font-black ${map[tone]}`}>{n}</span>;
  };
  const rekapRows = useMemo(() => {
    const atL2 = rekapDrill.l1 !== null;
    const src = atL2 ? rekapDataset.filter(m => getDisplayUnitL1(m) === rekapDrill.l1) : rekapDataset;
    const groups: Record<string, SOPModel[]> = {};
    src.forEach(m => {
      const k = atL2 ? (getDisplayUnitL2(m) || '(Tanpa Sub-Unit)') : (getDisplayUnitL1(m) || '(Tanpa Unit)');
      (groups[k] ||= []).push(m);
    });
    return Object.entries(groups).map(([nama, docs]) => ({ nama, ...progressCounts(docs) })).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [rekapDataset, rekapDrill]);

  const visibleModels = useMemo(() => {
    if (isAdminRekap && rekapDrill.l2 !== null) {
      return rekapDataset.filter(m => getDisplayUnitL1(m) === rekapDrill.l1 && (getDisplayUnitL2(m) || '(Tanpa Sub-Unit)') === rekapDrill.l2);
    }
    return currentFilteredModels.filter(m => tabOf(m.status) === listTab);
  }, [currentFilteredModels, listTab, isAdminRekap, rekapDrill, rekapDataset]);

  // Panel "klik kartu": semua dokumen berstatus kartu + kotak cari, lintas unit.
  const CARD_MATCH: Record<string, (m: SOPModel) => boolean> = {
    total: () => true,
    draft: m => m.status === 'usulan' || !m.status || m.status === 'draft',
    pending: m => m.status === 'pending',
    pengesahan: m => ['approved', 'verifikasi'].includes(m.status),
    penetapan: m => m.status === 'penetapan',
    terbit: m => m.status === 'terbit',
    rejected: m => m.status === 'rejected',
  };
  const CARD_LABEL: Record<string, string> = {
    total: 'Semua Dokumen SOP', draft: 'Draft (Usulan & Dalam Proses)',
    pending: 'Menunggu Review Ortala MR', pengesahan: 'Proses Pengesahan Pimpinan (disetujui/verifikasi TTD)', penetapan: 'Proses Penetapan Menteri', terbit: 'Telah Ditetapkan (Terbit)', rejected: 'Perlu Revisi',
  };
  const cardFilterModels = useMemo(() => {
    if (!cardFilter) return [];
    const q = searchQuery.toLowerCase();
    return savedModels.filter(m => CARD_MATCH[cardFilter](m) && (m.process_title || '').toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardFilter, savedModels, searchQuery]);
  // Kartu bisa diklik admin/superadmin & user (rekap/filter); aksi tetap admin-only.
  const canFilterCards = currentUser?.role === 'admin' || currentUser?.role === 'user';
  const toggleCard = (key: typeof cardFilter) => { if (canFilterCards) setCardFilter(cur => cur === key ? null : key); };

  const countUsulan = useMemo(() => currentFilteredModels.filter(m => m.status === 'usulan').length, [currentFilteredModels]);
  const countPenyusunan = useMemo(() => currentFilteredModels.filter(m => tabOf(m.status) === 'penyusunan').length, [currentFilteredModels]);
  const countTerbit = useMemo(() => currentFilteredModels.filter(m => m.status === 'terbit').length, [currentFilteredModels]);

  // Pagination: potong daftar tab aktif
  const totalPages = Math.max(1, Math.ceil(visibleModels.length / pageSize));
  const pagedModels = useMemo(
    () => visibleModels.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [visibleModels, currentPage, pageSize]
  );
  useEffect(() => { setCurrentPage(1); }, [listTab, searchQuery, filterUnit, filterStatus, pageSize, rekapDrill]);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);
  // Reset drill-down saat pindah tab / ubah filter unit
  useEffect(() => { setRekapDrill({ l1: null, l2: null }); }, [listTab, filterUnit]);

  const listUnitL1 = useMemo(() => {
    const units = savedModels.map(m => getDisplayUnitL1(m)).filter(u => u !== '-');
    return ['Semua', ...Array.from(new Set(units))];
  }, [savedModels]);

  // Baca file cover yang dipilih → dataURL base64 (validasi ukuran & format).
  const onCoverPick = (file: File | undefined) => {
    if (!file) return;
    const okTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!okTypes.includes(file.type)) { alert('Format harus PDF, JPG, atau PNG.'); return; }
    if (file.size > MAX_COVER_BYTES) { alert(`Ukuran file ${(file.size / 1024 / 1024).toFixed(2)} MB melebihi batas 2 MB. Kompres/scan ulang dengan resolusi lebih rendah.`); return; }
    const reader = new FileReader();
    reader.onload = () => setCoverData({ dataUrl: reader.result as string, name: file.name, size: file.size });
    reader.onerror = () => alert('Gagal membaca file.');
    reader.readAsDataURL(file);
  };

  const submitCover = async () => {
    if (!coverModal.model || !coverData) return;
    setUploadingCover(true);
    try {
      const res = await apiFetch(`/sop/models/${coverModal.model.id}/cover`, token, {
        method: 'POST',
        body: JSON.stringify({ cover: coverData.dataUrl, filename: coverData.name }),
      });
      if (res.ok) {
        const mid = coverModal.model.id;
        setSavedModels(prev => prev.map(m => m.id === mid ? { ...m, status: 'verifikasi', has_cover: true, catatan: '' } : m));
        setCoverModal({ isOpen: false, model: null });
        setCoverData(null);
        alert('✅ Cover berhasil diunggah. Menunggu verifikasi admin (TTD & nomor SOP) sebelum diterbitkan.');
      } else {
        const e = await res.json().catch(() => ({}));
        alert(`❌ ${e.error || 'Gagal mengunggah cover.'}`);
      }
    } catch (e) { console.error(e); alert('❌ Gagal mengunggah cover.'); }
    finally { setUploadingCover(false); }
  };


  const deleteModel = async (modelId: number) => {
    if (!window.confirm('Yakin ingin menghapus dokumen SOP ini?')) return;
    try {
      const res = await apiFetch(`/sop/models/${modelId}`, token, { method: 'DELETE' });
      if (res.ok) {
        setSavedModels(prev => prev.filter(m => m.id !== modelId));
        alert('Berhasil dihapus.');
      }
    } catch (err) { console.error(err); }
  };

  const handleApprove = async (model: SOPModel) => {
    if (!window.confirm(`Setujui dokumen SOP "${model.process_title}"?`)) return;
    try {
      const res = await apiFetch(`/sop/models/status/${model.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', catatan: '' })
      });
      if (res.ok) {
        // Registry Dashboard TIDAK dibuat di sini — server mencatatnya saat SOP TERBIT (unggah cover).
        setSavedModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'approved', catatan: '' } : m));
        alert('SOP disetujui! Menunggu pengesahan pimpinan & unggah cover.');
      }
    } catch (err) { console.error(err); }
  };

  const submitReject = async () => {
    if (!rejectModal.note.trim()) return alert('Catatan tidak boleh kosong.');
    // 'cover' → kembalikan (approved). 'reject'/'edit' → simpan catatan (mengganti);
    // server men-set catatan_at (tanggal revisi) saat status 'rejected'.
    const newStatus = rejectModal.mode === 'cover' ? 'approved' : 'rejected';
    const catatan = rejectModal.note.trim();
    try {
      const res = await apiFetch(`/sop/models/status/${rejectModal.modelId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, catatan })
      });
      if (res.ok) {
        const row = await res.json();
        setSavedModels(prev => prev.map(m => m.id === rejectModal.modelId ? { ...m, status: newStatus, catatan, catatan_at: row.catatan_at } : m));
        const wasEdit = rejectModal.mode === 'edit';
        const wasCover = rejectModal.mode === 'cover';
        setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
        alert(wasCover ? '✅ SOP dikembalikan untuk perbaikan cover.' : wasEdit ? '✅ Catatan revisi diperbarui.' : '✅ Catatan revisi terkirim.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal menyimpan catatan revisi.'); }
    } catch (e) { console.error(e); }
  };

  // Penyusun/unit boleh unggah cover bila SOP di unit kerjanya (atau admin/pemilik).
  const canUploadCover = (m: SOPModel) =>
    currentUser?.role === 'admin' ||
    m.created_by === currentUser?.id ||
    (currentUser?.role !== 'viewer' && !!currentUser?.unit_l1 &&
      getDisplayUnitL1(m).toLowerCase() === (currentUser?.unit_l1 || '').toLowerCase());

  // Penyusun/unit boleh menanggapi catatan revisi admin saat status 'rejected'.
  const canRespond = (m: SOPModel) => currentUser?.role === 'user' && m.status === 'rejected' &&
    (m.created_by === currentUser?.id ||
      (!!currentUser?.unit_l1 && getDisplayUnitL1(m).toLowerCase() === (currentUser?.unit_l1 || '').toLowerCase()));

  const submitTanggapan = async () => {
    const m = tanggapanModal.model;
    if (!m) return;
    if (!tanggapanModal.pesan.trim()) return alert('Tulis tanggapan terlebih dahulu.');
    setSendingTanggapan(true);
    try {
      const res = await apiFetch(`/sop/models/${m.id}/tanggapan`, token, { method: 'PATCH', body: JSON.stringify({ pesan: tanggapanModal.pesan.trim() }) });
      if (res.ok) {
        const row = await res.json();
        setSavedModels(prev => prev.map(x => x.id === m.id ? { ...x, tanggapan: row.tanggapan } : x));
        setTanggapanModal({ isOpen: false, model: null, pesan: '' });
        alert('✅ Tanggapan terkirim ke admin.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal mengirim tanggapan.'); }
    } finally { setSendingTanggapan(false); }
  };

  // Batalkan penetapan: kembalikan SOP 'terbit' (Telah Ditetapkan) → 'penetapan'
  // (Proses Penetapan Menteri). Server otomatis menghapus baris registry Dashboard.
  const batalkanPenetapan = async (model: SOPModel) => {
    if (!window.confirm(`Batalkan penetapan SOP "${model.process_title}"? Dokumen kembali ke "Proses Penetapan Menteri" dan dihapus dari Dashboard.`)) return;
    try {
      const res = await apiFetch(`/sop/models/status/${model.id}`, token, { method: 'PATCH', body: JSON.stringify({ status: 'penetapan', catatan: '' }) });
      if (res.ok) {
        setSavedModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'penetapan' } : m));
        alert('✅ Penetapan dibatalkan. SOP kembali ke Proses Penetapan Menteri.');
      } else { const e = await res.json().catch(() => ({} as { error?: string })); alert(e.error || 'Gagal membatalkan penetapan.'); }
    } catch (e) { console.error(e); }
  };

  const patchStatus = async (model: SOPModel, status: string, okMsg: string, moveTerbit = false) => {
    try {
      const res = await apiFetch(`/sop/models/status/${model.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status, catatan: '' }),
      });
      if (res.ok) {
        setSavedModels(prev => prev.map(m => m.id === model.id ? { ...m, status, catatan: '' } : m));
        if (moveTerbit) setListTab('terbit');
        alert(okMsg);
      } else {
        const e = await res.json().catch(() => ({}));
        alert(`❌ ${e.error || 'Gagal memproses.'}`);
      }
    } catch (e) { console.error(e); alert('❌ Gagal memproses.'); }
  };

  // Admin menyetujui cover hasil verifikasi → SOP menunggu proses penetapan menteri (belum terbit).
  const handleSetujuiCover = (model: SOPModel) => {
    if (!window.confirm(`Cover sudah benar & bernomor SOP? Setujui cover "${model.process_title}"? SOP akan menunggu proses penetapan menteri.`)) return;
    patchStatus(model, 'penetapan', '✅ Cover disetujui. SOP menunggu proses penetapan menteri.');
  };

  // === Alur DOKUMEN MANUAL SOP (langsung dari tabel) ===
  // pending → (Setujui admin) penetapan/pengesahan pimpinan → (Unggah PDF TTD via modal)
  // verifikasi → (Tetapkan admin) terbit. Sama seperti di ManualDocDetailModal.
  const manualApproveSop = (model: SOPModel) => {
    if (!window.confirm(`Setujui dokumen SOP "${model.process_title}"? Selanjutnya menunggu pengesahan pimpinan (unggah PDF ber-TTD).`)) return;
    patchStatus(model, 'penetapan', '✅ Disetujui. Menunggu pengesahan pimpinan — unggah PDF ber-TTD.');
  };
  const manualTetapkanSop = (model: SOPModel) => {
    if (!window.confirm(`Dokumen ber-TTD sudah sesuai? Tetapkan & terbitkan SOP "${model.process_title}"?`)) return;
    patchStatus(model, 'terbit', '✅ SOP ditetapkan & resmi TERBIT.', true);
  };

  // Admin menetapkan → buka modal isian dasar penetapan & tanggal.
  const handleDitetapkan = (model: SOPModel) => {
    setPenetapanModal({
      isOpen: true, model,
      dasar: model.penetapan_dasar || '',
      tanggal: model.penetapan_tanggal ? String(model.penetapan_tanggal).slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
  };

  const submitPenetapan = async () => {
    const m = penetapanModal.model;
    if (!m) return;
    if (!penetapanModal.dasar.trim()) return alert('Isi dasar penetapan (mis. Kepmen ATR/BPN Nomor ... Tahun ...).');
    if (!penetapanModal.tanggal) return alert('Isi tanggal ditetapkan.');
    setSubmittingPenetapan(true);
    try {
      const res = await apiFetch(`/sop/models/status/${m.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'terbit', catatan: '', penetapan_dasar: penetapanModal.dasar.trim(), penetapan_tanggal: penetapanModal.tanggal }),
      });
      if (res.ok) {
        setSavedModels(prev => prev.map(x => x.id === m.id ? { ...x, status: 'terbit', catatan: '', penetapan_dasar: penetapanModal.dasar.trim(), penetapan_tanggal: penetapanModal.tanggal } : x));
        setPenetapanModal({ isOpen: false, model: null, dasar: '', tanggal: '' });
        setListTab('terbit');
        alert('✅ SOP ditetapkan & resmi TERBIT.');
      } else {
        const e = await res.json().catch(() => ({}));
        alert(`❌ ${e.error || 'Gagal menetapkan.'}`);
      }
    } catch (e) { console.error(e); alert('❌ Gagal menetapkan.'); }
    finally { setSubmittingPenetapan(false); }
  };

  // Buka cover bertanda tangan (untuk admin memeriksa saat verifikasi).
  const viewCover = async (model: SOPModel) => {
    try {
      const res = await apiFetch(`/sop/models/${model.id}/cover`, token);
      if (!res.ok) { alert('Cover belum tersedia.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { console.error(e); alert('Gagal membuka cover.'); }
  };

  const openCopyModal = (model: SOPModel) => {
    setCopyModal({
      isOpen: true,
      source: model,
      form: {
        process_title: `Salinan - ${model.process_title}`,
        jenis_proses: model.jenis_proses || '',
        klasifikasi_proses: model.klasifikasi_proses || '',
      },
    });
  };

  const submitCopy = async () => {
    if (!copyModal.source) return;
    if (!copyModal.form.process_title.trim()) return alert('Judul tidak boleh kosong.');
    setCopyingDoc(true);
    try {
      const res = await apiFetch(`/sop/models/${copyModal.source.id}/copy`, token, {
        method: 'POST',
        body: JSON.stringify({
          process_title: copyModal.form.process_title.trim(),
          jenis_proses: copyModal.form.jenis_proses || null,
          klasifikasi_proses: copyModal.form.klasifikasi_proses || null,
        }),
      });
      if (res.ok) {
        const newModel = await res.json();
        setSavedModels(prev => [newModel, ...prev]);
        setCopyModal({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } });
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyalin dokumen.');
      }
    } catch (err) { console.error(err); alert('Gagal menyalin.'); }
    finally { setCopyingDoc(false); }
  };

  const openPreview = (model: SOPModel) => {
    setPreviewModel(model);
    setEditMeta({
      process_title: model.process_title,
      jenis_proses: model.jenis_proses || '',
      klasifikasi_proses: model.klasifikasi_proses || '',
    });
  };

  const saveMetaEdit = async () => {
    if (!previewModel) return;
    if (!editMeta.process_title.trim()) return alert('Judul tidak boleh kosong.');
    if (!window.confirm('Apakah Anda yakin ingin menyimpan perubahan metadata ini?')) return;
    setSavingMeta(true);
    try {
      const res = await apiFetch(`/sop/models/${previewModel.id}/meta`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          process_title: editMeta.process_title.trim(),
          jenis_proses: editMeta.jenis_proses || null,
          klasifikasi_proses: editMeta.klasifikasi_proses || null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSavedModels(prev => prev.map(m =>
          m.id === previewModel.id
            ? { ...m, process_title: updated.process_title, jenis_proses: updated.jenis_proses, klasifikasi_proses: updated.klasifikasi_proses, updated_at: updated.updated_at }
            : m
        ));
        setPreviewModel(prev => prev ? {
          ...prev,
          process_title: updated.process_title,
          jenis_proses: updated.jenis_proses,
          klasifikasi_proses: updated.klasifikasi_proses,
          updated_at: updated.updated_at
        } : null);
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyimpan perubahan.');
      }
    } catch (err) { console.error(err); alert('Gagal menyimpan.'); }
    finally { setSavingMeta(false); }
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'terbit') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'penetapan') return 'bg-violet-50 text-violet-700 border-violet-200';
    if (status === 'verifikasi') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (status === 'approved') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (status === 'pending') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };
  // Label status yang ramah pengguna.
  const statusLabel = (status?: string, isManual?: boolean | null) => {
    if (status === 'terbit') return 'TERBIT';
    if (status === 'penetapan') return isManual ? 'MENUNGGU PENGESAHAN PIMPINAN' : 'MENUNGGU PROSES PENETAPAN MENTERI';
    if (status === 'verifikasi') return isManual ? 'VERIFIKASI TTD' : 'MENUNGGU VERIFIKASI ADMIN';
    if (status === 'approved') return 'MENUNGGU PENGESAHAN PIMPINAN';
    if (status === 'pending') return 'MENUNGGU';
    if (status === 'rejected') return 'PERLU REVISI';
    return 'DRAFT';
  };

  // Tombol aksi ringkas utk panel klik-kartu (admin/superadmin) — alur SOP tetap sama.
  const cardRowActions = (model: SOPModel) => (
    <div className="flex items-center justify-end gap-1.5 flex-wrap">
      {canRespond(model) && (
        <button onClick={(e) => { e.stopPropagation(); setTanggapanModal({ isOpen: true, model, pesan: '' }); }} className="px-3 py-2 bg-indigo-100 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Tanggapi</button>
      )}
      {currentUser?.role === 'admin' && model.status === 'rejected' && (
        <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'edit' }); }} className="px-3 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><Edit className="w-4 h-4" /> Edit Revisi</button>
      )}
      {model.is_manual ? (<>
        {currentUser?.role === 'admin' && model.status === 'pending' && (<>
          <button onClick={(e) => { e.stopPropagation(); manualApproveSop(model); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all">Setujui</button>
          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-3 py-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all">Tolak</button>
        </>)}
        {currentUser?.role !== 'viewer' && model.status === 'penetapan' && (
          <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="px-3 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><Upload className="w-4 h-4" /> Unggah PDF TTD</button>
        )}
        {currentUser?.role === 'admin' && model.status === 'verifikasi' && (<>
          <button onClick={(e) => { e.stopPropagation(); manualTetapkanSop(model); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><Stamp className="w-4 h-4" /> Tetapkan</button>
          <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="px-3 py-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all">Kembalikan</button>
        </>)}
        <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="px-3 py-2 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg border border-transparent hover:border-emerald-200 flex items-center gap-1"><FileText className="w-4 h-4" /> Lihat Dokumen</button>
      </>) : (<>
        {currentUser?.role === 'admin' && model.status === 'pending' && (<>
          <button onClick={(e) => { e.stopPropagation(); handleApprove(model); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all">Setujui</button>
          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-3 py-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all">Tolak</button>
        </>)}
        {model.status === 'approved' && canUploadCover(model) && (
          <button onClick={(e) => { e.stopPropagation(); setCoverModal({ isOpen: true, model }); setCoverData(null); }} className="px-3 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><Upload className="w-4 h-4" /> Unggah Cover TTD</button>
        )}
        {model.status === 'verifikasi' && currentUser?.role === 'admin' && (<>
          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase flex items-center gap-1"><Eye className="w-4 h-4" /> Periksa</button>
          <button onClick={(e) => { e.stopPropagation(); handleSetujuiCover(model); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all">Setujui Cover</button>
          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'cover' }); }} className="px-3 py-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all">Kembalikan</button>
        </>)}
        {model.status === 'penetapan' && currentUser?.role === 'admin' && (<>
          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase flex items-center gap-1"><Eye className="w-4 h-4" /> Cover</button>
          <button onClick={(e) => { e.stopPropagation(); handleDitetapkan(model); }} className="px-3 py-2 bg-violet-100 hover:bg-violet-600 hover:text-white text-violet-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><Landmark className="w-4 h-4" /> Ditetapkan</button>
        </>)}
        <button onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}${['terbit', 'penetapan', 'verifikasi'].includes(model.status || '') ? '&mode=view' : ''}`; }} className="px-3 py-2 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg border border-transparent hover:border-emerald-200 flex items-center gap-1"><Edit className="w-4 h-4" /> Buka</button>
      </>)}
      {model.status === 'terbit' && currentUser?.role === 'admin' && (
        <button onClick={(e) => { e.stopPropagation(); batalkanPenetapan(model); }} className="px-3 py-2 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1"><XCircle className="w-4 h-4" /> Batalkan Penetapan</button>
      )}
      {currentUser?.role === 'admin' && (
        <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-2 rounded-lg transition-colors hover:text-red-600 hover:bg-red-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Hapus Dokumen"><Trash2 className="w-4 h-4" /></button>
      )}
    </div>
  );

  if (!currentUser) return null;

  return (
    <>

      {/* MODAL PANDUAN SOP */}
      {showManualDoc && currentUser && (
        <ManualDocModal
          kind="sop"
          token={token}
          isDarkMode={isDarkMode}
          defaultL1={currentUser.role === 'user' ? (currentUser.unit_l1 || '') : ''}
          defaultL2={currentUser.role === 'user' ? (currentUser.unit_l2 || '') : ''}
          onClose={() => setShowManualDoc(false)}
          onSaved={(row) => { setSavedModels(prev => [row as unknown as SOPModel, ...prev]); setListTab('penyusunan'); }}
        />
      )}

      {/* Impor Excel massal (superadmin) */}
      {showImport && currentUser && (
        <ManualDocImportModal
          kind="sop"
          token={token}
          isDarkMode={isDarkMode}
          onClose={() => setShowImport(false)}
          onImported={(rows, masuk) => {
            setSavedModels(prev => [...(rows as unknown as SOPModel[]), ...prev]);
            setListTab(masuk === 'final' ? 'terbit' : 'penyusunan');
          }}
        />
      )}

      {/* Popup Lihat Dokumen + alur persetujuan (baris dokumen manual) */}
      {manualDetail && currentUser && (
        <ManualDocDetailModal
          kind="sop"
          model={manualDetail}
          token={token}
          role={currentUser.role}
          isDarkMode={isDarkMode}
          onClose={() => setManualDetail(null)}
          onChanged={(row) => {
            const upd = row as unknown as SOPModel;
            setSavedModels(prev => prev.map(x => x.id === upd.id ? { ...x, ...upd } : x));
            setManualDetail(prev => prev ? { ...prev, ...upd } : prev);
          }}
        />
      )}

      {showPanduan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPanduan(false)}>
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  <FileSignature className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-lg font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Panduan Dokumen SOP</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Simbol bagan alir, mutu baku, status &amp; alur penerbitan</p>
                </div>
              </div>
              <button onClick={() => setShowPanduan(false)} className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <SOPSymbolsSection isDarkMode={isDarkMode} />
            </div>
            <div className={`px-5 py-4 border-t shrink-0 flex justify-end ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setShowPanduan(false)} className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${isDarkMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                Mengerti <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className="flex justify-between items-center p-6 pb-3 shrink-0">
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Informasi SOP Baru</h3>
              <button onClick={() => setShowConfigModal(false)} className={`p-2.5 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}><X size={20} /></button>
            </div>
            <div className="px-6 pb-4 overflow-y-auto">
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Lengkapi data identitas SOP sebelum masuk ke halaman penyusunan tabel Mutu Baku.</p>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul SOP <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: Pemberian Hak Guna Bangunan" value={config.processTitle} onChange={(e) => setConfig({ ...config, processTitle: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
              </div>

              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Nomor SOP
                  <span className={`ml-2 text-[10px] font-normal ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>(opsional)</span>
                </label>
                <input type="text" placeholder="Contoh: SOP/14/ATRBPN" value={config.processKey} onChange={(e) => setConfig({ ...config, processKey: e.target.value.toUpperCase() })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis SOP (Kewenangan) <span className="text-red-500">*</span></label>
                  <select value={config.jenisSOP} onChange={(e) => setConfig({ ...config, jenisSOP: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="" disabled>-- Pilih Jenis --</option>
                    <option value="Pusat">Pusat</option>
                    <option value="Kantor Wilayah">Kantor Wilayah</option>
                    <option value="Kantor Pertanahan">Kantor Pertanahan</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi SOP <span className="text-red-500">*</span></label>
                  <select value={config.klasifikasiSOP} onChange={(e) => setConfig({ ...config, klasifikasiSOP: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="" disabled>-- Pilih Klasifikasi --</option>
                    <option value="SOP Administrasi Pemerintah">SOP Administrasi Pemerintah</option>
                    <option value="SOP Layanan Pertanahan">SOP Layanan Pertanahan</option>
                    <option value="SOP Layanan Tata Ruang">SOP Layanan Tata Ruang</option>
                    <option value="SOP Layanan Pengaduan dan Informasi">SOP Layanan Pengaduan dan Informasi</option>
                    <option value="SOP Layanan Data, Keamanan dan Infrastruktur">SOP Layanan Data, Keamanan dan Infrastruktur</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Unit Kerja Utama (Level 1) <span className="text-red-500">*</span>
                  {currentUser?.role === 'user' && (
                    <span className={`ml-2 text-[10px] font-normal inline-flex items-center gap-0.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      <Lock size={9} /> dikunci sesuai profil
                    </span>
                  )}
                </label>
                {currentUser?.role === 'user' ? (
                  <div className={`w-full px-4 py-2.5 text-sm border rounded-xl flex items-center gap-2 ${isDarkMode ? 'bg-[#0F172A] border-emerald-700 text-slate-300' : 'bg-emerald-50 border-emerald-300 text-slate-700'}`}>
                    <Lock size={14} className="text-emerald-500 shrink-0" />
                    <span className="font-medium truncate">{config.orgUnitL1 || '-'}</span>
                  </div>
                ) : (
                  <select value={config.orgUnitL1} onChange={handleL1Change} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                    <option value="" disabled>-- Pilih Unit Utama --</option>
                    {l1Options.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Unit (Level 2)</label>
                <select value={config.orgUnitL2} onChange={(e) => setConfig({ ...config, orgUnitL2: e.target.value })} disabled={!config.orgUnitL1} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                  <option value="">-- Tidak Ada / Kosong --</option>
                  {l2Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Disahkan Oleh — masuk ke cover SOP (Jabatan, Nama Pejabat, NIP) */}
              <div className={`sm:col-span-2 pt-2 mt-1 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <p className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-[#002855]'}`}>Disahkan Oleh <span className={`font-normal ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>(muncul di cover — opsional)</span></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jabatan Pejabat</label>
                    <input type="text" placeholder="Contoh: Direktur Jenderal Penetapan Hak dan Pendaftaran Tanah" value={config.jabatanPengesah} onChange={(e) => setConfig({ ...config, jabatanPengesah: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nama Pejabat</label>
                    <input type="text" placeholder="Nama lengkap" value={config.namaPengesah} onChange={(e) => setConfig({ ...config, namaPengesah: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>NIP</label>
                    <input type="text" placeholder="NIP pejabat" value={config.nipPengesah} onChange={(e) => setConfig({ ...config, nipPengesah: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
                  </div>
                </div>
              </div>
            </div>
            </div>
            <div className={`flex justify-end gap-3 p-6 pt-4 border-t shrink-0 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
              <button onClick={() => setShowConfigModal(false)} className={`px-5 py-2.5 text-sm font-bold border rounded-xl transition-colors ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>Batal</button>
              <button onClick={handleStartSOP} className="px-6 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95">
                 Buat SOP <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className={`p-5 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50'}`}>
              <h3 className={`font-bold flex items-center gap-2 ${rejectModal.mode === 'edit' ? 'text-amber-600' : 'text-red-600'}`}>{rejectModal.mode === 'edit' ? <><Edit className="w-5 h-5" /> Edit Catatan Revisi</> : <><XCircle className="w-5 h-5" /> {rejectModal.mode === 'cover' ? 'Kembalikan untuk Perbaikan Cover' : 'Revisi Dokumen'}</>}</h3>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })} className={`p-2.5 rounded-lg min-w-11 min-h-11 flex items-center justify-center transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {rejectModal.mode === 'cover' && (
                <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tulis apa yang perlu diperbaiki pada cover (mis. tanda tangan kurang jelas, nomor SOP belum diisi). SOP dikembalikan ke penyusun untuk mengunggah ulang cover.</p>
              )}
              {rejectModal.mode === 'edit' && (() => { const cur = savedModels.find(m => m.id === rejectModal.modelId); return cur?.tanggapan ? (
                <div className={`mb-4 rounded-xl border p-3.5 ${isDarkMode ? 'bg-indigo-900/10 border-indigo-800' : 'bg-indigo-50 border-indigo-200'}`}>
                  <p className={`text-[10px] font-black uppercase tracking-wide mb-1 flex items-center gap-1.5 ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}><MessageSquare className="w-3.5 h-3.5" /> Tanggapan dari Penyusun</p>
                  <p className={`text-xs whitespace-pre-wrap wrap-break-word max-h-40 overflow-y-auto ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{cur.tanggapan}</p>
                </div>
              ) : null; })()}
              <textarea rows={6} placeholder={rejectModal.mode === 'cover' ? 'Contoh: Nomor SOP belum diisi pada cover; mohon lengkapi lalu scan & unggah ulang.' : rejectModal.mode === 'edit' ? 'Perbaiki / ubah catatan revisi…' : 'Tuliskan poin revisi...'} value={rejectModal.note} onChange={(e) => setRejectModal({...rejectModal, note: e.target.value})} className={`w-full border rounded-xl p-4 text-sm font-medium outline-none focus:ring-2 shadow-inner ${rejectModal.mode === 'edit' ? 'focus:ring-amber-500' : 'focus:ring-red-500'} ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-400 text-slate-900'}`} />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })} className={`px-5 py-2.5 text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Batal</button>
                <button onClick={submitReject} className={`px-6 py-2.5 text-sm font-bold text-white rounded-xl shadow-md ${rejectModal.mode === 'edit' ? 'bg-amber-600' : 'bg-red-600'}`}>{rejectModal.mode === 'edit' ? 'Simpan Perubahan' : 'Kirim Catatan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DISKUSI/TANGGAPAN REVISI (penyusun menanggapi catatan revisi admin) */}
      {tanggapanModal.isOpen && tanggapanModal.model && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setTanggapanModal({ isOpen: false, model: null, pesan: '' })}>
          <div className={`rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`} onClick={e => e.stopPropagation()}>
            <div className={`p-5 border-b flex justify-between items-center shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="min-w-0">
                <h3 className="font-bold text-indigo-600 flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Tanggapi Catatan Revisi</h3>
                <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{tanggapanModal.model.process_title}</p>
              </div>
              <button onClick={() => setTanggapanModal({ isOpen: false, model: null, pesan: '' })} className={`p-2.5 rounded-xl ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <div className={`rounded-xl border p-3.5 ${isDarkMode ? 'bg-red-900/10 border-red-800' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className={`text-[11px] font-black uppercase tracking-wide ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>Catatan Revisi dari Admin</p>
                  {tanggapanModal.model.catatan_at && <span className={`text-[10px] font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(tanggapanModal.model.catatan_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <p className={`text-sm whitespace-pre-wrap wrap-break-word ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{tanggapanModal.model.catatan || '—'}</p>
              </div>
              {tanggapanModal.model.tanggapan && (
                <div className={`rounded-xl border p-3.5 ${isDarkMode ? 'bg-indigo-900/10 border-indigo-800' : 'bg-indigo-50 border-indigo-200'}`}>
                  <p className={`text-[11px] font-black uppercase tracking-wide mb-1 ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>Riwayat Tanggapan</p>
                  <p className={`text-sm whitespace-pre-wrap wrap-break-word ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{tanggapanModal.model.tanggapan}</p>
                </div>
              )}
              <div>
                <label className={`text-[10px] font-black uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Tanggapan Anda</label>
                <textarea rows={4} value={tanggapanModal.pesan} onChange={e => setTanggapanModal(t => ({ ...t, pesan: e.target.value }))} placeholder="Sampaikan tanggapan / penjelasan atas catatan revisi…"
                  className={`w-full mt-1 border rounded-xl p-3.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
              </div>
            </div>
            <div className={`flex justify-end gap-2 px-5 py-4 border-t shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setTanggapanModal({ isOpen: false, model: null, pesan: '' })} className={`px-4 py-2.5 text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Batal</button>
              <button onClick={submitTanggapan} disabled={sendingTanggapan} className="px-6 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl shadow-md hover:bg-indigo-700 disabled:bg-slate-300">{sendingTanggapan ? 'Mengirim…' : 'Kirim Tanggapan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SALIN DOKUMEN SOP */}
      {copyModal.isOpen && copyModal.source && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => !copyingDoc && setCopyModal({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } })}>
          <div
            className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh] sm:max-h-[85vh] ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-4 sm:p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`font-extrabold text-base ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Salin Dokumen SOP</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Buat salinan baru sebagai Draft</p>
                </div>
              </div>
              {!copyingDoc && (
                <button onClick={() => setCopyModal({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } })} className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
              <div className={`rounded-xl p-3 border ${isDarkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Dokumen Sumber</p>
                <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{copyModal.source.process_title}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {copyModal.source.jenis_proses && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-violet-300 bg-violet-900/30 border-violet-700' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>{copyModal.source.jenis_proses}</span>
                  )}
                  {copyModal.source.klasifikasi_proses && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-teal-300 bg-teal-900/30 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-200'}`}>{copyModal.source.klasifikasi_proses}</span>
                  )}
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${statusBadgeClass(copyModal.source.status)}`}>{copyModal.source.status || 'DRAFT'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul SOP Baru <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={copyModal.form.process_title}
                    onChange={e => setCopyModal(prev => ({ ...prev, form: { ...prev.form, process_title: e.target.value } }))}
                    className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-amber-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Kewenangan</label>
                    <select
                      value={copyModal.form.jenis_proses}
                      onChange={e => setCopyModal(prev => ({ ...prev, form: { ...prev.form, jenis_proses: e.target.value } }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {JENIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi</label>
                    <select
                      value={copyModal.form.klasifikasi_proses}
                      onChange={e => setCopyModal(prev => ({ ...prev, form: { ...prev.form, klasifikasi_proses: e.target.value } }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {KLASIFIKASI_OPTIONS_SOP.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <p className={`text-xs rounded-lg px-3 py-2 border ${isDarkMode ? 'text-amber-300 bg-amber-900/10 border-amber-800' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                Salinan akan berstatus <strong>Draft</strong> dan terhubung ke unit kerja yang sama dengan dokumen sumber. Nomor SOP tidak disalin.
              </p>
            </div>

            <div className={`p-4 sm:p-5 border-t shrink-0 flex gap-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button
                onClick={() => setCopyModal({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } })}
                disabled={copyingDoc}
                className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors disabled:opacity-50 ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                Batal
              </button>
              <button
                onClick={submitCopy}
                disabled={copyingDoc}
                className="flex-1 px-5 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Copy className="w-4 h-4" />
                {copyingDoc ? 'Menyalin...' : 'Salin Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW & EDIT METADATA SOP */}
      {previewModel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setPreviewModel(null)}>
          <div
            className={`w-full sm:max-w-lg md:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-start justify-between p-4 sm:p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/60' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 rounded-xl shrink-0 ${isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                  <FileSignature className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Detail Dokumen SOP</p>
                  <p className={`text-xs truncate max-w-55 sm:max-w-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{previewModel.process_key ? `No: ${previewModel.process_key}` : '—'}</p>
                </div>
              </div>
              <button onClick={() => setPreviewModel(null)} className={`p-2.5 rounded-xl transition-colors shrink-0 ml-2 ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body scroll */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
              {/* Status + Unit */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${statusBadgeClass(previewModel.status)}`}>
                  {previewModel.status === 'terbit' && <Stamp className="w-3 h-3" />}
                  {previewModel.status === 'penetapan' && <Landmark className="w-3 h-3" />}
                  {previewModel.status === 'verifikasi' && <ClipboardCheck className="w-3 h-3" />}
                  {previewModel.status === 'approved' && <Upload className="w-3 h-3" />}
                  {previewModel.status === 'pending' && <Clock className="w-3 h-3" />}
                  {previewModel.status === 'rejected' && <XCircle className="w-3 h-3" />}
                  {(!previewModel.status || previewModel.status === 'draft') && <FileEdit className="w-3 h-3" />}
                  {statusLabel(previewModel.status)}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border font-medium ${isDarkMode ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                  <Building2 className="w-3 h-3" />
                  {getDisplayUnitL1(previewModel)}{getDisplayUnitL2(previewModel) ? ` › ${getDisplayUnitL2(previewModel)}` : ''}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-bold text-emerald-600 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                  <GitCommit className="w-3 h-3" />Versi {previewModel.version}
                </span>
              </div>

              {/* Catatan revisi */}
              {previewModel.catatan && (
                <div className={`rounded-xl p-3 border text-sm ${isDarkMode ? 'bg-red-900/10 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <p className="font-bold text-xs uppercase tracking-wide mb-1">Catatan Revisi</p>
                  <p className="leading-relaxed">{previewModel.catatan}</p>
                </div>
              )}

              {/* Info penetapan (SOP terbit) */}
              {previewModel.status === 'terbit' && (previewModel.penetapan_dasar || previewModel.penetapan_tanggal) && (
                <div className={`rounded-xl p-3 border ${isDarkMode ? 'bg-violet-900/20 border-violet-800' : 'bg-violet-50 border-violet-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Landmark className={`w-4 h-4 ${isDarkMode ? 'text-violet-400' : 'text-violet-600'}`} />
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${isDarkMode ? 'text-violet-300' : 'text-violet-700'}`}>Penetapan</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:gap-2">
                      <span className={`text-[11px] font-bold shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ditetapkan/Diterbitkan tanggal:</span>
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{previewModel.penetapan_tanggal ? new Date(previewModel.penetapan_tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:gap-2">
                      <span className={`text-[11px] font-bold shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Telah ditetapkan melalui:</span>
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{previewModel.penetapan_dasar || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit fields — terkunci sejak verifikasi/penetapan/terbit */}
              {['verifikasi', 'penetapan', 'terbit'].includes(previewModel.status) && (
                <div className={`flex items-start gap-2 text-xs font-semibold rounded-xl p-3 border ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{previewModel.status === 'terbit' ? <>SOP sudah <b>terbit (disahkan)</b> — judul &amp; informasi terkunci.</> : <>SOP sedang <b>diproses (verifikasi/penetapan)</b> — judul &amp; informasi terkunci.</>} Untuk merevisi, gunakan fitur <b>Salin</b>.</span>
                </div>
              )}
              {(() => { const metaLocked = ['verifikasi', 'penetapan', 'terbit'].includes(previewModel.status); return (
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul / Nama SOP <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={editMeta.process_title}
                    disabled={metaLocked}
                    onChange={e => setEditMeta(prev => ({ ...prev, process_title: e.target.value }))}
                    className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Kewenangan</label>
                    <select
                      value={editMeta.jenis_proses}
                      disabled={metaLocked}
                      onChange={e => setEditMeta(prev => ({ ...prev, jenis_proses: e.target.value }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {JENIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi</label>
                    <select
                      value={editMeta.klasifikasi_proses}
                      disabled={metaLocked}
                      onChange={e => setEditMeta(prev => ({ ...prev, klasifikasi_proses: e.target.value }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {KLASIFIKASI_OPTIONS_SOP.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              ); })()}

              <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <Calendar className="w-3 h-3 inline mr-1" />
                Terakhir diperbarui: {new Date(previewModel.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Footer actions */}
            <div className={`p-4 sm:p-5 border-t shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button
                onClick={() => { window.location.href = `/e-sop-atrbpn/sop/studio?id=${previewModel.id}`; }}
                className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-bold rounded-xl border flex items-center justify-center gap-2 transition-colors ${isDarkMode ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/20' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
              >
                <ExternalLink className="w-4 h-4" /> Buka di Studio
              </button>
              <div className="flex gap-2 flex-1 sm:flex-none sm:ml-auto">
                <button
                  onClick={() => setPreviewModel(null)}
                  className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl border transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Tutup
                </button>
                {!['verifikasi', 'penetapan', 'terbit'].includes(previewModel.status) && (
                  <button
                    onClick={saveMetaEdit}
                    disabled={savingMeta}
                    className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    {savingMeta ? 'Menyimpan...' : 'Simpan'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {currentUser.role === 'admin' ? 'Manajemen Pengajuan (Pusat)' : `${currentUser.unit_l1}${currentUser.unit_l2 ? ' › ' + currentUser.unit_l2 : ''}`}
          </p>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button onClick={() => setShowPanduan(true)} className={`px-4 py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
              <HelpCircle className="w-4 h-4" /> Panduan
            </button>
            {isSuperadmin && (
              <button onClick={() => setShowImport(true)} className={`px-4 py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                <FileSpreadsheet className="w-4 h-4" /> Impor Excel
              </button>
            )}
            <button onClick={() => setShowManualDoc(true)} className={`px-4 py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/30' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
              <FileUp className="w-4 h-4" /> Dokumen Manual
            </button>
            <button onClick={handleOpenNewSOP} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all">
              <Plus size={18} /> Buat SOP Baru
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-8">
          <div onClick={() => toggleCard('total')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm flex justify-between items-center gap-2 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'total' ? 'ring-2 ring-[#002855]' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="min-w-0"><p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Total</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{currentFilteredModels.length}</p></div>
            <div className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileStack className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div onClick={() => toggleCard('draft')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-slate-400 flex items-center min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'draft' ? 'ring-2 ring-slate-400' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="min-w-0 w-full">
              <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Draft</p>
              <div className="flex items-center gap-2.5">
                <p className={`text-2xl sm:text-3xl font-black leading-none shrink-0 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{countUsulan + currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</p>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold w-fit ${isDarkMode ? 'bg-slate-700/60 text-slate-300' : 'bg-slate-100 text-slate-600'}`}><b className="font-black">{countUsulan}</b> Usulan</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold w-fit ${isDarkMode ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}><b className="font-black">{currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</b> Dalam Proses</span>
                </div>
              </div>
            </div>
          </div>
          <div onClick={() => toggleCard('pending')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'pending' ? 'ring-2 ring-blue-500' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] sm:text-xs font-bold text-blue-400 uppercase tracking-wide leading-tight wrap-break-word">Review Ortala MR</p>
            <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
              <p className="text-2xl sm:text-3xl font-black text-blue-600 leading-none">{currentFilteredModels.filter(m => m.status === 'pending').length}</p>
              <div className="p-2 sm:p-2.5 bg-blue-50 rounded-xl text-blue-400 shrink-0"><Clock className="w-5 h-5" /></div>
            </div>
          </div>
          <div onClick={() => toggleCard('rejected')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-red-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'rejected' ? 'ring-2 ring-red-500' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] sm:text-xs font-bold text-red-400 uppercase tracking-wide leading-tight wrap-break-word">Perlu Revisi</p>
            <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
              <p className="text-2xl sm:text-3xl font-black text-red-600 leading-none">{currentFilteredModels.filter(m => m.status === 'rejected').length}</p>
              <div className="p-2 sm:p-2.5 bg-red-50 rounded-xl text-red-400 shrink-0"><AlertCircle className="w-5 h-5" /></div>
            </div>
          </div>
          <div onClick={() => toggleCard('pengesahan')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'pengesahan' ? 'ring-2 ring-emerald-500' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wide leading-tight wrap-break-word">Proses Pengesahan Pimpinan</p>
            <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 leading-none">{currentFilteredModels.filter(m => ['approved', 'verifikasi'].includes(m.status)).length}</p>
              <div className="p-2 sm:p-2.5 bg-emerald-50 rounded-xl text-emerald-400 shrink-0"><CheckCircle className="w-5 h-5" /></div>
            </div>
          </div>
          <div onClick={() => toggleCard('penetapan')} className={`col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-violet-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'penetapan' ? 'ring-2 ring-violet-500' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] sm:text-xs font-bold text-violet-400 uppercase tracking-wide leading-tight wrap-break-word">Proses Penetapan Menteri</p>
            <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
              <p className="text-2xl sm:text-3xl font-black text-violet-600 leading-none">{currentFilteredModels.filter(m => m.status === 'penetapan').length}</p>
              <div className="p-2 sm:p-2.5 bg-violet-50 rounded-xl text-violet-400 shrink-0"><Landmark className="w-5 h-5" /></div>
            </div>
          </div>
          <div onClick={() => toggleCard('terbit')} className={`col-span-2 sm:col-span-1 p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-teal-500 flex flex-col min-h-24 transition-all hover:shadow-md ${canFilterCards ? 'cursor-pointer' : ''} ${cardFilter === 'terbit' ? 'ring-2 ring-teal-500' : ''} ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <p className="text-[10px] sm:text-xs font-bold text-teal-500 uppercase tracking-wide leading-tight wrap-break-word">Telah Ditetapkan (Terbit)</p>
            <div className="flex justify-between items-end gap-2 mt-auto pt-1.5">
              <p className="text-2xl sm:text-3xl font-black text-teal-600 leading-none">{currentFilteredModels.filter(m => m.status === 'terbit').length}</p>
              <div className="p-2 sm:p-2.5 bg-teal-50 rounded-xl text-teal-500 shrink-0"><Stamp className="w-5 h-5" /></div>
            </div>
          </div>
        </div>

        {/* Panel hasil klik kartu (admin/superadmin) — read-only, alur penetapan tidak berubah */}
        {canFilterCards && cardFilter && (
          <div className={`rounded-2xl border shadow-sm overflow-hidden mb-8 ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
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
                    <th className="px-4 sm:px-6 py-3 text-center">Aksi / Tindakan</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {cardFilterModels.length === 0 ? (
                    <tr><td colSpan={4} className={`px-6 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada dokumen.</td></tr>
                  ) : cardFilterModels.map(model => (
                    <tr key={model.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-emerald-50/40'}`}>
                      <td className="px-4 sm:px-6 py-3.5">
                        <button onClick={() => { if (model.is_manual) { setManualDetail(model); } else { openPreview(model); } }} className={`font-bold text-left hover:underline ${isDarkMode ? 'text-white hover:text-emerald-400' : 'text-[#002855] hover:text-emerald-600'}`}>{model.process_title}</button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {model.is_manual && <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-amber-300 bg-amber-900/30 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>Manual{model.manual_nomor ? ` · ${model.manual_nomor}` : ''}</span>}
                          <span className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}><Calendar className="w-3 h-3" />{new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{getDisplayUnitL1(model)}</p>
                        {getDisplayUnitL2(model) && <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{getDisplayUnitL2(model)}</p>}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${statusBadgeClass(model.status)}`}>{statusLabel(model.status, model.is_manual)}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">{cardRowActions(model)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!cardFilter && (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`p-4 sm:p-5 border-b flex flex-col gap-3 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            {/* Baris tab — dapat di-scroll horizontal di layar kecil */}
            <div className="min-w-0">
              <div className={`flex gap-1 p-1 rounded-xl overflow-x-auto ${isDarkMode ? 'bg-[#0F172A] border border-slate-700' : 'bg-slate-100 border border-slate-200'}`} style={{ scrollbarWidth: 'none' }}>
                {([
                  { key: 'usulan', icon: FileEdit, label: 'Daftar Usulan', short: 'Usulan', count: countUsulan },
                  { key: 'penyusunan', icon: FileSignature, label: 'Proses Penyusunan', short: 'Penyusunan', count: countPenyusunan },
                  { key: 'terbit', icon: Stamp, label: 'SOP Terbit', short: 'Terbit', count: countTerbit },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setListTab(t.key)}
                    className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${listTab === t.key ? (isDarkMode ? 'bg-[#151F32] text-white shadow' : 'bg-white text-[#002855] shadow-sm') : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                  >
                    <t.icon className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.short}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${listTab === t.key ? 'bg-emerald-100 text-emerald-700' : (isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600')}`}>{t.count}</span>
                  </button>
                ))}
              </div>
              <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {listTab === 'usulan'
                  ? 'Rencana SOP yang akan disusun — masukkan judul, lalu Lanjut Penyusunan.'
                  : listTab === 'penyusunan'
                  ? 'Draf, menunggu, perlu revisi, & sudah disetujui (menunggu pengesahan pimpinan/penetapan).'
                  : 'SOP yang sudah disahkan & ditetapkan.'}
              </p>
            </div>
            {/* Baris filter — responsif */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
              {currentUser.role === 'admin' && (
                <div className="relative w-full sm:w-56">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                  <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="Semua">Unit Kerja: Semua</option>
                    {listUnitL1.filter(u => u !== 'Semua').map(unit => (<option key={unit as string} value={unit as string}>{unit as string}</option>))}
                  </select>
                </div>
              )}
              <div className="relative w-full sm:w-52">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                  <option value="Semua">Status: Semua</option>
                  <option value="usulan">Status: Usulan</option>
                  <option value="draft">Status: Draft</option>
                  <option value="pending">Status: Menunggu</option>
                  <option value="rejected">Status: Perlu Revisi</option>
                  <option value="approved">Status: Menunggu Pengesahan</option>
                  <option value="verifikasi">Status: Menunggu Verifikasi</option>
                  <option value="penetapan">Status: Menunggu Penetapan</option>
                  <option value="terbit">Status: Terbit</option>
                </select>
              </div>
              <div className="relative w-full sm:flex-1 sm:min-w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                <input type="text" placeholder="Cari judul atau nomor SOP..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
              </div>
            </div>
          </div>

          {isAdminRekap && rekapDrill.l2 === null ? (
            <div className="p-4 sm:p-5">
              {listTab === 'usulan' && (
                <div className={`-m-4 sm:-m-5 mb-3 sm:mb-4 p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/30' : 'border-slate-100 bg-emerald-50/30'}`}>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Daftar Usulan per <b>Unit Kerja</b> (berdasarkan Proses Bisnis Level 2). Klik unit untuk melihat usulannya.</p>
                  <button onClick={openUsulanModal} className="px-4 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> Tambah Usulan</button>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-sm font-semibold mb-1 flex-wrap">
                <button onClick={() => setRekapDrill({ l1: null, l2: null })} className={rekapDrill.l1 !== null ? 'text-emerald-600 hover:underline' : (isDarkMode ? 'text-slate-200' : 'text-[#002855]')}>Semua Unit Kerja</button>
                {rekapDrill.l1 !== null && (<><ChevronRight className="w-4 h-4 text-slate-400" /><span className={isDarkMode ? 'text-white' : 'text-[#002855]'}>{rekapDrill.l1}</span></>)}
              </div>
              <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{rekapDrill.l1 === null ? `Rekap ${listTab === 'usulan' ? 'usulan' : 'dokumen'} per Unit Kerja Level 1. Klik baris untuk melihat sub-unit (Level 2).` : 'Klik sub-unit untuk melihat daftar dokumennya.'}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`text-[10px] font-bold uppercase tracking-wide border-b ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50/80 border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3 text-left">{rekapDrill.l1 === null ? 'Unit Kerja (Level 1)' : 'Sub-Unit (Level 2)'}</th>
                      {listTab === 'usulan' ? (
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Jumlah Usulan</th>
                      ) : (<>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>Draft Usulan</th>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-indigo-300' : 'text-indigo-500'}`}>Draft Proses</th>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-blue-300' : 'text-blue-500'}`}>Review Ortala MR</th>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-emerald-300' : 'text-emerald-500'}`}>Pengesahan Pimpinan</th>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-red-300' : 'text-red-500'}`}>Perlu Revisi</th>
                        <th className={`px-2 py-3 text-center ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Total</th>
                      </>)}
                      <th className="px-2 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                    {rekapRows.length === 0 ? (
                      <tr><td colSpan={listTab === 'usulan' ? 3 : 8} className={`px-4 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'usulan' ? 'Belum ada usulan.' : 'Tidak ada dokumen dalam proses penyusunan.'}</td></tr>
                    ) : rekapRows.map(row => (
                      <tr key={row.nama} onClick={() => setRekapDrill(rekapDrill.l1 === null ? { l1: row.nama, l2: null } : { l1: rekapDrill.l1, l2: row.nama })} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-emerald-50/50'}`}>
                        <td className={`px-4 py-3 font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{row.nama}</td>
                        {listTab === 'usulan' ? (
                          <td className="px-2 py-3 text-center"><span className={`inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg text-xs font-black text-white ${isDarkMode ? 'bg-emerald-600' : 'bg-[#002855]'}`}>{row.usulan}</span></td>
                        ) : (<>
                          <td className="px-2 py-3 text-center">{rekapBadge(row.usulan, 'slate')}</td>
                          <td className="px-2 py-3 text-center">{rekapBadge(row.draft, 'indigo')}</td>
                          <td className="px-2 py-3 text-center">{rekapBadge(row.pending, 'blue')}</td>
                          <td className="px-2 py-3 text-center">{rekapBadge(row.pengesahan, 'emerald')}</td>
                          <td className="px-2 py-3 text-center">{rekapBadge(row.revisi, 'red')}</td>
                          <td className="px-2 py-3 text-center"><span className={`inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg text-xs font-black text-white ${isDarkMode ? 'bg-emerald-600' : 'bg-[#002855]'}`}>{row.total}</span></td>
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
              <button onClick={() => setRekapDrill({ l1: null, l2: null })} className="text-emerald-600 hover:underline">Semua Unit</button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button onClick={() => setRekapDrill({ l1: rekapDrill.l1, l2: null })} className="text-emerald-600 hover:underline">{rekapDrill.l1}</button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <span className={isDarkMode ? 'text-white' : 'text-[#002855]'}>{rekapDrill.l2}</span>
            </div>
          )}

          {/* Aksi tambah usulan */}
          {listTab === 'usulan' && (
            <div className={`p-4 sm:p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/30' : 'border-slate-100 bg-emerald-50/30'}`}>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Daftar rencana SOP yang akan disusun. Klik <b>Lanjut Penyusunan</b> pada sebuah usulan untuk mulai menyusun di Studio.</p>
              <button onClick={openUsulanModal} className="px-4 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 shrink-0"><Plus className="w-4 h-4" /> Tambah Usulan</button>
            </div>
          )}

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50/80 border-slate-200'}`}>
                <tr>
                  <th className="px-6 py-4 w-1/3">Informasi Dokumen</th>
                  <th className="px-6 py-4 w-1/4">Unit Kerja</th>
                  <th className="px-6 py-4">Status Pengajuan</th>
                  <th className="px-6 py-4 text-center w-auto min-w-55 xl:min-w-70">Aksi / Tindakan</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {loading ? (
                  <tr><td colSpan={4} className={`px-6 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Memuat data...</td></tr>
                ) : pagedModels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <Search className={`w-12 h-12 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                        <p className={`font-medium text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'terbit' ? 'Belum ada SOP terbit.' : listTab === 'usulan' ? 'Belum ada usulan — tambahkan judul rencana di atas.' : 'Tidak ada dokumen dalam penyusunan.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedModels.map((model) => (
                    <tr
                      key={model.id}
                      onClick={() => model.is_manual ? setManualDetail(model) : openPreview(model)}
                      className={`transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-emerald-50/40'}`}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (model.is_manual) { setManualDetail(model); } else { window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}&mode=view`; } }}
                          className={`font-bold text-base text-left hover:underline ${isDarkMode ? 'text-white hover:text-emerald-400' : 'text-[#002855] hover:text-emerald-600'}`}
                        >
                          {model.process_title}
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {model.is_manual && (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border uppercase ${isDarkMode ? 'text-amber-300 bg-amber-900/30 border-amber-700' : 'text-amber-700 bg-amber-50 border-amber-300'}`}>
                              Manual{model.manual_nomor ? ` · ${model.manual_nomor}` : ''}
                            </span>
                          )}
                          {model.process_key && (
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>No: {model.process_key}</span>
                          )}
                          {model.jenis_proses && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-violet-300 bg-violet-900/30 border-violet-700' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>{model.jenis_proses}</span>
                          )}
                          {model.klasifikasi_proses && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-teal-300 bg-teal-900/30 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-200'}`}>{model.klasifikasi_proses}</span>
                          )}
                          <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}><Calendar className="w-3 h-3" />{new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"><GitCommit className="w-3 h-3" />Versi {model.version}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className={`font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{getDisplayUnitL1(model)}</p>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{getDisplayUnitL2(model)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${statusBadgeClass(model.status)}`}>
                          {model.status === 'terbit' && <Stamp className="w-3 h-3" />}
                          {model.status === 'penetapan' && <Landmark className="w-3 h-3" />}
                          {model.status === 'verifikasi' && <ClipboardCheck className="w-3 h-3" />}
                          {model.status === 'approved' && <FileSignature className="w-3 h-3" />}
                          {model.status === 'pending' && <Clock className="w-3 h-3" />}
                          {model.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {(!model.status || model.status === 'draft') && <FileEdit className="w-3 h-3" />}
                          {statusLabel(model.status, model.is_manual)}
                        </span>
                        {model.status === 'approved' && !model.is_manual && (
                          <p className={`mt-1.5 text-[10px] leading-snug max-w-60 font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>SOP yang sudah disahkan/disetujui/ditandatangani, selanjutnya cover dapat di-scan &amp; diunggah pada sistem ini.</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {model.status === 'usulan' && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); handleLanjutPenyusunan(model); }} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><ChevronRight className="w-4 h-4" /> Lanjut Penyusunan</button>
                              {(currentUser.role === 'admin' || model.created_by === currentUser.id) && (
                                <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-2.5 rounded-lg transition-colors hover:text-red-600 hover:bg-red-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Hapus Usulan"><Trash2 className="w-4 h-4" /></button>
                              )}
                            </>
                          )}
                          {model.status !== 'usulan' && (<>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (model.is_manual) { setManualDetail(model); } else { window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; } }}
                            className="px-3 py-2.5 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-emerald-200"
                          >
                            {model.is_manual ? <><FileText className="w-4 h-4" /> Lihat Dokumen</> : <><Edit className="w-4 h-4" /> {model.status === 'approved' || model.status === 'rejected' ? 'Buka/Edit' : 'Buka'}</>}
                          </button>

                          {/* Aksi alur dokumen MANUAL (langsung di tabel) */}
                          {model.is_manual && currentUser.role === 'admin' && model.status === 'pending' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); manualApproveSop(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}
                          {model.is_manual && currentUser.role !== 'viewer' && model.status === 'penetapan' && (
                            <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="ml-2 px-3 py-2.5 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Upload className="w-4 h-4" /> Unggah PDF TTD</button>
                          )}
                          {model.is_manual && currentUser.role === 'admin' && model.status === 'verifikasi' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); manualTetapkanSop(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Stamp className="w-4 h-4" /> Tetapkan</button>
                              <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Kembalikan</button>
                            </div>
                          )}

                          {currentUser.role !== 'viewer' && !model.is_manual && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openCopyModal(model); }}
                              className={`p-2.5 rounded-lg transition-colors hover:text-amber-600 hover:bg-amber-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                              title="Salin Dokumen"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          <ShareButton kind="sop" modelId={model.id} token={token} isDarkMode={isDarkMode} />
                          {canRespond(model) && (
                            <button onClick={(e) => { e.stopPropagation(); setTanggapanModal({ isOpen: true, model, pesan: '' }); }} className="px-3 py-2.5 bg-indigo-100 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Tanggapi</button>
                          )}
                          {currentUser.role === 'admin' && model.status === 'rejected' && (
                            <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'edit' }); }} className="px-3 py-2.5 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Edit className="w-4 h-4" /> Edit Revisi</button>
                          )}

                          {currentUser.role === 'admin' && !model.is_manual && model.status === 'pending' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}
                          {model.status === 'approved' && !model.is_manual && canUploadCover(model) && (
                            <button onClick={(e) => { e.stopPropagation(); setCoverModal({ isOpen: true, model }); setCoverData(null); }} className="ml-2 px-3 py-2.5 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Upload className="w-4 h-4" /> Unggah Cover TTD</button>
                          )}
                          {model.status === 'verifikasi' && !model.is_manual && currentUser.role === 'admin' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1.5"><Eye className="w-4 h-4" /> Periksa Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); handleSetujuiCover(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'cover' }); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Kembalikan</button>
                            </div>
                          )}
                          {model.status === 'verifikasi' && !model.is_manual && currentUser.role !== 'admin' && (
                            <span className="ml-2 px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-200">Menunggu verifikasi admin</span>
                          )}
                          {model.status === 'penetapan' && !model.is_manual && currentUser.role === 'admin' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1.5"><Eye className="w-4 h-4" /> Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDitetapkan(model); }} className="px-3 py-2.5 bg-violet-100 hover:bg-violet-600 hover:text-white text-violet-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Landmark className="w-4 h-4" /> Ditetapkan</button>
                            </div>
                          )}
                          {model.status === 'penetapan' && !model.is_manual && currentUser.role !== 'admin' && (
                            <span className="ml-2 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 rounded-lg border border-violet-200">Menunggu penetapan menteri</span>
                          )}
                          {model.status === 'terbit' && currentUser.role === 'admin' && (
                            <button onClick={(e) => { e.stopPropagation(); batalkanPenetapan(model); }} className="ml-2 px-3 py-2.5 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><XCircle className="w-4 h-4" /> Batalkan Penetapan</button>
                          )}
                          {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }}
                              className={`p-2.5 rounded-lg transition-colors hover:text-red-600 hover:bg-red-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                              title="Hapus Dokumen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          </>)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y">
            {loading ? (
              <div className={`px-4 py-10 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Memuat data...</div>
            ) : pagedModels.length === 0 ? (
              <div className="px-4 py-12 text-center flex flex-col items-center">
                <Search className={`w-10 h-10 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'terbit' ? 'Belum ada SOP terbit.' : listTab === 'usulan' ? 'Belum ada usulan — tambahkan judul rencana di atas.' : 'Tidak ada dokumen dalam penyusunan.'}</p>
              </div>
            ) : (
              pagedModels.map((model) => (
                <div
                  key={model.id}
                  onClick={() => model.is_manual ? setManualDetail(model) : openPreview(model)}
                  className={`px-4 py-4 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-emerald-50/40'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold text-sm leading-snug mb-1 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{model.process_title}</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {model.process_key && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>No: {model.process_key}</span>
                        )}
                        {model.jenis_proses && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-violet-300 bg-violet-900/30 border-violet-700' : 'text-violet-700 bg-violet-50 border-violet-200'}`}>{model.jenis_proses}</span>
                        )}
                        {model.klasifikasi_proses && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-teal-300 bg-teal-900/30 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-200'}`}>{model.klasifikasi_proses}</span>
                        )}
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{getDisplayUnitL1(model)}{getDisplayUnitL2(model) ? ` › ${getDisplayUnitL2(model)}` : ''}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${statusBadgeClass(model.status)}`}>
                      {model.status === 'terbit' && <Stamp className="w-3 h-3" />}
                      {model.status === 'penetapan' && <Landmark className="w-3 h-3" />}
                      {model.status === 'verifikasi' && <ClipboardCheck className="w-3 h-3" />}
                      {model.status === 'approved' && <FileSignature className="w-3 h-3" />}
                      {model.status === 'pending' && <Clock className="w-3 h-3" />}
                      {model.status === 'rejected' && <XCircle className="w-3 h-3" />}
                      {(!model.status || model.status === 'draft') && <FileEdit className="w-3 h-3" />}
                      {statusLabel(model.status, model.is_manual)}
                    </span>
                  </div>
                  {model.status === 'approved' && !model.is_manual && (
                    <p className={`mt-2 text-[10px] leading-snug font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>SOP yang sudah disahkan/disetujui/ditandatangani, selanjutnya cover dapat di-scan &amp; diunggah pada sistem ini.</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[11px] flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Calendar className="w-3 h-3" />
                      {new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {model.status === 'usulan' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); handleLanjutPenyusunan(model); }} className="px-2.5 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-lg flex items-center gap-1"><ChevronRight className="w-3.5 h-3.5" /> Lanjut</button>
                          {(currentUser.role === 'admin' || model.created_by === currentUser.id) && (
                            <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-2.5 rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Hapus"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </>
                      )}
                      {model.status !== 'usulan' && (<>
                      <button onClick={(e) => { e.stopPropagation(); if (model.is_manual) { setManualDetail(model); } else { window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; } }} className="px-2.5 py-2.5 text-emerald-600 bg-emerald-50 font-bold text-xs rounded-lg flex items-center gap-1">{model.is_manual ? <><FileText className="w-3 h-3" /> Lihat</> : <><Edit className="w-3 h-3" /> {model.status === 'approved' || model.status === 'rejected' ? 'Buka/Edit' : 'Buka'}</>}</button>
                      {model.is_manual && currentUser.role === 'admin' && model.status === 'pending' && (<>
                        <button onClick={(e) => { e.stopPropagation(); manualApproveSop(model); }} className="px-2.5 py-2.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Setujui"><CheckCircle className="w-3.5 h-3.5" /> Setujui</button>
                        <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-2.5 py-2.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Tolak"><XCircle className="w-3.5 h-3.5" /> Tolak</button>
                      </>)}
                      {model.is_manual && currentUser.role !== 'viewer' && model.status === 'penetapan' && (
                        <button onClick={(e) => { e.stopPropagation(); setManualDetail(model); }} className="px-2.5 py-2.5 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Unggah PDF TTD"><Upload className="w-3.5 h-3.5" /> PDF TTD</button>
                      )}
                      {model.is_manual && currentUser.role === 'admin' && model.status === 'verifikasi' && (
                        <button onClick={(e) => { e.stopPropagation(); manualTetapkanSop(model); }} className="px-2.5 py-2.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Tetapkan"><Stamp className="w-3.5 h-3.5" /> Tetapkan</button>
                      )}
                      {model.status === 'pending' && !model.is_manual && currentUser.role === 'admin' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); handleApprove(model); }} className="px-2.5 py-2.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Setujui"><CheckCircle className="w-3.5 h-3.5" /> Setujui</button>
                          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-2.5 py-2.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Tolak"><XCircle className="w-3.5 h-3.5" /> Tolak</button>
                        </>
                      )}
                      {model.status === 'approved' && !model.is_manual && canUploadCover(model) && (
                        <button onClick={(e) => { e.stopPropagation(); setCoverModal({ isOpen: true, model }); setCoverData(null); }} className="px-2.5 py-2.5 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Unggah Cover TTD"><Upload className="w-3.5 h-3.5" /> Cover</button>
                      )}
                      {model.status === 'verifikasi' && !model.is_manual && currentUser.role === 'admin' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-2.5 py-2.5 text-indigo-600 border border-indigo-200 font-bold text-xs rounded-lg flex items-center gap-1" title="Periksa Cover"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleSetujuiCover(model); }} className="px-2.5 py-2.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Setujui Cover"><ClipboardCheck className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'cover' }); }} className="px-2.5 py-2.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Kembalikan"><XCircle className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                      {model.status === 'penetapan' && !model.is_manual && currentUser.role === 'admin' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-2.5 py-2.5 text-indigo-600 border border-indigo-200 font-bold text-xs rounded-lg flex items-center gap-1" title="Periksa Cover"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDitetapkan(model); }} className="px-2.5 py-2.5 bg-violet-100 text-violet-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Ditetapkan"><Landmark className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                      {model.status === 'penetapan' && !model.is_manual && currentUser.role !== 'admin' && (
                        <span className="px-2.5 py-2 text-[10px] font-bold text-violet-700 bg-violet-50 rounded-lg border border-violet-200 self-center">Penetapan menteri</span>
                      )}
                      {model.status === 'verifikasi' && !model.is_manual && currentUser.role !== 'admin' && (
                        <span className="px-2.5 py-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-200 self-center">Verifikasi admin</span>
                      )}
                      {model.status === 'terbit' && currentUser.role === 'admin' && (
                        <button onClick={(e) => { e.stopPropagation(); batalkanPenetapan(model); }} className="px-2.5 py-2.5 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Batalkan Penetapan"><XCircle className="w-3.5 h-3.5" /> Batalkan</button>
                      )}
                      {currentUser.role !== 'viewer' && !model.is_manual && (
                        <button onClick={(e) => { e.stopPropagation(); openCopyModal(model); }} className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:text-amber-600 hover:bg-amber-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Salin"><Copy className="w-3.5 h-3.5" /></button>
                      )}
                      <ShareButton kind="sop" modelId={model.id} token={token} isDarkMode={isDarkMode} />
                      {canRespond(model) && (
                        <button onClick={(e) => { e.stopPropagation(); setTanggapanModal({ isOpen: true, model, pesan: '' }); }} className="px-2.5 py-2.5 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Tanggapi"><MessageSquare className="w-3.5 h-3.5" /> Tanggapi</button>
                      )}
                      {currentUser.role === 'admin' && model.status === 'rejected' && (
                        <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'edit' }); }} className="px-2.5 py-2.5 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Edit Revisi"><Edit className="w-3.5 h-3.5" /> Edit Revisi</button>
                      )}
                      {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                        <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                      </>)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {visibleModels.length > 0 && (
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3 sm:p-4 border-t ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/40' : 'border-slate-100 bg-slate-50/50'}`}>
              <div className={`flex items-center gap-2 text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>Tampilkan</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className={`px-2 py-1.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>baris · {visibleModels.length} total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className={`px-3 py-1.5 text-xs font-bold rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}>Sebelumnya</button>
                <span className={`px-2 text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Hal {currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className={`px-3 py-1.5 text-xs font-bold rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}>Berikutnya</button>
              </div>
            </div>
          )}
          </>)}
        </div>
        )}
      </div>

      {/* MODAL UNGGAH COVER BERTANDA TANGAN */}
      {coverModal.isOpen && coverModal.model && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { if (!uploadingCover) { setCoverModal({ isOpen: false, model: null }); setCoverData(null); } }}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-start gap-3 p-5 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 grid place-items-center shrink-0"><FileSignature className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Unggah Cover Bertanda Tangan</h3>
                <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{coverModal.model.process_title}</p>
              </div>
              <button onClick={() => { if (!uploadingCover) { setCoverModal({ isOpen: false, model: null }); setCoverData(null); } }} className={`${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>SOP yang sudah disahkan/disetujui/ditandatangani pimpinan, cover-nya di-scan lalu diunggah di sini. Setelah diunggah, status SOP menjadi <b className="text-emerald-600">TERBIT</b> dan konten SOP dikunci dari perubahan.</p>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${isDarkMode ? 'border-slate-600 hover:border-amber-500 bg-[#0F172A]' : 'border-slate-300 hover:border-amber-400 bg-slate-50'}`}>
                <Upload className={`w-7 h-7 ${coverData ? 'text-amber-500' : 'text-slate-400'}`} />
                {coverData ? (
                  <span className="text-sm font-bold text-amber-600 text-center break-all">{coverData.name}<br /><span className="text-xs font-normal text-slate-400">{(coverData.size / 1024 / 1024).toFixed(2)} MB</span></span>
                ) : (
                  <span className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>Pilih file (PDF/JPG/PNG)</span>
                )}
                <span className="text-[11px] text-slate-400">Maksimal 2 MB</span>
                <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => onCoverPick(e.target.files?.[0])} />
              </label>
            </div>
            <div className={`flex justify-end gap-2 p-5 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => { setCoverModal({ isOpen: false, model: null }); setCoverData(null); }} disabled={uploadingCover} className={`px-4 py-2.5 text-sm font-bold rounded-xl border disabled:opacity-50 ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Batal</button>
              <button onClick={submitCover} disabled={!coverData || uploadingCover} className="px-5 py-2.5 text-sm font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2"><Upload className="w-4 h-4" />{uploadingCover ? 'Mengunggah...' : 'Unggah & Terbitkan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PENETAPAN SOP */}
      {penetapanModal.isOpen && penetapanModal.model && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { if (!submittingPenetapan) setPenetapanModal({ isOpen: false, model: null, dasar: '', tanggal: '' }); }}>
          <div className={`w-full max-w-md rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-start gap-3 p-5 border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 grid place-items-center shrink-0"><Landmark className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Tetapkan &amp; Terbitkan SOP</h3>
                <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{penetapanModal.model.process_title}</p>
              </div>
              <button onClick={() => { if (!submittingPenetapan) setPenetapanModal({ isOpen: false, model: null, dasar: '', tanggal: '' }); }} className={`${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Isi dasar penetapan Peraturan dan tanggalnya. Setelah ditetapkan, SOP resmi <b className="text-emerald-600">TERBIT</b> dan masuk Daftar SOP.</p>
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Telah ditetapkan melalui <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={penetapanModal.dasar}
                  onChange={e => setPenetapanModal(prev => ({ ...prev, dasar: e.target.value }))}
                  placeholder="Contoh: Kepmen ATR/BPN Nomor ... Tahun ..."
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-violet-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tanggal ditetapkan <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={penetapanModal.tanggal}
                  onChange={e => setPenetapanModal(prev => ({ ...prev, tanggal: e.target.value }))}
                  className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-violet-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                />
              </div>
            </div>
            <div className={`flex justify-end gap-2 p-5 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setPenetapanModal({ isOpen: false, model: null, dasar: '', tanggal: '' })} disabled={submittingPenetapan} className={`px-4 py-2.5 text-sm font-bold rounded-xl border disabled:opacity-50 ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Batal</button>
              <button onClick={submitPenetapan} disabled={submittingPenetapan} className="px-5 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2"><Landmark className="w-4 h-4" />{submittingPenetapan ? 'Menetapkan...' : 'Tetapkan & Terbitkan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH USULAN SOP */}
      {usulanForm.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => { if (!addingUsulan) setUsulanForm(f => ({ ...f, isOpen: false })); }}>
          <div className={`w-full max-w-lg my-8 sm:my-0 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-5 border-b shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Tambah Usulan SOP</h3>
              <button onClick={() => setUsulanForm(f => ({ ...f, isOpen: false }))} className={`${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul rencana SOP <span className="text-red-500">*</span></label>
                <input type="text" value={usulanForm.title} onChange={e => setUsulanForm(f => ({ ...f, title: e.target.value }))} placeholder="Contoh: SOP Pelayanan Pengukuran Bidang Tanah" className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Unit Kerja L1 <span className="text-red-500">*</span></label>
                  <select value={usulanForm.l1} disabled={currentUser.role === 'user'} onChange={e => setUsulanForm(f => ({ ...f, l1: e.target.value, l2: '' }))} className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="">— Pilih —</option>
                    {l1Options.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Unit Kerja L2</label>
                  <select value={usulanForm.l2} disabled={!usulanForm.l1} onChange={e => setUsulanForm(f => ({ ...f, l2: e.target.value }))} className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="">— Tidak Ada / Kosong —</option>
                    {(usulanForm.l1 && HIERARKI_UNIT[usulanForm.l1] ? Object.keys(HIERARKI_UNIT[usulanForm.l1]) : []).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Kewenangan</label>
                  <select value={usulanForm.jenis} onChange={e => setUsulanForm(f => ({ ...f, jenis: e.target.value }))} className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="">— Pilih —</option>
                    {JENIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi</label>
                  <select value={usulanForm.klasifikasi} onChange={e => setUsulanForm(f => ({ ...f, klasifikasi: e.target.value }))} className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="">— Pilih —</option>
                    {KLASIFIKASI_OPTIONS_SOP.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className={`flex justify-end gap-2 p-5 border-t shrink-0 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <button onClick={() => setUsulanForm(f => ({ ...f, isOpen: false }))} disabled={addingUsulan} className={`px-4 py-2.5 text-sm font-bold rounded-xl border disabled:opacity-50 ${isDarkMode ? 'border-slate-600 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Batal</button>
              <button onClick={submitUsulan} disabled={addingUsulan || !usulanForm.title.trim() || !usulanForm.l1} className="px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl flex items-center gap-2"><Plus className="w-4 h-4" />{addingUsulan ? 'Menyimpan...' : 'Simpan Usulan'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
