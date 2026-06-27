'use client';

import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  ScrollText, FilePlus, Search, Filter,
  ExternalLink, FileText, ChevronLeft, ChevronRight, BookOpen, Inbox,
  X, RefreshCw, Download, Calendar, Building2, Globe, Lock,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';
import SearchableSelect from '@/components/SearchableSelect';

interface UnitNode { id: string; nama: string; level: number; parent_id: string | null; children: UnitNode[]; }

type JenisDokRef = 'Juknis' | 'Juklak' | 'SE' | 'Semua';
type TabView = 'unit' | 'kementerian';

interface DokRef {
  id: number;
  judul: string;
  jenis: 'Juknis' | 'Juklak' | 'SE';
  nomor: string;
  tahun: string;
  tanggal_terbit: string;
  tentang: string;
  link: string;
  unit_l1: string;
  unit_l2: string;
  unit_l3: string;
  created_by?: number;
}

const JENIS_BADGE: Record<string, string> = {
  Juknis: 'bg-blue-100 text-blue-700',
  Juklak: 'bg-violet-100 text-violet-700',
  SE:     'bg-amber-100 text-amber-700',
};
const JENIS_BADGE_DARK: Record<string, string> = {
  Juknis: 'bg-blue-900/40 text-blue-300',
  Juklak: 'bg-violet-900/40 text-violet-300',
  SE:     'bg-amber-900/40 text-amber-300',
};

const API_BASE = '/e-sop-atrbpn/api';

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}

const EMPTY_FORM = {
  judul: '',
  jenis: 'Juknis' as 'Juknis' | 'Juklak' | 'SE',
  nomor: '',
  tahun: new Date().getFullYear().toString(),
  tanggal_terbit: '',
  tentang: '',
  link: '',
  unit_l1: '',
  unit_l2: '',
  unit_l3: '',
};

