"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Edit, CheckCircle,
  Clock, XCircle, Search, X, FileEdit, FileStack, AlertCircle, Filter,
  Trash2, Calendar, GitCommit, FileSignature, Lock, HelpCircle, ChevronRight,
  Save, ExternalLink, Building2, Copy
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

  const [rejectModal, setRejectModal] = useState({ isOpen: false, modelId: 0, note: '' });
  const [showPanduan, setShowPanduan] = useState(false);

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

  const listUnitL1 = useMemo(() => {
    const units = savedModels.map(m => getDisplayUnitL1(m)).filter(u => u !== '-');
    return ['Semua', ...Array.from(new Set(units))];
  }, [savedModels]);

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
        const docBody = {
          nama: model.process_title, jenis: "SOP",
          tahun: new Date().getFullYear().toString(), l1_id: model.l1_id, l2_id: model.l2_id,
          link: `/e-sop-atrbpn/sop/studio?id=${model.id}&mode=view`, status: 'approved'
        };
        await apiFetch('/dokumen', token, { method: 'POST', body: JSON.stringify(docBody) });
        setSavedModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'approved', catatan: '' } : m));
        alert('SOP disetujui!');
      }
    } catch (err) { console.error(err); }
  };

  const submitReject = async () => {
    if (!rejectModal.note.trim()) return alert('Catatan tidak boleh kosong.');
    try {
      const res = await apiFetch(`/sop/models/status/${rejectModal.modelId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', catatan: rejectModal.note })
      });
      if (res.ok) {
        setSavedModels(prev => prev.map(m => m.id === rejectModal.modelId ? { ...m, status: 'rejected', catatan: rejectModal.note } : m));
        setRejectModal({ isOpen: false, modelId: 0, note: '' });
      }
    } catch (e) { console.error(e); }
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
    if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'pending') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
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
                  <p className={`text-[11px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Simbol bagan alir &amp; kolom tabel mutu baku</p>
                </div>
              </div>
              <button onClick={() => setShowPanduan(false)} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
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
              <button onClick={() => setShowConfigModal(false)} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}><X size={20} /></button>
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
              <h3 className="font-bold text-red-600 flex items-center gap-2"><XCircle className="w-5 h-5" /> Revisi Dokumen</h3>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '' })} className={`${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <textarea rows={6} placeholder="Tuliskan poin revisi..." value={rejectModal.note} onChange={(e) => setRejectModal({...rejectModal, note: e.target.value})} className={`w-full border rounded-xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500 shadow-inner ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-400 text-slate-900'}`} />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '' })} className={`px-5 py-2.5 text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Batal</button>
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
                <button onClick={() => setCopyModal({ isOpen: false, source: null, form: { process_title: '', jenis_proses: '', klasifikasi_proses: '' } })} className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
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
              <button onClick={() => setPreviewModel(null)} className={`p-2 rounded-xl transition-colors shrink-0 ml-2 ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body scroll */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
              {/* Status + Unit */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${statusBadgeClass(previewModel.status)}`}>
                  {previewModel.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                  {previewModel.status === 'pending' && <Clock className="w-3 h-3" />}
                  {previewModel.status === 'rejected' && <XCircle className="w-3 h-3" />}
                  {(!previewModel.status || previewModel.status === 'draft') && <FileEdit className="w-3 h-3" />}
                  {previewModel.status || 'DRAFT'}
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

              {/* Edit fields */}
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul / Nama SOP <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={editMeta.process_title}
                    onChange={e => setEditMeta(prev => ({ ...prev, process_title: e.target.value }))}
                    className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Kewenangan</label>
                    <select
                      value={editMeta.jenis_proses}
                      onChange={e => setEditMeta(prev => ({ ...prev, jenis_proses: e.target.value }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {JENIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Klasifikasi</label>
                    <select
                      value={editMeta.klasifikasi_proses}
                      onChange={e => setEditMeta(prev => ({ ...prev, klasifikasi_proses: e.target.value }))}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">— Pilih —</option>
                      {KLASIFIKASI_OPTIONS_SOP.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>

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
                <button
                  onClick={saveMetaEdit}
                  disabled={savingMeta}
                  className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  {savingMeta ? 'Menyimpan...' : 'Simpan'}
                </button>
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
            <button onClick={() => setShowPanduan(true)} className={`px-4 py-2.5 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
              <HelpCircle className="w-4 h-4" /> Panduan
            </button>
            <button onClick={handleOpenNewSOP} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all">
              <Plus size={18} /> Buat SOP Baru
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Total</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{currentFilteredModels.length}</p></div>
            <div className={`p-2.5 sm:p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileStack className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Draft</p><p className={`text-2xl sm:text-3xl font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</p></div>
            <div className={`p-2.5 sm:p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileEdit className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Menunggu</p><p className="text-2xl sm:text-3xl font-black text-blue-600">{currentFilteredModels.filter(m => m.status === 'pending').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-blue-50 rounded-xl text-blue-400"><Clock className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Disetujui</p><p className="text-2xl sm:text-3xl font-black text-emerald-600">{currentFilteredModels.filter(m => m.status === 'approved').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-xl text-emerald-400"><CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm border-l-4 border-l-red-500 flex justify-between items-center transition-all hover:shadow-md col-span-2 sm:col-span-1 ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Perlu Revisi</p><p className="text-2xl sm:text-3xl font-black text-red-600">{currentFilteredModels.filter(m => m.status === 'rejected').length}</p></div>
            <div className="p-2.5 sm:p-3 bg-red-50 rounded-xl text-red-400"><AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" /></div>
          </div>
        </div>

        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`p-4 sm:p-5 border-b flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <h2 className={`text-lg font-bold shrink-0 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Daftar Pengajuan SOP</h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Klik baris untuk melihat detail &amp; mengedit metadata</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full xl:w-auto xl:justify-end">
              {currentUser.role === 'admin' && (
                <div className="relative w-full sm:w-56 xl:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                  <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className={`w-full pl-10 pr-4 py-2 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="Semua">Unit Kerja: Semua</option>
                    {listUnitL1.filter(u => u !== 'Semua').map(unit => (<option key={unit as string} value={unit as string}>{unit as string}</option>))}
                  </select>
                </div>
              )}
              <div className="relative w-full sm:w-40">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                  <option value="Semua">Status: Semua</option>
                  <option value="draft">Status: Draft</option>
                  <option value="pending">Status: Pending</option>
                  <option value="approved">Status: Approved</option>
                  <option value="rejected">Status: Rejected</option>
                </select>
              </div>
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                <input type="text" placeholder="Cari judul atau nomor SOP..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
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
                  <th className="px-6 py-4 text-center w-48">Aksi / Tindakan</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {loading ? (
                  <tr><td colSpan={4} className={`px-6 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Memuat data...</td></tr>
                ) : currentFilteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <Search className={`w-12 h-12 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                        <p className={`font-medium text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada SOP yang ditemukan.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentFilteredModels.map((model) => (
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
                          {model.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                          {model.status === 'pending' && <Clock className="w-3 h-3" />}
                          {model.status === 'rejected' && <XCircle className="w-3 h-3" />}
                          {(!model.status || model.status === 'draft') && <FileEdit className="w-3 h-3" />}
                          {model.status || 'DRAFT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; }}
                            className="px-3 py-2 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-emerald-200"
                          >
                            <Edit className="w-4 h-4" /> Buka
                          </button>

                          {currentUser.role !== 'viewer' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openCopyModal(model); }}
                              className={`p-2 rounded-lg transition-colors hover:text-amber-600 hover:bg-amber-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
                              title="Salin Dokumen"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          )}

                          {currentUser.role === 'admin' && model.status !== 'approved' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(model); }} className="px-3 py-2 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '' }); }} className="px-3 py-2 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}
                          {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }}
                              className={`p-2 rounded-lg transition-colors hover:text-red-600 hover:bg-red-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
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
            ) : currentFilteredModels.length === 0 ? (
              <div className="px-4 py-12 text-center flex flex-col items-center">
                <Search className={`w-10 h-10 mb-3 ${isDarkMode ? 'text-slate-700' : 'text-slate-200'}`} />
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tidak ada SOP ditemukan.</p>
              </div>
            ) : (
              currentFilteredModels.map((model) => (
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
                      {model.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                      {model.status === 'pending' && <Clock className="w-3 h-3" />}
                      {model.status === 'rejected' && <XCircle className="w-3 h-3" />}
                      {(!model.status || model.status === 'draft') && <FileEdit className="w-3 h-3" />}
                      {model.status || 'DRAFT'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className={`text-[11px] flex items-center gap-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Calendar className="w-3 h-3" />
                      {new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={(e) => { e.stopPropagation(); window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`; }} className="px-2.5 py-1.5 text-emerald-600 bg-emerald-50 font-bold text-[11px] rounded-lg flex items-center gap-1"><Edit className="w-3 h-3" /> Buka</button>
                      {currentUser.role !== 'viewer' && (
                        <button onClick={(e) => { e.stopPropagation(); openCopyModal(model); }} className={`p-1.5 rounded-lg hover:text-amber-600 hover:bg-amber-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Salin"><Copy className="w-3.5 h-3.5" /></button>
                      )}
                      {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                        <button onClick={(e) => { e.stopPropagation(); deleteModel(model.id); }} className={`p-1.5 rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
