"use client";
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit, Trash2, X, Building2,
  ShieldCheck, UserCheck, KeyRound, Eye, EyeOff, Download
} from 'lucide-react';

import { useRouter } from 'next/navigation';
import { HIERARKI_UNIT } from '@/lib/constants';
import * as XLSX from 'xlsx';

// KONFIGURASI PATH
const BASE_PATH = '/e-sop-atrbpn';
const API_URL = `${BASE_PATH}/api/users`;

interface User {
  id: number; username: string; nama_lengkap: string; email: string;
  role: string; active: boolean; last_login: string;
  unit_l1?: string; unit_l2?: string; plain_password?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    username: '', password: '', nama_lengkap: '', email: '', 
    role: 'user', active: true, unit_l1: '', unit_l2: ''
  });

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setUsers(await res.json());
    } catch (err) { console.error("Gagal load users:", err); } 
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // CATATAN: Jika error 404 berlanjut, pastikan di backend sudah ada route: router.put('/:id', ...)
      const url = editingUser ? `${API_URL}/${editingUser.id}` : API_URL;
      const method = editingUser ? 'PUT' : 'POST';

      const noUnit = formData.role === 'admin' || formData.role === 'viewer';
      const submissionData = {
        ...formData,
        id: editingUser?.id,
        unit_l1: noUnit ? 'PUSAT' : formData.unit_l1,
        unit_l2: noUnit ? 'SELURUH UNIT' : formData.unit_l2
      };

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(submissionData)
      });
      
      if (res.ok) {
        setShowModal(false);
        fetchUsers();
        alert("Sip! Data user berhasil disimpan.");
      } else {
        const errorHTML = await res.text();
        console.error("Detail Error Server:", errorHTML);
        alert(`Gagal menyimpan data user (Status: ${res.status}). Silakan coba lagi atau hubungi administrator.`);
      }
    } catch (err) { 
      console.error("Submit error:", err);
      alert("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus user ini?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchUsers();
    } catch (err) { console.error(err); }
  };

  const openModal = (user?: User) => {
    setShowPassword(false);
    if (user) {
      setEditingUser(user);
      setFormData({
        username: user.username, password: '', nama_lengkap: user.nama_lengkap || '',
        email: user.email || '', role: user.role, active: user.active,
        unit_l1: user.unit_l1 || '', unit_l2: user.unit_l2 || ''
      });
    } else {
      setEditingUser(null);
      setFormData({ username: '', password: '', nama_lengkap: '', email: '', role: 'user', active: true, unit_l1: '', unit_l2: '' });
    }
    setShowModal(true);
  };

  const availableL2 = useMemo(() => {
    return formData.unit_l1 && HIERARKI_UNIT[formData.unit_l1] ? Object.keys(HIERARKI_UNIT[formData.unit_l1]) : [];
  }, [formData.unit_l1]);

  const handleDownloadExcel = () => {
    const roleLabel = (role: string) =>
      role === 'admin' ? 'Admin' : role === 'viewer' ? 'Viewer' : 'User (Terbatas)';

    const rows = users.map(u => ({
      'Nama Lengkap': u.nama_lengkap || '-',
      'Hak Akses': roleLabel(u.role),
      'Username': u.username,
      'Password': u.plain_password || '(belum diset ulang)',
      'Unit Kerja Level 1': (u.role === 'user' ? u.unit_l1 : '-') || '-',
      'Unit Kerja Level 2': (u.role === 'user' ? u.unit_l2 : '-') || '-',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 55 }, { wch: 45 },
    ];

    // Style header row bold (xlsx-js doesn't support rich styling without xlsx-style, apply freeze pane only)
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, 'Data Pengguna');
    XLSX.writeFile(wb, 'Data_Pengguna_SIMPEL.xlsx');
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 text-slate-900 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className="text-sm text-slate-500">Kelola akun dan hak akses pengguna sistem</p>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
          >
            <Download className="w-4 h-4" /> Unduh Excel
          </button>
          <button onClick={() => openModal()} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4" /> Tambah User Baru
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center font-bold text-slate-400 italic">Menghubungkan ke server...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Identitas User</th>
                <th className="px-6 py-4">Unit Penempatan</th>
                <th className="px-6 py-4 text-center">Hak Akses</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-6 py-4">
                    <p className="font-bold text-[#002855] text-sm">{user.nama_lengkap || user.username}</p>
                    <p className="text-xs font-mono text-slate-500">@{user.username}</p>
                  </td>
                  <td className="px-6 py-4">
                    {(user.role === 'admin' || user.role === 'viewer') ? (
                      <span className="text-xs font-bold text-slate-400 italic">
                        {user.role === 'viewer' ? 'Lihat Saja' : 'Akses Lintas Unit'}
                      </span>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-700 leading-tight">{user.unit_l1}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{user.unit_l2 || 'Level 1'}</p>
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                      user.role === 'admin'
                        ? 'bg-purple-50 text-purple-600 border-purple-100'
                        : user.role === 'viewer'
                          ? 'bg-teal-50 text-teal-600 border-teal-100'
                          : 'bg-blue-50 text-blue-600 border-blue-100'
                    }`}>
                      {user.role === 'admin' ? 'Admin' : user.role === 'viewer' ? 'Viewer' : 'User (Terbatas)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-1">
                      <button onClick={() => openModal(user)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(user.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-[#002855]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-xl shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-[#002855] flex items-center gap-2">
                <UserCheck className="w-6 h-6 text-blue-600" />
                {editingUser ? 'Edit Data Pengguna' : 'Tambah Pengguna Baru'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Username</label>
                  <input 
                    type="text" 
                    value={formData.username} 
                    onChange={e => setFormData({...formData, username: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
                    required 
                    autoComplete="off" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Hak Akses (Role)</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-[#002855] outline-none focus:ring-2 focus:ring-blue-500 shadow-sm">
                    <option value="user">User (Terbatas)</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Password {editingUser && '(Kosongkan jika tidak ganti)'}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                    className="w-full pl-10 pr-12 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
                    required={!editingUser} 
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2 p-1 text-slate-400 hover:text-blue-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama Lengkap</label>
                <input type="text" value={formData.nama_lengkap} onChange={e => setFormData({...formData, nama_lengkap: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" required />
              </div>

              {formData.role !== 'admin' && formData.role !== 'viewer' && (
                <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-3 h-3" /> Penempatan Unit Kerja
                  </p>
                  
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Kerja Level 1</label>
                    <select 
                      value={formData.unit_l1} 
                      onChange={e => setFormData({...formData, unit_l1: e.target.value, unit_l2: ''})} 
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" 
                      required
                    >
                      <option value="">-- Pilih Unit Kerja L1 --</option>
                      {Object.keys(HIERARKI_UNIT).map(l1 => (
                        <option key={l1} value={l1}>{l1}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Kerja Level 2 (Opsional)</label>
                    <select 
                      value={formData.unit_l2} 
                      onChange={e => setFormData({...formData, unit_l2: e.target.value})} 
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm disabled:opacity-50" 
                      disabled={!formData.unit_l1}
                    >
                      <option value="">-- Pilih Unit Kerja L2 (Opsional) --</option>
                      {availableL2.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {formData.role === 'admin' && (
                <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <ShieldCheck className="w-10 h-10 text-purple-500" />
                  <div>
                    <p className="text-sm font-bold text-purple-700">Administrator System</p>
                    <p className="text-[10px] text-purple-500 font-medium">Akses penuh lintas seluruh unit kerja Kementerian ATR/BPN.</p>
                  </div>
                </div>
              )}

              {formData.role === 'viewer' && (
                <div className="flex items-center gap-3 p-4 bg-teal-50 border border-teal-100 rounded-2xl">
                  <Eye className="w-10 h-10 text-teal-500" />
                  <div>
                    <p className="text-sm font-bold text-teal-700">Viewer (Lihat Saja)</p>
                    <p className="text-[10px] text-teal-500 font-medium">Hanya dapat melihat Dashboard dan Juknis/Juklak/SE. Tidak memerlukan unit kerja.</p>
                  </div>
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full py-4 bg-[#002855] text-white font-black rounded-2xl hover:bg-blue-900 transition shadow-xl shadow-blue-100 mt-4 uppercase tracking-widest text-sm disabled:bg-slate-400">
                {loading ? 'Memproses...' : (editingUser ? 'Simpan Perubahan' : 'Daftarkan Pengguna')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}