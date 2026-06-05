"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Plus, GitBranch, Edit, CheckCircle, 
  Clock, XCircle, Search, X, FileEdit, FileStack, AlertCircle, Filter,
  Trash2, Calendar, GitCommit // Tambahan icon Calendar dan GitCommit
} from 'lucide-react';

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

interface BPMNModel {
  id: number; process_title: string; process_key: string; l1_id: number | null; l2_id: number | null;
  description: string | null; bpmn_xml: string | null; svg_xml: string | null;
  status: string; catatan?: string | null;
  version: number; created_by: number; created_at: string; updated_at: string;
  unit_l1?: string; unit_l2?: string;
}

interface AuthUser {
  id: number; username: string; role: string;
  unit_l1?: string; unit_l2?: string;
}

export default function BPMNDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [savedModels, setSavedModels] = useState<BPMNModel[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterUnit, setFilterUnit] = useState('Semua');
  const [filterStatus, setFilterStatus] = useState('Semua');

  const [rejectModal, setRejectModal] = useState({ isOpen: false, modelId: 0, note: '' });

  useEffect(() => {
    const initAuth = async () => {
      const tok = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (!tok || !userStr) { router.replace('/login'); return; }
      try { 
        setCurrentUser(JSON.parse(userStr)); 
        setToken(tok); 
      } catch { 
        router.replace('/login'); 
      }
    };
    initAuth();
  }, [router]);

  useEffect(() => {
    if (!token || !currentUser) return;
    
    apiFetch('/bpmn/models', token)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          if (currentUser.role === 'admin') {
            setSavedModels(data);
          } else {
            const userL1 = currentUser.unit_l1?.trim().toLowerCase();
            const userL2 = currentUser.unit_l2?.trim().toLowerCase();

            const filteredByUnit = data.filter((m: BPMNModel) => {
              if (m.created_by === currentUser.id) return true;
              const modelL1 = m.unit_l1?.trim().toLowerCase();
              const modelL2 = m.unit_l2?.trim().toLowerCase();

              if (userL1 && (!userL2 || userL2 === '' || userL2 === 'seluruh unit')) {
                return modelL1 === userL1;
              }
              if (userL1 && userL2) {
                return modelL1 === userL1 && modelL2 === userL2;
              }
              return false;
            });
            setSavedModels(filteredByUnit);
          }
        }
      })
      .catch(err => console.error("Gagal mengambil data model:", err))
      .finally(() => setLoading(false));
  }, [token, currentUser]);

  const currentFilteredModels = useMemo(() => {
    return savedModels.filter(m => {
      const matchesSearch = m.process_title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           m.process_key.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesUnit = filterUnit === 'Semua' || m.unit_l1 === filterUnit;
      const currentStatus = (m.status || 'draft').toLowerCase();
      const targetStatus = filterStatus.toLowerCase();
      const matchesStatus = filterStatus === 'Semua' || currentStatus === targetStatus;

      return matchesSearch && matchesUnit && matchesStatus;
    });
  }, [savedModels, searchQuery, filterUnit, filterStatus]);

  const listUnitL1 = useMemo(() => {
    const units = savedModels.map(m => m.unit_l1).filter(Boolean);
    return ['Semua', ...Array.from(new Set(units))];
  }, [savedModels]);

  const deleteModel = async (modelId: number) => {
    if (!window.confirm('Yakin ingin menghapus dokumen ini?')) return;
    try {
      const res = await apiFetch(`/bpmn/models/${modelId}`, token, { method: 'DELETE' });
      if (res.ok) {
        setSavedModels(prev => prev.filter(m => m.id !== modelId));
        alert('Berhasil dihapus.');
      }
    } catch (err) { console.error(err); }
  };

  const handleApprove = async (model: BPMNModel) => {
    if (!window.confirm(`Setujui dokumen "${model.process_title}"?`)) return;
    try {
      const res = await apiFetch(`/bpmn/models/status/${model.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved', catatan: '' })
      });
      if (res.ok) {
        const docBody = {
          nama: model.process_title, jenis: "Proses Bisnis",
          tahun: new Date().getFullYear().toString(), l1_id: model.l1_id, l2_id: model.l2_id,
          link: `/bpmn?id=${model.id}&mode=view`, status: 'approved'
        };
        await apiFetch('/dokumen', token, { method: 'POST', body: JSON.stringify(docBody) });
        setSavedModels(prev => prev.map(m => m.id === model.id ? { ...m, status: 'approved', catatan: '' } : m));
        alert('Dokumen disetujui!');
      }
    } catch (err) { console.error(err); }
  };

  const submitReject = async () => {
    if (!rejectModal.note.trim()) return alert('Catatan tidak boleh kosong.');
    try {
      const res = await apiFetch(`/bpmn/models/status/${rejectModal.modelId}`, token, {
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
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      
      {/* MODAL REVISI (TETAP ADA UNTUK ADMIN) */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-red-600 flex items-center gap-2"><XCircle className="w-5 h-5" /> Revisi Dokumen</h3>
              <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '' })} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <textarea 
                rows={6} 
                placeholder="Tuliskan poin revisi..."
                value={rejectModal.note}
                onChange={(e) => setRejectModal({...rejectModal, note: e.target.value})}
                className="w-full border border-slate-400 rounded-xl p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500 bg-white text-slate-900 shadow-inner"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setRejectModal({ isOpen: false, modelId: 0, note: '' })} className="px-5 py-2.5 text-sm font-bold text-slate-600">Batal</button>
                <button onClick={submitReject} className="px-6 py-2.5 text-sm font-bold bg-red-600 text-white rounded-xl shadow-md">Kirim Catatan</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><GitBranch className="w-5 h-5" /></div>
              <div>
                <h1 className="text-xl font-bold text-[#002855] leading-none">Ruang Kerja BPMN</h1>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {currentUser.role === 'admin' ? 'Manajemen Pengajuan (Pusat)' : `${currentUser.unit_l1} ${currentUser.unit_l2 ? '> ' + currentUser.unit_l2 : ''}`}
                </p>
              </div>
            </div>
          </div>
          <button onClick={() => router.push('/bpmn/studio')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md flex items-center gap-2 font-bold transition-all"><Plus className="w-5 h-5" /> Buat BPMN Baru</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* STATS SUMMARY */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Unit Anda</p>
              <p className="text-3xl font-black text-[#002855]">{currentFilteredModels.length}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-slate-400"><FileStack className="w-6 h-6" /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-slate-400 flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Draft Internal</p>
              <p className="text-3xl font-black text-slate-700">{currentFilteredModels.filter(m => !m.status || m.status === 'draft').length}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl text-slate-400"><FileEdit className="w-6 h-6" /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500 flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Menunggu</p>
              <p className="text-3xl font-black text-blue-600">{currentFilteredModels.filter(m => m.status === 'pending').length}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl text-blue-400"><Clock className="w-6 h-6" /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500 flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Disetujui</p>
              <p className="text-3xl font-black text-emerald-600">{currentFilteredModels.filter(m => m.status === 'approved').length}</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-400"><CheckCircle className="w-6 h-6" /></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-red-500 flex justify-between items-center transition-all hover:shadow-md">
            <div>
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Perlu Revisi</p>
              <p className="text-3xl font-black text-red-600">{currentFilteredModels.filter(m => m.status === 'rejected').length}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-xl text-red-400"><AlertCircle className="w-6 h-6" /></div>
          </div>
        </div>

        {/* TABEL DATA */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-50/50">
            <h2 className="text-lg font-bold text-[#002855] shrink-0">Daftar Pengajuan Proses Bisnis</h2>
            
            <div className="flex flex-col md:flex-row items-center gap-3 w-full xl:justify-end">
              {currentUser.role === 'admin' && (
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Filter className="h-4 w-4 text-slate-400" /></div>
                  <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="Semua">Unit Kerja: Semua</option>
                    {listUnitL1.filter(u => u !== 'Semua').map(unit => (<option key={unit as string} value={unit as string}>{unit as string}</option>))}
                  </select>
                </div>
              )}

              <div className="relative w-full md:w-48">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="Semua">Status: Semua</option>
                  <option value="draft">Status: Draft</option>
                  <option value="pending">Status: Pending</option>
                  <option value="approved">Status: Approved</option>
                  <option value="rejected">Status: Rejected</option>
                </select>
              </div>

              <div className="relative w-full md:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-4 w-4 text-slate-400" /></div>
                <input type="text" placeholder="Cari judul atau kode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] text-slate-500 font-bold uppercase tracking-wider bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 w-1/3">Informasi Dokumen</th>
                  <th className="px-6 py-4 w-1/4">Unit Kerja</th>
                  <th className="px-6 py-4">Status Pengajuan</th>
                  <th className="px-6 py-4 text-center w-48">Aksi / Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Memuat data...</td></tr>
                ) : currentFilteredModels.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <Search className="w-12 h-12 text-slate-200 mb-3" />
                        <p className="text-slate-500 font-medium text-base">Tidak ada dokumen yang ditemukan.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentFilteredModels.map((model) => (
                    <tr key={model.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <button onClick={() => router.push(`/bpmn/studio?id=${model.id}&mode=view`)} className="font-bold text-[#002855] text-base text-left hover:text-blue-600 hover:underline">
                          {model.process_title}
                        </button>
                        
                        {/* PENAMBAHAN TANGGAL & VERSI DI SINI */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            ID: {model.process_key}
                          </span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                            <Calendar className="w-3 h-3" />
                            {new Date(model.updated_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200" title="Total perubahan yang sudah disimpan">
                            <GitCommit className="w-3 h-3" />
                            Versi {model.version}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-700">{model.unit_l1 || '-'}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{model.unit_l2 || ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                            model.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            model.status === 'pending' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            model.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
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
                          <button onClick={() => router.push(`/bpmn/studio?id=${model.id}`)} className="px-3 py-2 text-blue-600 hover:bg-blue-50 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 border border-transparent hover:border-blue-200"><Edit className="w-4 h-4" /> Buka</button>
                          
                          {currentUser.role === 'admin' && model.status !== 'approved' && (
                            <div className="flex ml-2 border-l pl-2 gap-2 border-slate-200">
                              <button onClick={() => handleApprove(model)} className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-500 hover:text-white text-emerald-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Setujui</button>
                              <button onClick={() => setRejectModal({ isOpen: true, modelId: model.id, note: model.catatan || '' })} className="px-3 py-1.5 bg-red-100 hover:bg-red-500 hover:text-white text-red-700 text-[10px] font-extrabold rounded-lg uppercase transition-all shadow-sm">Tolak</button>
                            </div>
                          )}

                          {(currentUser.role === 'admin' || (model.created_by === currentUser.id && (model.status === 'draft' || model.status === 'rejected' || !model.status))) && (
                            <button onClick={() => deleteModel(model.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Hapus Dokumen">
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
        </div>
      </div>
    </div>
  );
}