'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ScrollText, FilePlus, Search, Filter,
  ExternalLink, FileText, ChevronRight, BookOpen, Inbox,
  X, RefreshCw,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';
import SearchableSelect from '@/components/SearchableSelect';

// --- Tipe node unit kerja dari API kehadiran ---
interface UnitNode { id: string; nama: string; level: number; parent_id: string | null; children: UnitNode[]; }

type JenisDokRef = 'Juknis' | 'Juklak' | 'SE' | 'Semua';

interface DokRef {
  id: number;
  judul: string;
  jenis: 'Juknis' | 'Juklak' | 'SE';
  nomor: string;
  tahun: string;
  tentang: string;
  link: string;
  unit_l1: string;
  unit_l2: string;
  unit_l3: string;
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
  tentang: '',
  link: '',
  unit_l1: '',
  unit_l2: '',
  unit_l3: '',
};

export default function JuknisPage() {
  const { isDarkMode, currentUser } = useAppContext();
  const [token, setToken] = useState('');

  const [dokumenList, setDokumenList] = useState<DokRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterJenis, setFilterJenis] = useState<JenisDokRef>('Semua');
  const [searchQuery, setSearchQuery] = useState('');

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

  const filtered = dokumenList.filter(d => {
    const matchJenis = filterJenis === 'Semua' || d.jenis === filterJenis;
    const kw = searchQuery.toLowerCase();
    const matchSearch =
      d.judul.toLowerCase().includes(kw) ||
      d.tentang.toLowerCase().includes(kw) ||
      d.nomor.toLowerCase().includes(kw);
    return matchJenis && matchSearch;
  });

  const openTambah = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setSaveError('');
    setShowForm(true);
  };

  const openEdit = (doc: DokRef) => {
    setEditingId(doc.id);
    setFormData({ judul: doc.judul, jenis: doc.jenis, nomor: doc.nomor, tahun: doc.tahun, tentang: doc.tentang, link: doc.link, unit_l1: doc.unit_l1 || '', unit_l2: doc.unit_l2 || '', unit_l3: doc.unit_l3 || '' });
    setSaveError('');
    setShowForm(true);
  };

  const l1Options = unitTree.map(n => n.nama);
  const l1Node = unitTree.find(n => n.nama === formData.unit_l1);
  const l2Options = l1Node ? l1Node.children.map(n => n.nama) : [];
  const l2Node = l1Node?.children.find(n => n.nama === formData.unit_l2);
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

  return (
    <div className="overflow-auto p-4 md:p-6 lg:p-8 h-full">
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

        {/* Judul */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-2">
          <div>
            <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${dm ? 'text-white' : 'text-[#002855]'}`}>
              Juknis / Juklak / SE
            </h2>
            <p className={`mt-2 text-sm font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
              Petunjuk teknis, petunjuk pelaksanaan, dan surat edaran Kementerian ATR/BPN
            </p>
          </div>
          {currentUser?.role === 'admin' && (
            <button
              onClick={openTambah}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all shrink-0 ${
                dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'
              }`}
            >
              <FilePlus className="w-4 h-4" /> Tambah Dokumen Referensi
            </button>
          )}
        </div>

        {/* Kartu ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Petunjuk Teknis (Juknis)', icon: FileText, color: dm ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600', count: dokumenList.filter(d => d.jenis === 'Juknis').length },
            { label: 'Petunjuk Pelaksanaan (Juklak)', icon: BookOpen, color: dm ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-50 text-violet-600', count: dokumenList.filter(d => d.jenis === 'Juklak').length },
            { label: 'Surat Edaran (SE)', icon: ScrollText, color: dm ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600', count: dokumenList.filter(d => d.jenis === 'SE').length },
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

        {/* Tabel */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${dm ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className={`p-5 border-b flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
            <h3 className={`text-base font-extrabold shrink-0 ${dm ? 'text-white' : 'text-[#002855]'}`}>Daftar Dokumen</h3>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Cari judul, nomor..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>
              <div className={`flex items-center border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Filter className="w-4 h-4 text-slate-400 mr-2" />
                <select
                  value={filterJenis}
                  onChange={e => setFilterJenis(e.target.value as JenisDokRef)}
                  className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2.5 pr-4 cursor-pointer ${dm ? 'text-slate-300' : 'text-slate-700'}`}
                >
                  <option value="Semua">Semua Jenis</option>
                  <option value="Juknis">Juknis</option>
                  <option value="Juklak">Juklak</option>
                  <option value="SE">Surat Edaran</option>
                </select>
              </div>
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
                {currentUser?.role === 'admin' ? 'Klik "Tambah Dokumen Referensi" untuk menambahkan.' : 'Dokumen Juknis, Juklak, dan SE akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${dm ? 'bg-[#0F172A] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  <tr>
                    <th className="px-6 py-4 w-12 text-center">No</th>
                    <th className="px-6 py-4">Judul Dokumen</th>
                    <th className="px-6 py-4">Nomor</th>
                    <th className="px-6 py-4">Jenis</th>
                    <th className="px-6 py-4">Tahun</th>
                    <th className="px-6 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doc, idx) => (
                    <tr key={doc.id} className={`border-b transition-colors ${dm ? 'border-slate-800 hover:bg-blue-900/10' : 'border-slate-50 hover:bg-blue-50/30'}`}>
                      <td className="px-6 py-4 text-center text-slate-400">{idx + 1}</td>
                      <td className={`px-6 py-4 font-bold ${dm ? 'text-blue-100' : 'text-[#002855]'}`}>
                        <p className="line-clamp-2">{doc.judul}</p>
                        {doc.tentang && <p className={`text-xs font-normal mt-0.5 line-clamp-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{doc.tentang}</p>}
                      </td>
                      <td className={`px-6 py-4 text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{doc.nomor || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${dm ? JENIS_BADGE_DARK[doc.jenis] : JENIS_BADGE[doc.jenis]}`}>
                          {doc.jenis}
                        </span>
                      </td>
                      <td className={`px-6 py-4 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{doc.tahun}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {doc.link && (
                            <a href={doc.link} target="_blank" rel="noreferrer"
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dm ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white'}`}>
                              Buka <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {currentUser?.role === 'admin' && (
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
        </div>
      </div>

      {/* Modal Form Tambah/Edit */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${
              dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'
            }`}
          >
            {/* Header modal */}
            <div className={`flex items-center justify-between p-5 border-b ${dm ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
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
            <form onSubmit={handleSimpan} className="p-6 space-y-5">
              {/* Judul */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  Judul Dokumen <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={formData.judul}
                  onChange={e => setFormData({ ...formData, judul: e.target.value })}
                  placeholder="Cth: Petunjuk Teknis Penyusunan SOP ATR/BPN"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-600'
                       : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400 placeholder:text-slate-400'
                  }`}
                />
              </div>

              {/* Jenis + Tahun */}
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Jenis Dokumen</label>
                  <select
                    value={formData.jenis}
                    onChange={e => setFormData({ ...formData, jenis: e.target.value as 'Juknis'|'Juklak'|'SE' })}
                    className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all cursor-pointer ${
                      dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20'
                         : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100'
                    }`}
                  >
                    <option value="Juknis">Petunjuk Teknis (Juknis)</option>
                    <option value="Juklak">Petunjuk Pelaksanaan (Juklak)</option>
                    <option value="SE">Surat Edaran (SE)</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Tahun Terbit</label>
                  <input
                    required
                    type="number"
                    min="1990"
                    max="2099"
                    value={formData.tahun}
                    onChange={e => setFormData({ ...formData, tahun: e.target.value })}
                    className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${
                      dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20'
                         : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100'
                    }`}
                  />
                </div>
              </div>

              {/* Nomor */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Nomor Dokumen</label>
                <input
                  type="text"
                  value={formData.nomor}
                  onChange={e => setFormData({ ...formData, nomor: e.target.value })}
                  placeholder="Cth: 01/JUKNIS-ATR/2024"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all font-mono ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600'
                       : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'
                  }`}
                />
              </div>

              {/* Pemetaan Unit Kerja */}
              <div className={`rounded-xl border p-4 space-y-4 ${dm ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
                <p className={`text-xs font-extrabold uppercase tracking-wider ${dm ? 'text-slate-400' : 'text-slate-500'}`}>
                  Pemetaan Unit Kerja
                </p>
                <div>
                  <label className={`block text-sm font-bold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Unit Utama (Level 1)</label>
                  <SearchableSelect
                    options={l1Options}
                    value={formData.unit_l1}
                    onChange={v => setFormData({ ...formData, unit_l1: v, unit_l2: '', unit_l3: '' })}
                    placeholder="Cari dan pilih unit utama..."
                    dm={dm}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Unit (Level 2)</label>
                  <SearchableSelect
                    options={l2Options}
                    value={formData.unit_l2}
                    onChange={v => setFormData({ ...formData, unit_l2: v, unit_l3: '' })}
                    placeholder={formData.unit_l1 ? 'Cari dan pilih sub-unit...' : 'Pilih Level 1 terlebih dahulu'}
                    disabled={!formData.unit_l1}
                    dm={dm}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-bold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>Sub-Sub-Unit (Level 3)</label>
                  <SearchableSelect
                    options={l3Options}
                    value={formData.unit_l3}
                    onChange={v => setFormData({ ...formData, unit_l3: v })}
                    placeholder={formData.unit_l2 ? 'Cari dan pilih sub-sub-unit...' : 'Pilih Level 2 terlebih dahulu'}
                    disabled={!formData.unit_l2}
                    dm={dm}
                  />
                </div>
              </div>

              {/* Tentang */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  Tentang / Deskripsi Singkat
                </label>
                <textarea
                  rows={3}
                  value={formData.tentang}
                  onChange={e => setFormData({ ...formData, tentang: e.target.value })}
                  placeholder="Cth: Pedoman penyusunan dan pengajuan Standar Operasional Prosedur di lingkungan ATR/BPN"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all resize-none ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600'
                       : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'
                  }`}
                />
              </div>

              {/* Link */}
              <div>
                <label className={`block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  Link Dokumen
                </label>
                <input
                  type="url"
                  value={formData.link}
                  onChange={e => setFormData({ ...formData, link: e.target.value })}
                  placeholder="Tempel link Google Drive atau sumber lainnya..."
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${
                    dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 placeholder:text-slate-600'
                       : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 placeholder:text-slate-400'
                  }`}
                />
              </div>

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-400/30 rounded-xl">
                  <p className="text-red-500 text-sm font-medium">{saveError}</p>
                </div>
              )}

              {/* Tombol aksi */}
              <div className={`pt-4 border-t flex justify-end gap-3 ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className={`px-5 py-2.5 font-extrabold rounded-xl transition-colors text-sm ${dm ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-7 py-2.5 font-extrabold rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center gap-2 text-sm ${
                    dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'
                  }`}
                >
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
