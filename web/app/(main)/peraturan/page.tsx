'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Landmark, FilePlus, Search, Filter, Calendar,
  ChevronLeft, ChevronRight, Download, RefreshCw,
  Inbox, X, ExternalLink, FileText, Gavel, FolderOpen, FileCheck,
  Folder, ArrowLeft,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

interface Peraturan {
  id: number;
  nama: string;
  jenis: 'Peraturan Menteri' | 'Keputusan Menteri';
  nomor: string;
  tahun: string;
  tanggal_ditetapkan: string;
  tentang: string;
  link_drive: string;
}

const JENIS_BADGE = {
  'Peraturan Menteri': 'bg-blue-100 text-blue-700',
  'Keputusan Menteri': 'bg-purple-100 text-purple-700',
};
const JENIS_BADGE_DARK = {
  'Peraturan Menteri': 'bg-blue-900/40 text-blue-300',
  'Keputusan Menteri': 'bg-purple-900/40 text-purple-300',
};

const API_BASE = '/e-sop-atrbpn/api';
function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
}

const EMPTY_FORM = {
  nama: '',
  jenis: 'Peraturan Menteri' as 'Peraturan Menteri' | 'Keputusan Menteri',
  nomor: '',
  tahun: new Date().getFullYear().toString(),
  tanggal_ditetapkan: '',
  tentang: '',
  link_drive: '',
};

