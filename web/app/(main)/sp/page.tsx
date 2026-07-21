'use client';

// Standar Pelayanan (SP) — modul baru. Saat ini diisi lewat Usulan & Dokumen
// Manual (belum ada studio penyusun). Struktur meniru modul BPMN/SOP:
// tab Daftar Usulan · Proses Penyusunan · Daftar Standar Pelayanan (terbit),
// dengan rekap per Unit Kerja (L1 → L2) untuk admin/superadmin.
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, CheckCircle, Search, FileEdit, FileSignature, Stamp, Trash2,
  Calendar, ChevronRight, Building2, FileUp, ExternalLink, FileSpreadsheet,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';
import { HIERARKI_UNIT } from '@/lib/constants';
import ManualDocModal from '@/components/ManualDocModal';
import ManualDocDetailModal from '@/components/ManualDocDetailModal';
import ManualDocImportModal from '@/components/ManualDocImportModal';

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
}
interface AuthUser { id: number; username: string; role: string; unit_l1?: string; unit_l2?: string }

export default function SPPage() {
  const router = useRouter();
  const { isDarkMode } = useAppContext();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState('');
  const [models, setModels] = useState<SPModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [listTab, setListTab] = useState<'usulan' | 'penyusunan' | 'terbit'>('terbit');
  const [rekapDrill, setRekapDrill] = useState<{ l1: string | null; l2: string | null }>({ l1: null, l2: null });
  const [searchQuery, setSearchQuery] = useState('');
  // Dari klik notifikasi: /halaman?q=<judul> → langsung terisi di pencarian.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setSearchQuery(q);
  }, []);
  const [showManualDoc, setShowManualDoc] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [detailModel, setDetailModel] = useState<SPModel | null>(null);
  const [usulanForm, setUsulanForm] = useState({ isOpen: false, title: '', l1: '', l2: '' });
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

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch('/sp/models', token)
      .then(r => r.ok ? r.json() : [])
      .then(data => setModels(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [token]);

  const isAdmin = currentUser?.role === 'admin';
  const filtered = useMemo(() => models.filter(m =>
    !searchQuery || m.process_title.toLowerCase().includes(searchQuery.toLowerCase())
  ), [models, searchQuery]);

  const tabOf = (s?: string) => s === 'usulan' ? 'usulan' : s === 'terbit' ? 'terbit' : 'penyusunan';

  // Rekap per unit (admin): tab Usulan & Penyusunan — sama seperti BPMN/SOP.
  const isAdminRekap = isAdmin && (listTab === 'penyusunan' || listTab === 'usulan');
  const rekapDataset = useMemo(() => (
    listTab === 'usulan'
      ? filtered.filter(m => m.status === 'usulan')
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const statusBadge = (s: string) => {
    const map: Record<string, [string, string]> = {
      usulan: ['USULAN', isDarkMode ? 'bg-slate-700/60 text-slate-200 border-slate-600' : 'bg-slate-100 text-slate-600 border-slate-200'],
      draft: ['DRAFT', 'bg-indigo-50 text-indigo-700 border-indigo-200'],
      pending: ['REVIEW ORTALA MR', 'bg-blue-50 text-blue-700 border-blue-200'],
      penetapan: ['PENGESAHAN PIMPINAN', 'bg-violet-50 text-violet-700 border-violet-200'],
      verifikasi: ['VERIFIKASI TTD', 'bg-cyan-50 text-cyan-700 border-cyan-200'],
      rejected: ['PERLU REVISI', 'bg-red-50 text-red-700 border-red-200'],
      terbit: ['TERBIT', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
    };
    const [label, cls] = map[s] || [s?.toUpperCase() || '-', 'bg-slate-100 text-slate-600 border-slate-200'];
    return <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cls}`}>{label}</span>;
  };

  const handleDelete = async (m: SPModel) => {
    if (!window.confirm(`Hapus "${m.process_title}"?${m.is_manual ? '\n\nDokumen manual (file/tautan) ikut terhapus.' : ''}`)) return;
    const res = await apiFetch(`/sp/models/${m.id}`, token, { method: 'DELETE' });
    if (res.ok) setModels(prev => prev.filter(x => x.id !== m.id));
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {isAdmin ? 'Manajemen Standar Pelayanan (Pusat)' : `${currentUser.unit_l1}${currentUser.unit_l2 ? ' › ' + currentUser.unit_l2 : ''}`}
        </p>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isSuperadmin && (
            <button onClick={() => setShowImport(true)} className={`px-4 py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-900/30' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
              <FileSpreadsheet className="w-4 h-4" /> Impor Excel
            </button>
          )}
          <button onClick={() => setShowManualDoc(true)} className={`px-4 py-3 border rounded-xl flex items-center gap-2 font-bold text-sm transition-all ${isDarkMode ? 'border-amber-700 text-amber-400 hover:bg-amber-900/30' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}`}>
            <FileUp className="w-4 h-4" /> Dokumen Manual
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border shadow-sm overflow-hidden ${card}`}>
        {/* Tabs + cari */}
        <div className={`p-4 sm:p-5 border-b flex flex-col gap-3 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]/50' : 'border-slate-200 bg-slate-50/50'}`}>
          <div className={`flex gap-1 p-1 rounded-xl overflow-x-auto ${isDarkMode ? 'bg-[#0F172A] border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
            {([
              { key: 'usulan', icon: FileEdit, label: 'Daftar Usulan', count: countUsulan },
              { key: 'penyusunan', icon: FileSignature, label: 'Proses Penyusunan', count: countPenyusunan },
              { key: 'terbit', icon: Stamp, label: 'Daftar Standar Pelayanan', count: countTerbit },
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
            <p className={`text-xs mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{rekapDrill.l1 === null ? `Rekap ${listTab === 'usulan' ? 'usulan' : 'dokumen'} per Unit Kerja Level 1. Klik baris untuk melihat sub-unit (Level 2).` : 'Klik sub-unit untuk melihat daftar dokumennya.'}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className={`text-[10px] font-bold uppercase tracking-wide border-b ${isDarkMode ? 'text-slate-400 bg-slate-800/50 border-slate-700' : 'text-slate-500 bg-slate-50/80 border-slate-200'}`}>
                  <tr>
                    <th className="px-4 py-3 text-left">{rekapDrill.l1 === null ? 'Unit Kerja (Level 1)' : 'Sub-Unit (Level 2)'}</th>
                    {listTab === 'usulan' ? (
                      <th className="px-2 py-3 text-center">Jumlah Usulan</th>
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
                    <tr><td colSpan={listTab === 'usulan' ? 3 : 8} className={`px-4 py-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{listTab === 'usulan' ? 'Belum ada usulan.' : 'Tidak ada dokumen dalam proses penyusunan.'}</td></tr>
                  ) : rekapRows.map(row => (
                    <tr key={row.nama} onClick={() => setRekapDrill(rekapDrill.l1 === null ? { l1: row.nama, l2: null } : { l1: rekapDrill.l1, l2: row.nama })} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/50'}`}>
                      <td className={`px-4 py-3 font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{row.nama}</td>
                      {listTab === 'usulan' ? (
                        <td className="px-2 py-3 text-center"><span className={`inline-flex min-w-8 justify-center px-2.5 py-1 rounded-lg text-xs font-black text-white ${isDarkMode ? 'bg-teal-600' : 'bg-[#002855]'}`}>{row.usulan}</span></td>
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
                  <th className="px-6 py-4 text-center">Aksi</th>
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
                  <tr key={m.id} className={`transition-colors ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-teal-50/40'}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => { if (m.is_manual) setDetailModel(m); }}
                        className={`font-bold text-base text-left ${m.is_manual ? 'hover:underline cursor-pointer' : 'cursor-default'} ${isDarkMode ? 'text-white hover:text-teal-400' : 'text-[#002855] hover:text-teal-600'}`}>
                        {m.process_title}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {m.is_manual && (
                          <button onClick={() => setDetailModel(m)} title="Lihat Dokumen"
                            className={`p-2 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-700 text-teal-400 hover:bg-teal-900/30' : 'border-slate-200 text-teal-600 hover:bg-teal-50'}`}>
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                        {(isAdmin || m.created_by === currentUser.id) && (
                          <button onClick={() => handleDelete(m)} title="Hapus"
                            className={`p-2 rounded-lg border transition-colors ${isDarkMode ? 'border-slate-700 text-red-400 hover:bg-red-900/30' : 'border-slate-200 text-red-500 hover:bg-red-50'}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>

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

      {/* Impor Excel massal (superadmin) */}
      {showImport && currentUser && (
        <ManualDocImportModal
          kind="sp"
          token={token}
          isDarkMode={isDarkMode}
          onClose={() => setShowImport(false)}
          onImported={(rows, masuk) => {
            setModels(prev => [...(rows as unknown as SPModel[]), ...prev]);
            setListTab(masuk === 'final' ? 'terbit' : 'penyusunan');
          }}
        />
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
        Studio penyusun Standar Pelayanan belum tersedia — untuk saat ini dokumen jadi diunggah lewat <b>Dokumen Manual</b>, dan rencana penyusunan dicatat lewat <b>Tambah Usulan SP</b>.
      </div>
    </div>
  );
}
