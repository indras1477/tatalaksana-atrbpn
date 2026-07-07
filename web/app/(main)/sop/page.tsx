"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Edit, CheckCircle,
  Clock, XCircle, Search, X, FileEdit, FileStack, AlertCircle, Filter,
  Trash2, Calendar, GitCommit, FileSignature, Lock, HelpCircle, ChevronRight,
  Save, ExternalLink, Building2, Copy, Upload, Stamp, Eye, ClipboardCheck, Landmark
} from 'lucide-react';
import { SOPSymbolsSection } from '@/components/PanduanSymbols';
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
  status: string; catatan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
  jenis_proses?: string | null; klasifikasi_proses?: string | null;
  has_cover?: boolean;
  penetapan_dasar?: string | null; penetapan_tanggal?: string | null;
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
  const [rejectModal, setRejectModal] = useState<{ isOpen: boolean; modelId: number; note: string; mode: 'reject' | 'cover' }>({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
  const [showPanduan, setShowPanduan] = useState(false);

  // Tab daftar: 'pengajuan' (draft/pending/rejected/approved-menunggu cover) vs 'terbit' (Daftar SOP)
  const [listTab, setListTab] = useState<'pengajuan' | 'terbit'>('pengajuan');
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
        setCurrentUser(JSON.parse(userStr));
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

    window.location.href = `/e-sop-atrbpn/sop/studio?${new URLSearchParams(params).toString()}`;
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
  const visibleModels = useMemo(
    () => currentFilteredModels.filter(m => (m.status === 'terbit') === (listTab === 'terbit')),
    [currentFilteredModels, listTab]
  );
  const countPengajuan = useMemo(() => currentFilteredModels.filter(m => m.status !== 'terbit').length, [currentFilteredModels]);
  const countTerbit = useMemo(() => currentFilteredModels.filter(m => m.status === 'terbit').length, [currentFilteredModels]);

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
    // mode 'cover': kembalikan ke penyusun untuk unggah ulang cover (status → approved)
    const newStatus = rejectModal.mode === 'cover' ? 'approved' : 'rejected';
    try {
      const res = await apiFetch(`/sop/models/status/${rejectModal.modelId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, catatan: rejectModal.note })
      });
      if (res.ok) {
        setSavedModels(prev => prev.map(m => m.id === rejectModal.modelId ? { ...m, status: newStatus, catatan: rejectModal.note } : m));
        setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' });
      }
    } catch (e) { console.error(e); }
  };

  // Penyusun/unit boleh unggah cover bila SOP di unit kerjanya (atau admin/pemilik).
  const canUploadCover = (m: SOPModel) =>
    currentUser?.role === 'admin' ||
    m.created_by === currentUser?.id ||
    (currentUser?.role !== 'viewer' && !!currentUser?.unit_l1 &&
      getDisplayUnitL1(m).toLowerCase() === (currentUser?.unit_l1 || '').toLowerCase());

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
  const statusLabel = (status?: string) => {
    if (status === 'terbit') return 'TERBIT';
    if (status === 'penetapan') return 'MENUNGGU PROSES PENETAPAN MENTERI';
    if (status === 'verifikasi') return 'MENUNGGU VERIFIKASI ADMIN';
    if (status === 'approved') return 'MENUNGGU PENGESAHAN PIMPINAN';
    if (status === 'pending') return 'MENUNGGU';
    if (status === 'rejected') return 'PERLU REVISI';
    return 'DRAFT';
  };

  if (!currentUser) return null;

  return (
    <>

      {/* MODAL PANDUAN SOP */}
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
              <h3 className="font-bold text-red-600 flex items-center gap-2"><XCircle className="w-5 h-5" /> {rejectModal.mode === 'cover' ? 'Kembalikan untuk Perbaikan Cover' : 'Revisi Dokumen'}</h3>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })} className={`p-2.5 rounded-lg min-w-11 min-h-11 flex items-center justify-center transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {rejectModal.mode === 'cover' && (
                <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tulis apa yang perlu diperbaiki pada cover (mis. tanda tangan kurang jelas, nomor SOP belum diisi). SOP dikembalikan ke penyusun untuk mengunggah ulang cover.</p>
              )}
              <textarea rows={6} placeholder={rejectModal.mode === 'cover' ? 'Contoh: Nomor SOP belum diisi pada cover; mohon lengkapi lalu scan & unggah ulang.' : 'Tuliskan poin revisi...'} value={rejectModal.note} onChange={(e) => setRejectModal({...rejectModal, note: e.target.value})} className={`w-full border rounded-xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500 shadow-inner ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-400 text-slate-900'}`} />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '', mode: 'reject' })} className={`px-5 py-2.5 text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Batal</button>
                <button onClick={submitReject} className="px-6 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl shadow-md">Kirim Catatan</button>
              </div>
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
            <button onClick={handleOpenNewSOP} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all">
              <Plus size={18} /> Buat SOP Baru
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Total</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{currentFilteredModels.length}</p></div>
            <div className={`p-2.5 sm:p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileStack className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Draft</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</p></div>
            <div className={`p-2.5 sm:p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileEdit className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Menunggu</p><p className="text-2xl sm:text-3xl font-black text-blue-600">{currentFilteredModels.filter(m => m.status === 'pending').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-blue-50 rounded-xl text-blue-400"><Clock className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Disetujui</p><p className="text-2xl sm:text-3xl font-black text-emerald-600">{currentFilteredModels.filter(m => m.status === 'approved').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-xl text-emerald-400"><CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-red-500 flex justify-between items-center transition-all hover:shadow-md col-span-2 sm:col-span-1 ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1">Perlu Revisi</p><p className="text-2xl sm:text-3xl font-black text-red-600">{currentFilteredModels.filter(m => m.status === 'rejected').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-red-50 rounded-xl text-red-400"><AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
        </div>

        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`p-4 sm:p-5 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <div className={`inline-flex p-1 rounded-xl gap-1 ${isDarkMode ? 'bg-[#0F172A] border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
                <button
                  onClick={() => setListTab('pengajuan')}
                  className={`px-3.5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${listTab === 'pengajuan' ? (isDarkMode ? 'bg-[#151F32] text-white shadow' : 'bg-white text-[#002855] shadow-sm') : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                >
                  <FileSignature className="w-4 h-4" /> Daftar Pengajuan
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${listTab === 'pengajuan' ? 'bg-emerald-100 text-emerald-700' : (isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600')}`}>{countPengajuan}</span>
                </button>
                <button
                  onClick={() => setListTab('terbit')}
                  className={`px-3.5 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${listTab === 'terbit' ? (isDarkMode ? 'bg-[#151F32] text-white shadow' : 'bg-white text-[#002855] shadow-sm') : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
                >
                  <Stamp className="w-4 h-4" /> Daftar SOP <span className="hidden sm:inline">(Terbit)</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${listTab === 'terbit' ? 'bg-emerald-100 text-emerald-700' : (isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600')}`}>{countTerbit}</span>
                </button>
              </div>
              <p className={`text-xs mt-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {listTab === 'pengajuan'
                  ? 'Draf, menunggu, perlu revisi, & sudah disetujui (menunggu pengesahan pimpinan).'
                  : 'SOP yang sudah disahkan — cover bertanda tangan telah diunggah.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto lg:justify-end">
              {currentUser.role === 'admin' && (
                <div className="relative w-full sm:w-56 xl:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                  <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="Semua">Unit Kerja: Semua</option>
                    {listUnitL1.filter(u => u !== 'Semua').map(unit => (<option key={unit as string} value={unit as string}>{unit as string}</option>))}
                  </select>
                </div>
              )}
              <div className="relative w-full sm:w-40">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                  <option value="Semua">Status: Semua</option>
                  <option value="draft">Status: Draft</option>
                  <option value="pending">Status: Menunggu</option>
                  <option value="rejected">Status: Perlu Revisi</option>
                  <option value="approved">Status: Menunggu Pengesahan</option>
                  <option value="verifikasi">Status: Menunggu Verifikasi</option>
                  <option value="penetapan">Status: Menunggu Penetapan</option>
                  <option value="terbit">Status: Terbit</option>
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                <input type="text" placeholder="Cari judul atau nomor SOP..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
              </div>
            </div>
          </div>

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
                ) : visibleModels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <Search className={`w-12 h-12 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                        <p className={`font-medium text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'terbit' ? 'Belum ada SOP yang terbit.' : 'Tidak ada pengajuan SOP.'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleModels.map((model) => (
                    <tr
                      key={model.id}
                      onClick={() => openPreview(model)}
                      className={`transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-emerald-50/40'}`}
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}&mode=view`; }}
                          className={`font-bold text-base text-left hover:underline ${isDarkMode ? 'text-white hover:text-emerald-400' : 'text-[#002855] hover:text-emerald-600'}`}
                        >
                          {model.process_title}
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
                          {statusLabel(model.status)}
                        </span>
                        {model.status === 'approved' && (
                          <p className={`mt-1.5 text-[10px] leading-snug max-w-60 font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>SOP yang sudah disahkan/disetujui/ditandatangani, selanjutnya cover dapat di-scan &amp; diunggah pada sistem ini.</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; }}
                            className="px-3 py-2.5 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-emerald-200"
                          >
                            <Edit className="w-4 h-4" /> {model.status === 'approved' || model.status === 'rejected' ? 'Buka/Edit' : 'Buka'}
                          </button>

                          {currentUser.role !== 'viewer' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openCopyModal(model); }}
                              className={`p-2.5 rounded-lg transition-colors hover:text-amber-600 hover:bg-amber-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                              title="Salin Dokumen"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {currentUser.role === 'admin' && model.status !== 'approved' && model.status !== 'terbit' && model.status !== 'verifikasi' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'reject' }); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}
                          {model.status === 'approved' && canUploadCover(model) && (
                            <button onClick={(e) => { e.stopPropagation(); setCoverModal({ isOpen: true, model }); setCoverData(null); }} className="ml-2 px-3 py-2.5 bg-amber-100 hover:bg-amber-500 hover:text-white text-amber-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Upload className="w-4 h-4" /> Unggah Cover TTD</button>
                          )}
                          {model.status === 'verifikasi' && currentUser.role === 'admin' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1.5"><Eye className="w-4 h-4" /> Periksa Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); handleSetujuiCover(model); }} className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'cover' }); }} className="px-3 py-2.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm">Kembalikan</button>
                            </div>
                          )}
                          {model.status === 'verifikasi' && currentUser.role !== 'admin' && (
                            <span className="ml-2 px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-200">Menunggu verifikasi admin</span>
                          )}
                          {model.status === 'penetapan' && currentUser.role === 'admin' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-3 py-2.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-200 text-xs font-extrabold rounded-lg uppercase transition-all flex items-center gap-1.5"><Eye className="w-4 h-4" /> Cover</button>
                              <button onClick={(e) => { e.stopPropagation(); handleDitetapkan(model); }} className="px-3 py-2.5 bg-violet-100 hover:bg-violet-600 hover:text-white text-violet-700 text-xs font-extrabold rounded-lg uppercase transition-all shadow-sm flex items-center gap-1.5"><Landmark className="w-4 h-4" /> Ditetapkan</button>
                            </div>
                          )}
                          {model.status === 'penetapan' && currentUser.role !== 'admin' && (
                            <span className="ml-2 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 rounded-lg border border-violet-200">Menunggu penetapan menteri</span>
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
            ) : visibleModels.length === 0 ? (
              <div className="px-4 py-12 text-center flex flex-col items-center">
                <Search className={`w-10 h-10 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'terbit' ? 'Belum ada SOP yang terbit.' : 'Tidak ada pengajuan SOP.'}</p>
              </div>
            ) : (
              visibleModels.map((model) => (
                <div
                  key={model.id}
                  onClick={() => openPreview(model)}
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
                      {statusLabel(model.status)}
                    </span>
                  </div>
                  {model.status === 'approved' && (
                    <p className={`mt-2 text-[10px] leading-snug font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>SOP yang sudah disahkan/disetujui/ditandatangani, selanjutnya cover dapat di-scan &amp; diunggah pada sistem ini.</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[11px] flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Calendar className="w-3 h-3" />
                      {new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; }} className="px-2.5 py-2.5 text-emerald-600 bg-emerald-50 font-bold text-xs rounded-lg flex items-center gap-1"><Edit className="w-3 h-3" /> {model.status === 'approved' || model.status === 'rejected' ? 'Buka/Edit' : 'Buka'}</button>
                      {model.status === 'approved' && canUploadCover(model) && (
                        <button onClick={(e) => { e.stopPropagation(); setCoverModal({ isOpen: true, model }); setCoverData(null); }} className="px-2.5 py-2.5 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Unggah Cover TTD"><Upload className="w-3.5 h-3.5" /> Cover</button>
                      )}
                      {model.status === 'verifikasi' && currentUser.role === 'admin' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-2.5 py-2.5 text-indigo-600 border border-indigo-200 font-bold text-xs rounded-lg flex items-center gap-1" title="Periksa Cover"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleSetujuiCover(model); }} className="px-2.5 py-2.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Setujui Cover"><ClipboardCheck className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '', mode: 'cover' }); }} className="px-2.5 py-2.5 bg-red-100 text-red-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Kembalikan"><XCircle className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                      {model.status === 'penetapan' && currentUser.role === 'admin' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); viewCover(model); }} className="px-2.5 py-2.5 text-indigo-600 border border-indigo-200 font-bold text-xs rounded-lg flex items-center gap-1" title="Periksa Cover"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDitetapkan(model); }} className="px-2.5 py-2.5 bg-violet-100 text-violet-700 font-bold text-xs rounded-lg flex items-center gap-1" title="Ditetapkan"><Landmark className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                      {model.status === 'penetapan' && currentUser.role !== 'admin' && (
                        <span className="px-2.5 py-2 text-[10px] font-bold text-violet-700 bg-violet-50 rounded-lg border border-violet-200 self-center">Penetapan menteri</span>
                      )}
                      {model.status === 'verifikasi' && currentUser.role !== 'admin' && (
                        <span className="px-2.5 py-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-lg border border-indigo-200 self-center">Verifikasi admin</span>
                      )}
                      {currentUser.role !== 'viewer' && (
                        <button onClick={(e) => { e.stopPropagation(); openCopyModal(model); }} className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:text-amber-600 hover:bg-amber-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Salin"><Copy className="w-3.5 h-3.5" /></button>
                      )}
                      {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                        <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
    </>
  );
}