const formatTanggal = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const bulan = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${parseInt(d)} ${bulan[parseInt(m)]} ${y}`;
};

const getEmbedUrl = (url: string) => {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
  return url;
};

// Ambil nomor dari nama peraturan bila kolom nomor kosong — mis. "... Nomor 5 Tahun 2024 ..." → "5".
const deriveNomor = (nama: string): string => {
  if (!nama) return '';
  const m = nama.match(/\bno(?:mor|\.)?\s*([0-9]+[A-Za-z0-9./-]*)/i);
  return m ? m[1] : '';
};

// Judul ringkas & mudah terbaca = subjek setelah kata "tentang"; fallback ke deskripsi lalu nama penuh.
const deriveJudul = (doc: { nama: string; tentang?: string }): string => {
  const m = (doc.nama || '').match(/\btentang\s+(.+)$/i);
  if (m && m[1].trim()) return m[1].trim();
  if (doc.tentang && doc.tentang.trim()) return doc.tentang.trim();
  return doc.nama || '—';
};

export default function PeraturanPage() {
  const { isDarkMode, currentUser } = useAppContext();
  const dm = isDarkMode;
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const [token, setToken] = useState('');
  const [list, setList] = useState<Peraturan[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenis, setFilterJenis] = useState('');
  const [filterTahun, setFilterTahun] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [viewDoc, setViewDoc] = useState<Peraturan | null>(null);

  const DRIVE_ROOT = '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveStack, setDriveStack]     = useState<{ id: string; name: string }[]>([]);
  const [driveFolders, setDriveFolders] = useState<{ id: string; name: string }[]>([]);
  const [driveFiles, setDriveFiles]     = useState<{ id: string; name: string; webViewLink: string }[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError]     = useState('');

  const fetchDriveFolder = useCallback(async (folderId: string) => {
    setDriveLoading(true);
    setDriveError('');
    try {
      const res = await apiFetch(`/dokumen/drive-browse?folderId=${encodeURIComponent(folderId)}`, token);
      const data = await res.json();
      if (!res.ok) { setDriveError(data.error || 'Gagal memuat folder'); return; }
      setDriveFolders(data.folders || []);
      setDriveFiles(data.files || []);
    } catch { setDriveError('Tidak dapat terhubung ke server.'); }
    finally { setDriveLoading(false); }
  }, [token]);

  const openDrivePicker = () => {
    setShowDrivePicker(true);
    setDriveStack([]);
    setDriveFolders([]);
    setDriveFiles([]);
    fetchDriveFolder(DRIVE_ROOT);
  };

  const driveNavigateTo = (folder: { id: string; name: string }) => {
    setDriveStack(prev => [...prev, folder]);
    fetchDriveFolder(folder.id);
  };

  const driveGoBack = () => {
    const newStack = driveStack.slice(0, -1);
    setDriveStack(newStack);
    fetchDriveFolder(newStack.length > 0 ? newStack[newStack.length - 1].id : DRIVE_ROOT);
  };

  const selectDriveFile = (file: { id: string; name: string; webViewLink: string }) => {
    setFormData(prev => ({
      ...prev,
      link_drive: file.webViewLink,
      nama: prev.nama || file.name.replace(/\.[^/.]+$/, ''),
    }));
    setShowDrivePicker(false);
  };

  useEffect(() => {
    const tok = localStorage.getItem('token');
    if (tok) setToken(tok);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/peraturan', token);
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) setList(d); }
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tahunList = [...new Set(list.map(d => d.tahun).filter(Boolean))].sort((a, b) => b.localeCompare(a));

  const filtered = list.filter(d => {
    const matchJenis = !filterJenis || d.jenis === filterJenis;
    const matchTahun = !filterTahun || d.tahun === filterTahun;
    const kw = searchQuery.toLowerCase();
    const matchSearch = d.nama.toLowerCase().includes(kw) || (d.nomor || '').toLowerCase().includes(kw) || (d.tentang || '').toLowerCase().includes(kw);
    return matchJenis && matchTahun && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [searchQuery, filterJenis, filterTahun, pageSize]);

  const exportExcel = () => {
    const rows = filtered.map((d, i) => ({
      'No': i + 1,
      'Nama Peraturan': d.nama,
      'Jenis': d.jenis,
      'Nomor': d.nomor || '-',
      'Tahun': d.tahun,
      'Tanggal Ditetapkan': d.tanggal_ditetapkan ? formatTanggal(d.tanggal_ditetapkan) : '-',
      'Tentang': d.tentang || '-',
      'Link Drive': d.link_drive || '-',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Peraturan');
    XLSX.writeFile(wb, `Daftar-Peraturan-Menteri-${new Date().getFullYear()}.xlsx`);
  };

  const openTambah = () => { setEditingId(null); setFormData(EMPTY_FORM); setSaveError(''); setShowForm(true); };
  const openEdit = (doc: Peraturan) => {
    setEditingId(doc.id);
    setFormData({ nama: doc.nama, jenis: doc.jenis, nomor: doc.nomor || '', tahun: doc.tahun || '', tanggal_ditetapkan: doc.tanggal_ditetapkan || '', tentang: doc.tentang || '', link_drive: doc.link_drive || '' });
    setSaveError(''); setShowForm(true);
  };

  const handleSimpan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) { setSaveError('Nama peraturan wajib diisi.'); return; }
    setSaving(true); setSaveError('');
    try {
      const body = JSON.stringify(formData);
      const res = editingId !== null
        ? await apiFetch(`/peraturan/${editingId}`, token, { method: 'PUT', body })
        : await apiFetch('/peraturan', token, { method: 'POST', body });
      if (res.ok) { await fetchData(); setShowForm(false); }
      else { const err = await res.json().catch(() => ({})); setSaveError(err.error || 'Gagal menyimpan.'); }
    } catch { setSaveError('Tidak dapat terhubung ke server.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Hapus peraturan ini?')) return;
    try { await apiFetch(`/peraturan/${id}`, token, { method: 'DELETE' }); setList(prev => prev.filter(d => d.id !== id)); }
    catch { alert('Gagal menghapus.'); }
  };

  const inputCls = `w-full px-4 py-3 border rounded-xl text-sm font-medium focus:ring-4 outline-none transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-blue-100 focus:border-blue-400 placeholder:text-slate-400'}`;
  const labelCls = `block text-sm font-extrabold mb-2 ${dm ? 'text-slate-300' : 'text-slate-700'}`;

  return (
    <div className="overflow-auto p-4 md:p-6 lg:p-8 h-full">
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-2">
          <div>
            <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${dm ? 'text-white' : 'text-[#002855]'}`}>Peraturan</h2>
            <p className={`mt-2 text-sm font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Peraturan dan Keputusan Menteri ATR/BPN yang telah ditetapkan</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={exportExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all shrink-0 ${dm ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
              <Download className="w-4 h-4" /> Export Excel
            </button>
            {canManage && (
              <button onClick={openTambah} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all shrink-0 ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                <FilePlus className="w-4 h-4" /> Tambah Peraturan
              </button>
            )}
          </div>
        </div>

        {/* Kartu ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Peraturan Menteri', icon: Landmark, color: dm ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600', count: list.filter(d => d.jenis === 'Peraturan Menteri').length },
            { label: 'Keputusan Menteri', icon: Gavel, color: dm ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600', count: list.filter(d => d.jenis === 'Keputusan Menteri').length },
            { label: 'Total Peraturan', icon: FileText, color: dm ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600', count: list.length },
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
          {/* Filter bar */}
          <div className={`p-5 border-b ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-3">
              <h3 className={`text-base font-extrabold shrink-0 ${dm ? 'text-white' : 'text-[#002855]'}`}>
                Daftar Peraturan
                <span className={`ml-2 text-sm font-medium ${dm ? 'text-slate-400' : 'text-slate-500'}`}>({filtered.length})</span>
              </h3>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text" placeholder="Cari nama, nomor peraturan..." value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${dm ? 'bg-[#0F172A] border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className={`flex items-center gap-2 border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select value={filterJenis} onChange={e => setFilterJenis(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pr-2 cursor-pointer ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  <option value="">Semua Jenis</option>
                  <option value="Peraturan Menteri">Peraturan Menteri</option>
                  <option value="Keputusan Menteri">Keputusan Menteri</option>
                </select>
              </div>
              <div className={`flex items-center gap-2 border rounded-xl px-3 ${dm ? 'bg-[#0F172A] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select value={filterTahun} onChange={e => setFilterTahun(e.target.value)} className={`bg-transparent border-none text-sm font-medium focus:ring-0 outline-none py-2 pr-2 cursor-pointer ${dm ? 'text-slate-300' : 'text-slate-700'}`}>
                  <option value="">Semua Tahun</option>
                  {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {(filterJenis || filterTahun || searchQuery) && (
                <button onClick={() => { setFilterJenis(''); setFilterTahun(''); setSearchQuery(''); }} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${dm ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
              <p className={`text-base font-bold ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Belum ada peraturan</p>
              <p className={`text-sm ${dm ? 'text-slate-600' : 'text-slate-400'}`}>
                {canManage ? 'Klik "Tambah Peraturan" untuk menambahkan.' : 'Peraturan dan Keputusan Menteri akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <>
              {/* Kartu (HP / tablet kecil) — nama peraturan tampil penuh & mudah terbaca */}
              <div className={`md:hidden divide-y ${dm ? 'divide-slate-800' : 'divide-slate-100'}`}>
                {paginated.map((doc, idx) => {
                  const nomor = doc.nomor || deriveNomor(doc.nama);
                  return (
                    <div key={doc.id} onClick={() => setViewDoc(doc)} className={`p-4 cursor-pointer transition-colors ${dm ? 'hover:bg-blue-900/20' : 'hover:bg-blue-50/60'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-[11px] text-slate-400 font-bold shrink-0">{(safePage - 1) * pageSize + idx + 1}.</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 ${dm ? JENIS_BADGE_DARK[doc.jenis] : JENIS_BADGE[doc.jenis]}`}>
                            {doc.jenis === 'Peraturan Menteri' ? 'Permen' : 'Kepmen'}
                          </span>
                          {nomor && <span className={`text-[11px] font-mono font-semibold shrink-0 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>No. {nomor}</span>}
                          <span className={`text-[11px] font-bold shrink-0 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{doc.tahun || '—'}</span>
                        </div>
                        {canManage && (
                          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            <button onClick={e => { e.stopPropagation(); openEdit(doc); }} className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-colors ${dm ? 'text-blue-400 hover:bg-slate-800' : 'text-blue-600 hover:bg-blue-50'}`}>Edit</button>
                            <button onClick={e => { e.stopPropagation(); handleDelete(doc.id); }} className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-colors ${dm ? 'text-red-400 hover:bg-slate-800' : 'text-red-500 hover:bg-red-50'}`}>Hapus</button>
                          </div>
                        )}
                      </div>
                      <p className={`font-bold text-sm leading-snug ${dm ? 'text-blue-100' : 'text-[#002855]'}`}>{deriveJudul(doc)}</p>
                      <p className={`text-xs mt-1 leading-relaxed line-clamp-2 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{doc.nama}</p>
                      {doc.tanggal_ditetapkan && (
                        <p className={`text-[11px] mt-1.5 flex items-center gap-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                          <Calendar className="w-3 h-3 shrink-0" /> Ditetapkan {formatTanggal(doc.tanggal_ditetapkan)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Tabel (desktop / layar lebar) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`text-[11px] font-bold uppercase tracking-wider border-b ${dm ? 'bg-[#0F172A] text-slate-400 border-slate-800' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                    <tr>
                      <th className="px-4 py-4 w-10 text-center">No</th>
                      <th className="px-4 py-4">Peraturan</th>
                      <th className="px-4 py-4">Jenis</th>
                      <th className="px-4 py-4">Nomor</th>
                      <th className="px-4 py-4">Tahun / Tanggal Ditetapkan</th>
                      <th className="px-4 py-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((doc, idx) => {
                      const nomor = doc.nomor || deriveNomor(doc.nama);
                      return (
                        <tr key={doc.id} onClick={() => setViewDoc(doc)} className={`border-b transition-colors cursor-pointer ${dm ? 'border-slate-800 hover:bg-blue-900/20' : 'border-slate-50 hover:bg-blue-50/60'}`}>
                          <td className="px-4 py-4 text-center text-slate-400 text-sm">{(safePage - 1) * pageSize + idx + 1}</td>
                          <td className="px-4 py-4 max-w-md">
                            <p className={`font-bold text-sm leading-snug ${dm ? 'text-blue-100' : 'text-[#002855]'}`}>{deriveJudul(doc)}</p>
                            <p className={`text-xs font-normal mt-0.5 line-clamp-2 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{doc.nama}</p>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap ${dm ? JENIS_BADGE_DARK[doc.jenis] : JENIS_BADGE[doc.jenis]}`}>
                              {doc.jenis === 'Peraturan Menteri' ? 'Permen' : 'Kepmen'}
                            </span>
                          </td>
                          <td className={`px-4 py-4 text-xs font-mono whitespace-nowrap ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{nomor || '—'}</td>
                          <td className="px-4 py-4">
                            <p className={`text-sm font-bold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{doc.tahun || '—'}</p>
                            {doc.tanggal_ditetapkan && (
                              <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
                                <Calendar className="w-3 h-3 shrink-0" />{formatTanggal(doc.tanggal_ditetapkan)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              {canManage && (
                                <>
                                  <button onClick={e => { e.stopPropagation(); openEdit(doc); }} className={`px-2.5 py-2.5 inline-flex items-center min-h-11 text-xs font-bold transition-colors ${dm ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>Edit</button>
                                  <button onClick={e => { e.stopPropagation(); handleDelete(doc.id); }} className={`px-2.5 py-2.5 inline-flex items-center min-h-11 text-xs font-bold transition-colors ${dm ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'}`}>Hapus</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination footer */}
          {!loading && filtered.length > 0 && (
            <div className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3 ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Tampilkan</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className={`border rounded-lg px-2 py-1 text-xs font-bold focus:ring-2 outline-none cursor-pointer ${dm ? 'bg-[#0F172A] border-slate-700 text-white focus:ring-blue-500/30' : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-blue-100'}`}>
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className={`text-xs ${dm ? 'text-slate-400' : 'text-slate-500'}`}>per halaman &mdash; {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} dari <span className="font-bold">{filtered.length}</span></span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(1)} disabled={safePage === 1} className={`px-3 py-3 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}>«</button>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className={`p-3 rounded-lg transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronLeft className="w-4 h-4" /></button>
                <span className={`px-3 py-1 text-xs font-bold ${dm ? 'text-white' : 'text-slate-700'}`}>{safePage} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className={`p-3 rounded-lg transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setPage(totalPages)} disabled={safePage === totalPages} className={`px-3 py-3 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${dm ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}>»</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Lihat Dokumen — responsif */}
      {viewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
          onClick={() => setViewDoc(null)}
        >
          <div
            className={`w-full sm:max-w-xl md:max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200 ${dm ? 'bg-[#0F172A] border border-slate-700' : 'bg-white'}`}
            style={{ maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle mobile */}
            <div className="flex justify-center pt-2 pb-0 sm:hidden">
              <div className={`w-10 h-1 rounded-full ${dm ? 'bg-slate-700' : 'bg-slate-200'}`} />
            </div>

            {/* Header */}
            <div className={`flex items-start justify-between px-4 py-3 border-b shrink-0 gap-3 ${dm ? 'border-slate-700 bg-[#0B1121]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-start gap-2 min-w-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider shrink-0 mt-0.5 ${dm ? JENIS_BADGE_DARK[viewDoc.jenis] : JENIS_BADGE[viewDoc.jenis]}`}>
                  {viewDoc.jenis === 'Peraturan Menteri' ? 'Permen' : 'Kepmen'}
                </span>
                <h3 className={`text-sm font-extrabold leading-snug line-clamp-2 ${dm ? 'text-white' : 'text-[#002855]'}`}>{viewDoc.nama}</h3>
              </div>
              <button onClick={() => setViewDoc(null)} className={`p-2.5 rounded-lg shrink-0 transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* PDF Viewer */}
            <div className="shrink-0" style={{ height: 'clamp(180px, 38vh, 360px)' }}>
              {viewDoc.link_drive ? (
                <iframe src={getEmbedUrl(viewDoc.link_drive)} className="w-full h-full border-0" allow="autoplay" title={viewDoc.nama} />
              ) : (
                <div className={`w-full h-full flex flex-col items-center justify-center gap-3 ${dm ? 'bg-[#151F32] text-slate-500' : 'bg-slate-50 text-slate-400'}`}>
                  <FileText className="w-10 h-10 opacity-20" />
                  <p className="text-xs font-medium">Tidak ada link dokumen</p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className={`px-4 py-3 border-t overflow-y-auto ${dm ? 'border-slate-700 bg-[#0B1121]' : 'border-slate-100 bg-slate-50'}`}>
              {viewDoc.tentang && (
                <p className={`text-xs mb-3 leading-relaxed line-clamp-3 ${dm ? 'text-slate-300' : 'text-slate-600'}`}>
                  <span className={`font-bold ${dm ? 'text-slate-200' : 'text-slate-700'}`}>Deskripsi: </span>
                  {viewDoc.tentang}
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {viewDoc.nomor && (
                  <div className={`p-2.5 rounded-lg ${dm ? 'bg-[#151F32] border border-slate-800' : 'bg-white border border-slate-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Nomor</p>
                    <p className={`text-[11px] font-mono font-semibold break-all ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{viewDoc.nomor}</p>
                  </div>
                )}
                <div className={`p-2.5 rounded-lg ${dm ? 'bg-[#151F32] border border-slate-800' : 'bg-white border border-slate-100'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Tahun</p>
                  <p className={`text-[11px] font-bold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{viewDoc.tahun || '—'}</p>
                </div>
                {viewDoc.tanggal_ditetapkan && (
                  <div className={`p-2.5 rounded-lg ${dm ? 'bg-[#151F32] border border-slate-800' : 'bg-white border border-slate-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>Ditetapkan</p>
                    <p className={`text-[10px] font-semibold ${dm ? 'text-slate-300' : 'text-slate-700'}`}>{formatTanggal(viewDoc.tanggal_ditetapkan)}</p>
                  </div>
                )}
              </div>
              {viewDoc.link_drive && (
                <div className="mt-3 flex justify-end">
                  <a href={viewDoc.link_drive} target="_blank" rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-sm ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                    <ExternalLink className="w-3.5 h-3.5" /> Buka Dokumen
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Form Tambah/Edit */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-5 border-b shrink-0 ${dm ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${dm ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <FilePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${dm ? 'text-white' : 'text-[#002855]'}`}>
                    {editingId ? 'Edit Peraturan' : 'Tambah Peraturan Baru'}
                  </h3>
                  <p className={`text-xs mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>Lengkapi form di bawah ini.</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className={`p-2 rounded-xl transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimpan} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Nama */}
              <div>
                <label className={labelCls}>Nama Peraturan <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.nama} onChange={e => setFormData({ ...formData, nama: e.target.value })} placeholder="Cth: Peraturan Menteri ATR/BPN Nomor 5 Tahun 2024 tentang ..." className={inputCls} />
              </div>

              {/* Jenis + Nomor + Tahun */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className={labelCls}>Jenis Peraturan</label>
                  <select value={formData.jenis} onChange={e => setFormData({ ...formData, jenis: e.target.value as 'Peraturan Menteri' | 'Keputusan Menteri' })} className={inputCls}>
                    <option value="Peraturan Menteri">Peraturan Menteri (Permen)</option>
                    <option value="Keputusan Menteri">Keputusan Menteri (Kepmen)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Nomor Peraturan</label>
                  <input type="text" value={formData.nomor} onChange={e => setFormData({ ...formData, nomor: e.target.value })} placeholder="Cth: 5 atau 5/2024" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tahun Terbit</label>
                  <input required type="number" min="1990" max="2099" value={formData.tahun} onChange={e => setFormData({ ...formData, tahun: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Tanggal Ditetapkan */}
              <div>
                <label className={labelCls}>Tanggal Ditetapkan</label>
                <input type="date" value={formData.tanggal_ditetapkan} onChange={e => setFormData({ ...formData, tanggal_ditetapkan: e.target.value })} className={`${inputCls} ${dm ? 'scheme-dark' : ''}`} />
              </div>

              {/* Tentang */}
              <div>
                <label className={labelCls}>Tentang / Deskripsi Singkat</label>
                <textarea rows={3} value={formData.tentang} onChange={e => setFormData({ ...formData, tentang: e.target.value })} placeholder="Pokok bahasan atau deskripsi singkat peraturan ini..." className={`${inputCls} resize-none`} />
              </div>

              {/* Pilih File dari Drive */}
              <div>
                <label className={labelCls}>File Dokumen (Google Drive) <span className="text-red-500">*</span></label>
                {formData.link_drive ? (
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${dm ? 'bg-emerald-900/20 border-emerald-700' : 'bg-emerald-50 border-emerald-200'}`}>
                    <FileCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${dm ? 'text-emerald-400' : 'text-emerald-700'}`}>File terpilih</p>
                      <p className={`text-xs truncate mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-500'}`}>{formData.link_drive}</p>
                    </div>
                    <a href={formData.link_drive} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-600 shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button type="button" onClick={() => setFormData({ ...formData, link_drive: '' })} className="text-slate-400 hover:text-red-400 shrink-0 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={openDrivePicker}
                  className={`mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl font-bold text-sm transition-all ${
                    dm ? 'border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-400 hover:bg-blue-900/10'
                       : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <FolderOpen className="w-4 h-4" />
                  {formData.link_drive ? 'Ganti File dari Drive' : 'Pilih File dari Google Drive'}
                </button>
              </div>

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-400/30 rounded-xl">
                  <p className="text-red-500 text-sm font-medium">{saveError}</p>
                </div>
              )}

              <div className={`pt-4 border-t flex justify-end gap-3 ${dm ? 'border-slate-800' : 'border-slate-100'}`}>
                <button type="button" onClick={() => setShowForm(false)} className={`px-5 py-2.5 font-extrabold rounded-xl transition-colors text-sm ${dm ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}>Batal</button>
                <button type="submit" disabled={saving} className={`px-7 py-2.5 font-extrabold rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center gap-2 text-sm ${dm ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'}`}>
                  {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Simpan Perubahan' : 'Simpan Peraturan'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Drive Picker — navigasi folder seperti import data */}
      {showDrivePicker && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md max-h-[75vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${dm ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>

            {/* Header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${dm ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-2">
                <FolderOpen className={`w-4 h-4 ${dm ? 'text-blue-400' : 'text-blue-600'}`} />
                <span className={`font-extrabold text-sm ${dm ? 'text-white' : 'text-[#002855]'}`}>Pilih File dari Google Drive</span>
              </div>
              <button onClick={() => setShowDrivePicker(false)} className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className={`flex items-center gap-1 px-4 py-2 text-xs font-medium border-b shrink-0 flex-wrap ${dm ? 'border-slate-800 text-slate-400 bg-[#0F172A]' : 'border-slate-100 text-slate-500 bg-slate-50'}`}>
              <button onClick={() => { setDriveStack([]); fetchDriveFolder(DRIVE_ROOT); }} className="hover:underline font-bold shrink-0">
                Drive
              </button>
              {driveStack.map((f, i) => (
                <React.Fragment key={f.id}>
                  <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />
                  <button onClick={() => {
                    const newStack = driveStack.slice(0, i + 1);
                    setDriveStack(newStack);
                    fetchDriveFolder(f.id);
                  }} className="hover:underline truncate max-w-[120px]">{f.name}</button>
                </React.Fragment>
              ))}
            </div>

            {/* Tombol Kembali */}
            {driveStack.length > 0 && (
              <button onClick={driveGoBack} className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b shrink-0 transition-colors ${dm ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                <ArrowLeft className="w-3 h-3" /> Kembali
              </button>
            )}

            {/* Konten folder */}
            <div className="flex-1 overflow-y-auto">
              {driveLoading && (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Memuat dari Google Drive...</span>
                </div>
              )}
              {driveError && !driveLoading && (
                <div className="p-4">
                  <div className={`p-4 rounded-xl flex gap-3 items-start ${dm ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
                    <span className="font-bold text-sm">{driveError}</span>
                    <button onClick={() => fetchDriveFolder(driveStack.length > 0 ? driveStack[driveStack.length - 1].id : DRIVE_ROOT)} className="text-xs underline ml-auto shrink-0">Coba lagi</button>
                  </div>
                </div>
              )}
              {!driveLoading && !driveError && (
                <>
                  {/* Folder */}
                  {driveFolders.map(f => (
                    <button key={f.id} type="button" onClick={() => driveNavigateTo(f)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium border-b transition-colors ${dm ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-50 text-slate-700 hover:bg-slate-50'}`}>
                      <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
                      <span className="truncate text-left flex-1">{f.name}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                  {/* File */}
                  {driveFiles.map(f => (
                    <button key={f.id} type="button" onClick={() => selectDriveFile(f)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b transition-colors ${
                        formData.link_drive === f.webViewLink
                          ? dm ? 'bg-blue-700/30 text-blue-300 font-bold' : 'bg-blue-50 text-blue-700 font-bold'
                          : dm ? 'border-slate-800 text-slate-300 hover:bg-slate-800 font-medium' : 'border-slate-50 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}>
                      <FileText className="w-4 h-4 text-red-400 shrink-0" />
                      <span className="truncate text-left flex-1">{f.name}</span>
                      {formData.link_drive === f.webViewLink
                        ? <FileCheck className="w-4 h-4 text-blue-500 shrink-0" />
                        : <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase shrink-0 ${dm ? 'bg-red-900/40 text-red-400' : 'bg-red-100 text-red-600'}`}>PDF</span>
                      }
                    </button>
                  ))}
                  {driveFolders.length === 0 && driveFiles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <Inbox className="w-10 h-10 mb-2 opacity-30" />
                      <p className="text-sm">Folder kosong.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