export default function JuknisPage() {
  const { isDarkMode, currentUser } = useAppContext();
  const [token, setToken] = useState('');

  const isAdmin  = currentUser?.role === 'admin';
  const isUser   = currentUser?.role === 'user';
  const isViewer = currentUser?.role === 'viewer';

  // Tab hanya aktif untuk role user (terbatas)
  const [activeTab, setActiveTab] = useState<TabView>('unit');
  // Pada tab 'unit' user bisa tulis, pada tab 'kementerian' hanya baca
  const tabCanWrite = isAdmin || (isUser && activeTab === 'unit');

  const [dokumenList, setDokumenList] = useState<DokRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterJenis, setFilterJenis] = useState<JenisDokRef>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTahun, setFilterTahun] = useState('');
  const [filterUnitL1, setFilterUnitL1] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [unitTree, setUnitTree] = useState<UnitNode[]>([]);

  useEffect(() => {
    const tok = localStorage.getItem('token');
    if (tok) setToken(tok);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/e-sop-atrbpn/api/unit-kerja/tree', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d)) setUnitTree(d); })
      .catch(() => {});
  }, [token]);

  const fetchDokumen = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/juknis', token);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setDokumenList(data);
      }
    } catch { /* endpoint belum ada, tampilkan kosong */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchDokumen(); }, [fetchDokumen]);

  // Sumber data: user+tab unit → filter ke unit_l1 sendiri; lainnya → semua
  const baseList = isUser && activeTab === 'unit'
    ? dokumenList.filter(d => d.unit_l1 === currentUser?.unit_l1)
    : dokumenList;

  const tahunList   = [...new Set(baseList.map(d => d.tahun).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const unitL1List  = [...new Set(dokumenList.map(d => d.unit_l1).filter(Boolean))].sort();

  const filtered = baseList.filter(d => {
    const matchJenis  = filterJenis === 'Semua' || d.jenis === filterJenis;
    const matchTahun  = !filterTahun  || d.tahun   === filterTahun;
    const matchUnit   = !filterUnitL1 || d.unit_l1 === filterUnitL1;
    const kw = searchQuery.toLowerCase();
    const matchSearch =
      d.judul.toLowerCase().includes(kw) ||
      (d.tentang  || '').toLowerCase().includes(kw) ||
      (d.nomor    || '').toLowerCase().includes(kw) ||
      (d.unit_l1  || '').toLowerCase().includes(kw) ||
      (d.unit_l2  || '').toLowerCase().includes(kw);
    return matchJenis && matchTahun && matchUnit && matchSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (!a.tanggal_terbit && !b.tanggal_terbit) return 0;
    if (!a.tanggal_terbit) return 1;
    if (!b.tanggal_terbit) return -1;
    return b.tanggal_terbit.localeCompare(a.tanggal_terbit);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [searchQuery, filterJenis, filterTahun, filterUnitL1, pageSize, activeTab]);

  const switchTab = (tab: TabView) => {
    setActiveTab(tab);
    setFilterJenis('Semua');
    setFilterTahun('');
    setFilterUnitL1('');
    setSearchQuery('');
  };

  const formatTanggal = (iso: string) => {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    const bulan = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parseInt(d)} ${bulan[parseInt(m)]} ${y}`;
  };

  const exportExcel = () => {
    const suffix = (isUser && activeTab === 'unit')
      ? (currentUser?.unit_l1 || 'Unit').replace(/ /g, '_')
      : 'Kementerian';
    const rows = filtered.map((d, i) => ({
      'No': i + 1,
      'Judul Dokumen': d.judul,
      'Jenis': d.jenis,
      'Nomor Dokumen': d.nomor || '-',
      'Tahun': d.tahun,
      'Tanggal Terbit': d.tanggal_terbit ? formatTanggal(d.tanggal_terbit) : '-',
      'Unit Utama (L1)': d.unit_l1 || '-',
      'Direktorat / Biro (L2)': d.unit_l2 || '-',
      'Subdit / Bagian (L3)': d.unit_l3 || '-',
      'Tentang': d.tentang || '-',
      'Link Dokumen': d.link || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daftar Dokumen');
    XLSX.writeFile(wb, `Daftar-Juknis-Juklak-SE-${suffix}-${new Date().getFullYear()}.xlsx`);
  };

  const openTambah = () => {
    setEditingId(null);
    // user terbatas: pre-fill unit_l1 dari profil dan kunci
    setFormData({ ...EMPTY_FORM, unit_l1: isUser ? (currentUser?.unit_l1 || '') : '' });
    setSaveError('');
    setShowForm(true);
  };

  const openEdit = (doc: DokRef) => {
    setEditingId(doc.id);
    setFormData({
      judul: doc.judul, jenis: doc.jenis, nomor: doc.nomor, tahun: doc.tahun,
      tanggal_terbit: doc.tanggal_terbit || '', tentang: doc.tentang, link: doc.link,
      unit_l1: doc.unit_l1 || '', unit_l2: doc.unit_l2 || '', unit_l3: doc.unit_l3 || '',
    });
    setSaveError('');
    setShowForm(true);
  };

  // user (terbatas) hanya bisa pilih unit_l1 miliknya sendiri
  const l1Options = isUser ? [currentUser?.unit_l1 || ''].filter(Boolean) : unitTree.map(n => n.nama);
  const l1Node    = unitTree.find(n => n.nama === formData.unit_l1);
  const l2Options = l1Node ? l1Node.children.map(n => n.nama) : [];
  const l2Node    = l1Node?.children.find(n => n.nama === formData.unit_l2);
  const l3Options = l2Node ? l2Node.children.map(n => n.nama) : [];

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.judul.trim()) { setSaveError('Judul wajib diisi.'); return; }
    setSaving(true); setSaveError('');
    try {
      const body = JSON.stringify(formData);
      const res = editingId !== null
        ? await apiFetch(`/juknis/${editingId}`, token, { method: 'PUT', body })
        : await apiFetch('/juknis', token, { method: 'POST', body });
      if (res.ok) {
        await fetchDokumen();
        setShowForm(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Gagal menyimpan. Pastikan endpoint /api/juknis sudah tersedia.');
      }
    } catch {
      setSaveError('Tidak dapat terhubung ke server.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Hapus dokumen ini?')) return;
    try {
      await apiFetch(`/juknis/${id}`, token, { method: 'DELETE' });
      setDokumenList(prev => prev.filter(d => d.id !== id));
    } catch { alert('Gagal menghapus.'); }
  };

  const dm = isDarkMode;

  const countJuknis = baseList.filter(d => d.jenis === 'Juknis').length;
  const countJuklak = baseList.filter(d => d.jenis === 'Juklak').length;
  const countSE     = baseList.filter(d => d.jenis === 'SE').length;

  // Label singkat unit_l1 untuk tab
  const unitLabel = currentUser?.unit_l1
    ? (currentUser.unit_l1.length > 22 ? currentUser.unit_l1.substring(0, 22) + '…' : currentUser.unit_l1)
    : 'Unit Kerja Saya';

  return (
    <div className="overflow-auto p-4 md:p-6 lg:p-8 h-full">
      <div className="max-w-7xl mx-auto space-y-5 pb-12 animate-in fade-in duration-500">

        {/* ── Judul ── */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
          <div>
            <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${dm ? 'text-white' : 'text-[#002855]'}`}>
              Juknis / Juklak / SE
            </h2>
            <p className={`mt-2 text-sm font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
              Petunjuk teknis, petunjuk pelaksanaan, dan surat edaran Kementerian ATR/BPN
            </p>
          </div>

          {/* Tombol untuk admin (posisi kanan atas, tidak ada tab) */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button onClick={exportExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${dm ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                <Download className="w-4 h-4" /> Export Excel
              </button>
              <button onClick={openTambah} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                <FilePlus className="w-4 h-4" /> Tambah Dokumen Referensi
              </button>
            </div>
          )}
        </div>

        {/* ── Tab Switcher — hanya user (terbatas) ── */}
        {isUser && (
          <>
            <div className={`inline-flex gap-1.5 p-1.5 rounded-2xl border ${dm ? 'bg-[#0B1121] border-slate-800' : 'bg-slate-100 border-slate-200/80'}`}>
              {/* Tab: Unit Kerja Saya */}
              {/* Tab Unit Kerja — biru */}
              <button
                onClick={() => switchTab('unit')}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'unit'
                    ? dm
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'bg-[#002855] text-white shadow-lg shadow-blue-900/20'
                    : dm
                      ? 'text-blue-400 hover:bg-blue-900/20 hover:text-blue-300'
                      : 'text-blue-700 hover:bg-blue-50 hover:text-blue-800'
                }`}
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="leading-tight text-left">
                  Juknis / Juklak / SE
                  <span className={`block text-[10px] font-semibold leading-none mt-0.5 truncate max-w-40 ${
                    activeTab === 'unit'
                      ? 'text-blue-200'
                      : dm ? 'text-blue-600' : 'text-blue-400'
                  }`}>
                    {unitLabel}
                  </span>
                </span>
              </button>

              {/* Tab Kementerian — amber */}
              <button
                onClick={() => switchTab('kementerian')}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'kementerian'
                    ? dm
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40'
                      : 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : dm
                      ? 'text-amber-400 hover:bg-amber-900/20 hover:text-amber-300'
                      : 'text-amber-700 hover:bg-amber-50 hover:text-amber-800'
                }`}
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span className="leading-tight text-left">
                  Juknis / Juklak / SE
                  <span className={`block text-[10px] font-semibold leading-none mt-0.5 ${
                    activeTab === 'kementerian'
                      ? 'text-amber-100'
                      : dm ? 'text-amber-600' : 'text-amber-400'
                  }`}>
                    1 Kementerian (lihat saja)
                  </span>
                </span>
              </button>
            </div>

            {/* Banner info mode lihat saja */}
            {activeTab === 'kementerian' && (
              <div className={`flex items-start gap-3 p-4 rounded-2xl border ${dm ? 'bg-amber-900/20 border-amber-800/30' : 'bg-amber-50 border-amber-100'}`}>
                <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${dm ? 'text-amber-400' : 'text-amber-600'}`} />
                <p className={`text-sm font-medium leading-relaxed ${dm ? 'text-amber-300' : 'text-amber-700'}`}>
                  <span className="font-extrabold">Mode Lihat Saja</span> — Anda dapat melihat dan mengunduh rekap seluruh dokumen kementerian, namun tidak dapat menambahkan atau mengubah dokumen di tampilan ini. Pindah ke tab unit kerja Anda untuk mengelola dokumen.
                </p>
              </div>
            )}

            {/* Tombol aksi untuk user (terbatas) */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={exportExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${dm ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                <Download className="w-4 h-4" /> Export Excel
              </button>
              {activeTab === 'unit' && (
                <button onClick={openTambah} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                  <FilePlus className="w-4 h-4" /> Tambah Dokumen Referensi
                </button>
              )}
            </div>
          </>
        )}

        {/* Tombol viewer (hanya Export) */}
        {isViewer && (
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className={`flex items-start gap-3 p-3.5 rounded-2xl border flex-1 min-w-0 ${dm ? 'bg-teal-900/20 border-teal-800/30' : 'bg-teal-50 border-teal-100'}`}>
              <Lock className={`w-4 h-4 mt-0.5 shrink-0 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
              <p className={`text-sm font-medium leading-relaxed ${dm ? 'text-teal-300' : 'text-teal-700'}`}>
                <span className="font-extrabold">Mode Lihat Saja</span> — Anda melihat seluruh dokumen Kementerian ATR/BPN. Hubungi administrator untuk mengelola dokumen.
              </p>
            </div>
            <button onClick={exportExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all shrink-0 ${dm ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
              <Download className="w-4 h-4" /> Export Excel
            </button>
          </div>
        )}

        {/* ── Kartu ringkasan ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Petunjuk Teknis (Juknis)', icon: FileText, color: dm ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600', count: countJuknis },
            { label: 'Petunjuk Pelaksanaan (Juklak)', icon: BookOpen, color: dm ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600', count: countJuklak },
            { label: 'Surat Edaran (SE)', icon: ScrollText, color: dm ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600', count: countSE },
          ].map(({ label, icon: Icon, color, count }) => (
            <div key={label} className={`p-5 rounded-2xl border flex items-center gap-4 shadow-sm ${dm ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className={`p-3 rounded-xl ${color}`}><Icon className="w-6 h-6" /></div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider mb-0.5 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
                <p className={`text-3xl font-extrabold ${dm ? 'text-white' : 'text-[#002855]'}`}>{count}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabel ── */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${dm ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className={`p-5 border-b ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-3">
              <h3 className={`text-base font-extrabold shrink-0 ${dm ? 'text-white' : 'text-[#002855]'}`}>
                Daftar Dokumen
                <span className={`ml-2 text-sm font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>({filtered.length})</span>
              </h3>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Cari judul, nomor, unit kerja..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Filter Jenis */}
              <div className={`flex items-center gap-2 border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select value={filterJenis} onChange={e => setFilterJenis(e.target.value as JenisDokRef)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pr-2 cursor-pointer ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  <option value="Semua">Semua Jenis</option>
                  <option value="Juknis">Juknis</option>
                  <option value="Juklak">Juklak</option>
                  <option value="SE">Surat Edaran</option>
                </select>
              </div>
              {/* Filter Tahun */}
              <div className={`flex items-center gap-2 border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select value={filterTahun} onChange={e => setFilterTahun(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pr-2 cursor-pointer ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  <option value="">Semua Tahun</option>
                  {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Filter Unit Kerja — untuk admin, viewer, atau user di tab kementerian */}
              {(isAdmin || isViewer || (isUser && activeTab === 'kementerian')) && (
                <div className={`flex items-center gap-2 border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select value={filterUnitL1} onChange={e => setFilterUnitL1(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pr-2 cursor-pointer max-w-50 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                    <option value="">Semua Unit Kerja</option>
                    {unitL1List.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
              {/* Reset filter */}
              {(filterJenis !== 'Semua' || filterTahun || filterUnitL1 || searchQuery) && (
                <button onClick={() => { setFilterJenis('Semua'); setFilterTahun(''); setFilterUnitL1(''); setSearchQuery(''); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${dm ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  <X className="w-3 h-3" /> Reset Filter
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Memuat data...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className={`p-5 rounded-2xl ${dm ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Inbox className={`w-12 h-12 ${dm ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
              <p className={`text-base font-bold ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Belum ada dokumen referensi</p>
              <p className={`text-sm ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                {tabCanWrite ? 'Klik "Tambah Dokumen Referensi" untuk menambahkan.' : 'Dokumen Juknis, Juklak, dan SE akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${dm ? 'bg-[#0F172A] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  <tr>
                    <th className="px-4 py-4 w-10 text-center">No</th>
                    <th className="px-4 py-4">Judul Dokumen</th>
                    <th className="px-4 py-4">Unit Kerja</th>
                    <th className="px-4 py-4">Nomor</th>
                    <th className="px-4 py-4">Jenis</th>
                    <th className="px-4 py-4">Tahun / Terbit</th>
                    <th className="px-4 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((doc, idx) => (
                    <tr key={doc.id} className={`border-b transition-colors ${dm ? 'border-slate-800 hover:bg-blue-900/10' : 'border-slate-50 hover:bg-blue-50/30'}`}>
                      <td className="px-4 py-4 text-center text-slate-400 text-sm">{(safePage - 1) * pageSize + idx + 1}</td>
                      <td className={`px-4 py-4 font-bold max-w-xs ${dm ? 'text-blue-100' : 'text-[#002855]'}`}>
                        <p className="line-clamp-2 text-sm">{doc.judul}</p>
                        {doc.tentang && <p className={`text-xs font-normal mt-0.5 line-clamp-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{doc.tentang}</p>}
                      </td>
                      <td className="px-4 py-4 max-w-45">
                        {doc.unit_l1 ? (
                          <div>
                            <p className={`text-xs font-bold line-clamp-1 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{doc.unit_l1}</p>
                            {doc.unit_l2 && <p className={`text-[11px] font-medium line-clamp-1 mt-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{doc.unit_l2}</p>}
                            {doc.unit_l3 && <p className={`text-[11px] line-clamp-1 mt-0.5 ${dm ? 'text-slate-600' : 'text-slate-400'}`}>{doc.unit_l3}</p>}
                          </div>
                        ) : <span className={`text-xs ${dm ? 'text-slate-600' : 'text-slate-400'}`}>—</span>}
                      </td>
                      <td className={`px-4 py-4 text-xs font-mono ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{doc.nomor || '—'}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${dm ? JENIS_BADGE_DARK[doc.jenis] : JENIS_BADGE[doc.jenis]}`}>
                          {doc.jenis}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className={`text-sm font-bold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{doc.tahun || '—'}</p>
                        {doc.tanggal_terbit && (
                          <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                            <Calendar className="w-3 h-3 shrink-0" />{formatTanggal(doc.tanggal_terbit)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {doc.link && (
                            <a href={doc.link} target="_blank" rel="noreferrer"
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dm ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'}`}>
                              Buka <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {/* Edit/Hapus: admin selalu bisa, user hanya dokumen miliknya sendiri */}
                          {(isAdmin || (isUser && doc.created_by === currentUser?.id)) && (
                            <>
                              <button onClick={() => openEdit(doc)} className={`text-xs font-bold transition-colors ${dm ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>Edit</button>
                              <button onClick={() => handleDelete(doc.id)} className={`text-xs font-bold transition-colors ${dm ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'}`}>Hapus</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginasi */}
          {!loading && sorted.length > 0 && (
            <div className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3 ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Tampilkan</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className={`border rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 outline-none cursor-pointer ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/30' : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-blue-100'}`}>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>per halaman &mdash; menampilkan {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} dari <span className="font-bold">{sorted.length}</span></span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={safePage === 1} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}>«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronLeft className="w-4 h-4" /></button>
                <span className={`px-3 py-1 text-xs font-bold ${dm ? 'text-white' : 'text-slate-700'}`}>{safePage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Form Tambah/Edit ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            {/* Header modal */}
            <div className={`flex items-center justify-between p-5 border-b shrink-0 ${dm ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${dm ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <FilePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${dm ? 'text-white' : 'text-[#002855]'}`}>
                    {editingId ? 'Edit Dokumen Referensi' : 'Tambah Dokumen Referensi Baru'}
                  </h3>
                  <p className={`text-xs mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                    {editingId ? 'Perbarui informasi dokumen secara akurat.' : 'Lengkapi form di bawah ini untuk menambahkan dokumen referensi.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className={`p-2 rounded-xl transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Isi form */}
            <form onSubmit={handleSimpan} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Judul */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Judul Dokumen <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.judul} onChange={e => setFormData({ ...formData, judul: e.target.value })} placeholder="Cth: Petunjuk Teknis Penyusunan SOP ATR/BPN"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400 placeholder:text-slate-400'}`}
                />
              </div>

              {/* Jenis + Tahun */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Dokumen</label>
                  <select value={formData.jenis} onChange={e => setFormData({ ...formData, jenis: e.target.value as 'Juknis'|'Juklak'|'SE' })} className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all cursor-pointer ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100'}`}>
                    <option value="Juknis">Petunjuk Teknis (Juknis)</option>
                    <option value="Juklak">Petunjuk Pelaksanaan (Juklak)</option>
                    <option value="SE">Surat Edaran (SE)</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Tahun Terbit</label>
                  <input required type="number" min="1990" max="2099" value={formData.tahun} onChange={e => setFormData({ ...formData, tahun: e.target.value })} className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100'}`} />
                </div>
              </div>

              {/* Nomor + Tanggal Terbit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Nomor Dokumen</label>
                  <input type="text" value={formData.nomor} onChange={e => setFormData({ ...formData, nomor: e.target.value })} placeholder="Cth: 01/JUKNIS-ATR/2024"
                    className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all font-mono ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Tanggal Pengesahan / Terbit</label>
                  <input type="date" value={formData.tanggal_terbit} onChange={e => setFormData({ ...formData, tanggal_terbit: e.target.value })} className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 scheme-dark' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100'}`} />
                </div>
              </div>

              {/* Pemetaan Unit Kerja */}
              <div>
                <h4 className={`text-sm font-extrabold mb-4 uppercase tracking-wider ${dm ? 'text-blue-400' : 'text-[#002855]'}`}>Pemetaan Unit Kerja</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">
                      Level 1 (Unit Utama) <span className="text-red-500">*</span>
                      {isUser && <span className={`ml-1 text-[10px] ${dm ? 'text-slate-600' : 'text-slate-400'}`}>(terkunci)</span>}
                    </label>
                    {isUser ? (
                      /* Untuk user terbatas: field terkunci sesuai unit kerja profil */
                      <div className={`px-4 py-3 border rounded-xl text-sm font-medium flex items-center gap-2 ${dm ? 'bg-slate-800/60 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                        <Lock className="w-3.5 h-3.5 shrink-0 opacity-50" />
                        <span className="truncate">{formData.unit_l1 || currentUser?.unit_l1 || '—'}</span>
                      </div>
                    ) : (
                      <SearchableSelect options={l1Options} value={formData.unit_l1} onChange={v => setFormData({ ...formData, unit_l1: v, unit_l2: '', unit_l3: '' })} placeholder="Cari unit utama..." dm={dm} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">Level 2 (Direktorat/Biro)</label>
                    <SearchableSelect options={l2Options} value={formData.unit_l2} onChange={v => setFormData({ ...formData, unit_l2: v, unit_l3: '' })} placeholder={formData.unit_l1 ? 'Cari sub-unit...' : 'Pilih Level 1 dahulu'} disabled={!formData.unit_l1} dm={dm} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2 text-slate-500">Level 3 (Subdit/Bagian)</label>
                    <SearchableSelect options={l3Options} value={formData.unit_l3} onChange={v => setFormData({ ...formData, unit_l3: v })} placeholder={formData.unit_l2 ? 'Cari sub-sub-unit...' : 'Pilih Level 2 dahulu'} disabled={!formData.unit_l2} dm={dm} />
                  </div>
                </div>
              </div>

              {/* Tentang */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Tentang / Deskripsi Singkat</label>
                <textarea rows={3} value={formData.tentang} onChange={e => setFormData({ ...formData, tentang: e.target.value })} placeholder="Cth: Pedoman penyusunan dan pengajuan Standar Operasional Prosedur di lingkungan ATR/BPN"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all resize-none ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'}`}
                />
              </div>

              {/* Link */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Link Dokumen</label>
                <input type="url" value={formData.link} onChange={e => setFormData({ ...formData, link: e.target.value })} placeholder="Tempel link Google Drive atau sumber lainnya..."
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'}`}
                />
              </div>

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-400/30 rounded-xl">
                  <p className="text-red-500 text-sm font-medium">{saveError}</p>
                </div>
              )}

              {/* Tombol aksi */}
              <div className={`pt-4 border-t flex justify-end gap-3 ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
                <button type="button" onClick={() => setShowForm(false)} className={`px-5 py-2.5 font-extrabold rounded-xl transition-colors text-sm ${dm ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                  Batal
                </button>
                <button type="submit" disabled={saving} className={`px-7 py-2.5 font-extrabold rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center gap-2 text-sm ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                  {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Simpan Perubahan' : 'Simpan Dokumen'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
