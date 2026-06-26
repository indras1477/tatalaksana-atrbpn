"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Edit, CheckCircle,
  Clock, XCircle, Search, X, FileEdit, FileStack, AlertCircle, Filter,
  Trash2, Calendar, GitCommit, FileSignature
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

const HIERARKI_UNIT: Record<string, Record<string, string[]>> = {
  "SEKRETARIAT JENDERAL": {
    "Biro Perencanaan dan Kerja Sama": ["Bagian Perencanaan Program", "Bagian Penganggaran", "Bagian Pemantauan, Evaluasi, dan Pelaporan Kinerja", "Bagian Kerja Sama dan Tata Usaha"],
    "Biro Sumber Daya Manusia": ["Bagian Pengadaan dan Kesejahteraan", "Bagian Kinerja dan Manajemen Talenta", "Bagian Mutasi"],
    "Biro Organisasi, Tata Laksana, dan Manajemen Risiko": ["Bagian Organisasi", "Bagian Tata Laksana dan Reformasi Birokrasi", "Bagian Analisis Jabatan", "Bagian Manajemen Risiko"],
    "Biro Keuangan dan Barang Milik Negara": ["Bagian Penerimaan Negara Bukan Pajak", "Bagian Perbendaharaan", "Bagian Akuntansi dan Pelaporan", "Bagian Administrasi Pengelolaan BMN"],
    "Biro Hukum": ["Bagian Perundang-undangan I", "Bagian Perundang-undangan II", "Bagian Advokasi dan Dokumentasi Hukum"],
    "Biro Hubungan Masyarakat dan Protokol": ["Bagian Pemberitaan, Media, dan Hubungan Antar Lembaga", "Bagian Informasi Publik dan Pengaduan Masyarakat", "Bagian Tata Usaha Pimpinan dan Protokol"],
    "Biro Umum dan Layanan Pengadaan": ["Bagian Tata Naskah, Kearsipan, dan Tata Usaha", "Bagian Rumah Tangga dan Perlengkapan", "Bagian Layanan Pengadaan Barang/Jasa"],
    "Pusat Data dan Informasi Pertanahan dan Tata Ruang": ["Bidang Tata Kelola dan Infrastruktur TI", "Bidang Inovasi dan Pengembangan Sistem Informasi", "Bidang Pengelolaan Data dan Penyajian Informasi"]
  },
  "DIREKTORAT JENDERAL TATA RUANG": {
    "Sekretariat Direktorat Jenderal Tata Ruang": ["Bagian Program, Keuangan, dan Umum", "Bagian Hukum dan Kepegawaian", "Bagian Manajemen Risiko"],
    "Direktorat Perencanaan Tata Ruang": ["Subdirektorat Perencanaan Tata Ruang Nasional", "Subdirektorat Pedoman Tata Ruang", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional I", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional II", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional III"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah I": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.C", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.D", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.E"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah II": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.C", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.D", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.E"],
    "Direktorat Sinkronisasi Pemanfaatan Ruang": ["Subdirektorat Sinkronisasi Pemanfaatan Ruang Wilayah A", "Subdirektorat Sinkronisasi Pemanfaatan Ruang Wilayah B", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang C", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang D", "Subdirektorat Wilayah Sinkronisasi Pemanfaatan Ruang E"]
  },
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": {
    "Sekretariat Direktorat Jenderal Survei dan Pemetaan": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengukuran dan Pemetaan Kadastral": ["Subdirektorat Pengukuran dan Pemetaan Bidang", "Subdirektorat Pengukuran dan Pemetaan Ruang", "Subdirektorat Penanganan Masalah dan Peningkatan Kualitas Kadastral"],
    "Direktorat Pengukuran dan Pemetaan Dasar": ["Subdirektorat Pemetaan dan Pengelolaan Data Dasar", "Subdirektorat Pengukuran Dasar dan Peralatan", "Subdirektorat Pemetaan dan Pengelolaan Model Dasar dan Ruang"],
    "Direktorat Survei dan Pemetaan Tematik": ["Subdirektorat Tematik Pertanahan dan Ruang", "Subdirektorat Tematik Kawasan", "Subdirektorat Layanan Informasi Geospasial Tematik Multiguna"]
  },
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": {
    "Sekretariat Direktorat Jenderal PENETAPAN HAK DAN PENDAFTARAN TANAH": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengaturan dan Penetapan Hak Atas Tanah": ["Subdirektorat Penetapan Hak Guna Usaha", "Subdirektorat Penetapan Hak Guna Bangunan", "Subdirektorat Penetapan Hak Pakai, Ruang Atas Tanah, dan Ruang Bawah Tanah"],
    "Direktorat Pengaturan Pendaftaran Tanah dan Ruang, Pejabat Pembuat Akta Tanah, dan Mitra Kerja": ["Subdirektorat Pengaturan Pendaftaran Tanah dan Ruang", "Subdirektorat Pengembangan Pemeliharaan Hak atas Tanah dan Ruang", "Subdirektorat Pengelolaan Pejabat Pembuah Akta Tanah dan Mitra Kerja"],
    "Direktorat Hubungan Kelembagaan": ["Subdirektorat Hubungan Kelembagaan", "Subdirektorat Pengembangan Layanan Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENATAAN AGRARIA": {
    "Sekretariat Direktorat Jenderal Penataan Agraria": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Landreform": ["Subdirektorat Pengelolaan Penguasaan Tanah, Pemilikan, Penggunaan dan Pemanfataan Tanah", "Subdirektorat Penetapan Potensi Redistribusi", "Subdirektorat Pengaturan Redistribusi Tanah"],
    "Direktorat Pemberdayaan Tanah Masyarakat": ["Subdirektorat Pengembangan Model Akses Reforma Agraria", "Subdirektorat Fasilitasi dan Kerja Sama Akses Reformasi Agraria", "Subdirektorat Pengaturan dan Pengelolaan Akses Reforma Agraria"],
    "Direktorat Penatagunaan Tanah": ["Subdirektorat Penataan dan Koodinasi Sektoral dan Regional", "Subdirektorat Penataan Wilayah Pesisir Kecil, Perbatasan, dan Wilayah Tertentu", "Subdirektorat Layanan dan Pengembangan Penatagunaan Tanah"]
  },
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": {
    "Sekretariat Direktorat Jenderal Pengadaan Tanah": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Bina Pengadaan and Pencadangan Tanah": ["Subdirektorat Bina Pengadaan Tanah Wilayah I", "Subdirektorat Bina Pengadaan Tanah Wilayah II", "Subdirektorat Pencadangan Tanah dan Kerjasama Pengadaan Lintas Rektor"],
    "Direktorat Konsolidasi Tanah dan Pengembangan": ["Subdirektorat Penyelenggaraan Konsolidasi Tanah Wilayah I", "Subdirektorat Penyelenggaraan Konsolidasi Tanah Wilayah II", "Subdirektorat Pengembangan Pertanahan dan Pemanfaatan Tanah"],
    "Direktorat Penilaian Tanah dan Ekonomi Pertanahan": ["Subdirektorat Penyediaan dan Pemanfaatan Nilai Tanah", "Subdirektorat Penilaian Tanah dan Dampak Sosial", "Subdirektorat Pendayagunaan Ekonomi Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": {
    "Sekretariat Direktorat Jenderal Pengendalian dan Penertiban Tanah dan Ruang": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Pengendalian Pemanfaatan Ruang": ["Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah I", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah II", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah III", "Subdirektorat Pengendalian Pemanfaatan Ruang Wilayah IV", "Subdirektorat Pengawasan Penataan Ruang"],
    "Direktorat Penertiban Pemanfaatan Ruang": ["Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah I", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah II", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah III", "Subdirektorat Penegakan Hukum dan Penyelesaian Sengketa Penataan Ruang Wilayah IV"],
    "Direktorat Pengendalian Hak Tanah, Alih Fungsi Lahan, Kepulauan, dan Wilayah Tertentu": ["Subdirektorat Pengendalian Hak Tanah, Kepulauan, dan Wilayah Tertentu Wilayah I", "Subdirektorat Pengendalian Hak Tanah, Kepulauan, dan Wilayah Tertentu Wilayah II", "Subdirektorat Pengendalian Alih Fungsi Lahan"],
    "Direktorat Penertiban Penguasaan, Pemilikan, dan Penggunaan Tanah": ["Subdirektorat Potensi Penertiban Tanah", "Subdirektorat Penertiban Penguasaan dan Pemilikan Tanah", "Subdirektorat Penertiban Penggunaan dan Pemanfaatan Tanah"]
  },
  "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": {
    "Sekretariat Direktorat Jenderal Penanganan Sengketa": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Penanganan Sengketa Pertanahan": ["Subdirektorat Penanganan Sengketa Penetapan Hak dan Pendaftaran Tanah", "Subdirektorat Penanganan Sengketa Batas Bidang Tanah", "Subdirektorat Penanganan Sengketa Penguasaan dan Pemilikan Tanah"],
    "Direktorat Penanganan Perkara Pertanahan": ["Subdirektorat Penanganan Perkara Wilayah I", "Subdirektorat Penanganan Perkara Wilayah II", "Subdirektorat Penanganan Perkara Wilayah III"],
    "Direktorat Pencegahan dan Penanganan Konflik Pertanahan": ["Subdirektorat Penanganan Konflik Kelompok Masyarakat dan Tanah Ulayat", "Subdirektorat Penanganan Konflik Instansi Pemerintah/Badan Usaha Milik Negara/Badan Usaha Milik Daerah", "Subdirektorat Pencegahan dan Hubungan Kelembagaan"]
  },
  "INSPEKTORAT JENDERAL": {
    "Sekretariat Inspektorat Jenderal": ["Bagian Program, Hukum, dan Tata Kelola", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Inspektur Wilayah I": ["Auditor Wilayah I"],
    "Inspektur Bidang Investigasi": ["Auditor Investigasi"]
  },
  "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA": {
    "Sekretariat Badan Pengembangan SDM": ["Bagian Perencanaan dan Umum"],
    "Pusat Pembinaan Jabatan Fungsional": ["Bidang Jabatan Fungsional"],
    "Pusat Pengembangan Kompetensi SDM": ["Bidang Pengembangan SDM"]
  },
  "SEKOLAH TINGGI PERTANAHAN NASIONAL": {
    "Sekolah Tinggi Pertanahan Nasional": ["Bagian Akademik", "Bagian Administrasi Umum"]
  }
};

const API_BASE = '/e-sop-atrbpn/api';

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
  id: number; process_title: string; process_key: string; l1_id: number | null; l2_id: number | null;
  description: string | null; sop_data: string | null;
  status: string; catatan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
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
    description: ''
  });

  const [rejectModal, setRejectModal] = useState({ isOpen: false, modelId: 0, note: '' });

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

  const handleStartSOP = () => {
    if (!config.processTitle || !config.processKey || !config.orgUnitL1) {
      return alert("Harap lengkapi Judul, Nomor SOP, dan Unit Kerja Utama.");
    }
    if (typeof window !== 'undefined') localStorage.removeItem('e-sop-draft-local');

    const query = new URLSearchParams({
      title: config.processTitle,
      key: config.processKey,
      l1: config.orgUnitL1,
      l2: config.orgUnitL2
    }).toString();

    window.location.href = `/e-sop-atrbpn/sop/studio?${query}`;
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

  if (!currentUser) return null;

  return (
    <>

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white border border-slate-200'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Informasi SOP Baru</h3>
              <button onClick={() => setShowConfigModal(false)} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-400'}`}><X size={20} /></button>
            </div>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Lengkapi data identitas SOP sebelum masuk ke halaman penyusunan tabel Mutu Baku.</p>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Judul SOP <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: Pemberian Hak Guna Bangunan" value={config.processTitle} onChange={(e) => setConfig({ ...config, processTitle: e.target.value })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
              </div>
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nomor SOP <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Contoh: SOP/14/ATRBPN" value={config.processKey} onChange={(e) => setConfig({ ...config, processKey: e.target.value.toUpperCase() })} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`} />
              </div>
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Unit Kerja Utama (Level 1) <span className="text-red-500">*</span></label>
                <select value={config.orgUnitL1} onChange={handleL1Change} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                  <option value="" disabled>-- Pilih Unit Utama --</option>
                  {l1Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-sm font-bold mb-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Unit (Level 2)</label>
                <select value={config.orgUnitL2} onChange={(e) => setConfig({ ...config, orgUnitL2: e.target.value })} disabled={!config.orgUnitL1} className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'}`}>
                  <option value="">-- Tidak Ada / Kosong --</option>
                  {l2Options.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className={`flex justify-end gap-3 mt-8 pt-4 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {currentUser.role === 'admin' ? 'Manajemen Pengajuan (Pusat)' : `${currentUser.unit_l1}${currentUser.unit_l2 ? ' › ' + currentUser.unit_l2 : ''}`}
          </p>
          <button onClick={() => setShowConfigModal(true)} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all self-start sm:self-auto"><Plus size={18} /> Buat SOP Baru</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className={`p-5 rounded-2xl border shadow-sm flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Total SOP Anda</p><p className={`text-3xl font-black ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{currentFilteredModels.length}</p></div>
            <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileStack className="w-6 h-6" /></div>
          </div>
          <div className={`p-5 rounded-2xl border shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Draft Internal</p><p className={`text-3xl font-black ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</p></div>
            <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-50 text-slate-400'}`}><FileEdit className="w-6 h-6" /></div>
          </div>
          <div className={`p-5 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Menunggu</p><p className="text-3xl font-black text-blue-600">{currentFilteredModels.filter(m => m.status === 'pending').length}</p></div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-400"><Clock className="w-6 h-6" /></div>
          </div>
          <div className={`p-5 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Disetujui</p><p className="text-3xl font-black text-emerald-600">{currentFilteredModels.filter(m => m.status === 'approved').length}</p></div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-400"><CheckCircle className="w-6 h-6" /></div>
          </div>
          <div className={`p-5 rounded-2xl border shadow-sm border-l-4 border-l-red-500 flex justify-between items-center transition-all hover:shadow-md ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div><p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Perlu Revisi</p><p className="text-3xl font-black text-red-600">{currentFilteredModels.filter(m => m.status === 'rejected').length}</p></div>
            <div className="p-3 bg-red-50 rounded-xl text-red-400"><AlertCircle className="w-6 h-6" /></div>
          </div>
        </div>

        <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className={`p-5 border-b flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
            <h2 className={`text-lg font-bold shrink-0 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>Daftar Pengajuan SOP</h2>
            <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:justify-end">
              {currentUser.role === 'admin' && (
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                  <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className={`w-full pl-10 pr-4 py-2 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                    <option value="Semua">Unit Kerja: Semua</option>
                    {listUnitL1.filter(u => u !== 'Semua').map(unit => (<option key={unit as string} value={unit as string}>{unit as string}</option>))}
                  </select>
                </div>
              )}
              <div className="relative w-full md:w-48">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`w-full px-4 py-2 border rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                  <option value="Semua">Status: Semua</option>
                  <option value="draft">Status: Draft</option>
                  <option value="pending">Status: Pending</option>
                  <option value="approved">Status: Approved</option>
                  <option value="rejected">Status: Rejected</option>
                </select>
              </div>
              <div className="relative w-full md:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div>
                <input type="text" placeholder="Cari judul atau nomor SOP..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2 border rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-white border-slate-300 text-slate-900'}`} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                    <tr key={model.id} className={`transition-colors group ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'}`}>
                      <td className="px-6 py-4">
                        <button onClick={() => window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}&mode=view`} className={`font-bold text-base text-left hover:underline ${isDarkMode ? 'text-white hover:text-emerald-400' : 'text-[#002855] hover:text-emerald-600'}`}>
                          {model.process_title}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>No: {model.process_key}</span>
                          <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border ${isDarkMode ? 'text-slate-400 bg-slate-800 border-slate-700' : 'text-slate-500 bg-slate-50 border-slate-200'}`}><Calendar className="w-3 h-3" />{new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200" title="Total perubahan yang sudah disimpan"><GitCommit className="w-3 h-3" />Versi {model.version}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className={`font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{getDisplayUnitL1(model)}</p>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{getDisplayUnitL2(model)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${model.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : model.status === 'pending' ? 'bg-blue-50 text-blue-700 border-blue-200' : model.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {model.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                            {model.status === 'pending' && <Clock className="w-3 h-3" />}
                            {model.status === 'rejected' && <XCircle className="w-3 h-3" />}
                            {(!model.status || model.status === 'draft') && <FileEdit className="w-3 h-3" />}
                            {model.status || 'DRAFT'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => window.location.href = `/e-sop-atrbpn/sop/studio?id=${model.id}`} className="px-3 py-2 text-emerald-600 hover:bg-emerald-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-emerald-200"><Edit className="w-4 h-4" /> Buka</button>
                          {currentUser.role === 'admin' && model.status !== 'approved' && (
                            <div className={`flex ml-2 border-l pl-2 gap-2 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <button onClick={() => handleApprove(model)} className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={() => setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '' })} className="px-3 py-1.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}
                          {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                            <button onClick={() => deleteModel(model.id)} className={`p-2 rounded-lg transition-colors hover:text-red-600 hover:bg-red-50 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Hapus Dokumen"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
