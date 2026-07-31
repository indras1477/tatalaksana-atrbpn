"use client";
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Edit, Trash2, X, Building2,
  ShieldCheck, UserCheck, KeyRound, Eye, EyeOff, Download,
  Activity, Monitor, Clock, Wifi, WifiOff
} from 'lucide-react';

import { useRouter } from 'next/navigation';
import { HIERARKI_UNIT } from '@/lib/constants';
import { useAppContext } from '@/lib/app-context';
import * as XLSX from 'xlsx';

const BASE_PATH = '/e-sop-atrbpn';
const API_URL   = `${BASE_PATH}/api/users`;

interface User {
  id: number; username: string; nama_lengkap: string; email: string;
  role: string; active: boolean; last_login: string;
  unit_l1?: string; unit_l2?: string; plain_password?: string;
  active_sessions?: number;
}

interface ActiveSession {
  user_id: number; username: string; nama_lengkap: string; role: string;
  login_time: string; expires_at: string; ip_address: string; user_agent: string;
}

interface LoginEvent {
  created_at: string; username: string; nama_lengkap: string;
  role: string; ip_address: string;
}

function parseUA(ua: string | null) {
  if (!ua) return 'Browser Tidak Diketahui';
  if (/iPhone/i.test(ua))  return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Edg/i.test(ua))     return 'Microsoft Edge';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome/i.test(ua))  return 'Google Chrome';
  if (/Safari/i.test(ua))  return 'Safari';
  return 'Browser';
}

function fmtDt(dt: string | null) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'bg-amber-50 text-amber-600 border-amber-100',
  admin:      'bg-purple-50 text-purple-600 border-purple-100',
  viewer:     'bg-teal-50 text-teal-600 border-teal-100',
  user:       'bg-blue-50 text-blue-600 border-blue-100',
};
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin', admin: 'Admin', viewer: 'Viewer', user: 'User (Terbatas)',
};

export default function UsersPage() {
  const router = useRouter();
  const { isDarkMode } = useAppContext();
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editingUser,  setEditingUser]  = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [revealFor,    setRevealFor]    = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');

  // Aktivitas akses
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loginHistory,   setLoginHistory]   = useState<LoginEvent[]>([]);
  const [actLoading,     setActLoading]     = useState(false);

  const [formData, setFormData] = useState({
    username: '', password: '', nama_lengkap: '', email: '',
    role: 'user', active: true, unit_l1: '', unit_l2: ''
  });

  // Deteksi role saat ini dari localStorage
  const currentUser = useMemo(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  }, []);
  const isSuperAdmin = currentUser?.role === 'superadmin';

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(API_URL, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setUsers(await res.json());
    } catch (err) { console.error("Gagal load users:", err); }
    finally { setLoading(false); }
  };

  const fetchActivity = async () => {
    setActLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [rSess, rLog] = await Promise.all([
        fetch(`${BASE_PATH}/api/sessions/active`,  { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_PATH}/api/login-activity`,   { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (rSess.ok) setActiveSessions(await rSess.json());
      if (rLog.ok)  setLoginHistory(await rLog.json());
    } catch (err) { console.error(err); }
    finally { setActLoading(false); }
  };

  const handleTabChange = (tab: 'users' | 'activity') => {
    setActiveTab(tab);
    if (tab === 'activity' && activeSessions.length === 0 && loginHistory.length === 0) fetchActivity();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url    = editingUser ? `${API_URL}/${editingUser.id}` : API_URL;
      const method = editingUser ? 'PUT' : 'POST';
      const noUnit = ['admin', 'viewer', 'superadmin'].includes(formData.role);
      const body   = {
        ...formData,
        id: editingUser?.id,
        unit_l1: noUnit ? 'PUSAT' : formData.unit_l1,
        unit_l2: noUnit ? 'SELURUH UNIT' : formData.unit_l2,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowModal(false);
        fetchUsers();
        alert("Sip! Data user berhasil disimpan.");
      } else {
        alert(`Gagal menyimpan data user (Status: ${res.status}). Silakan coba lagi.`);
      }
    } catch { alert("Terjadi kesalahan jaringan."); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus user ini?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchUsers();
    } catch (err) { console.error(err); }
  };

  const openModal = (user?: User) => {
    setShowPassword(false);
    if (user) {
      setEditingUser(user);
      setFormData({ username: user.username, password: user.plain_password || '', nama_lengkap: user.nama_lengkap || '', email: user.email || '', role: user.role, active: user.active, unit_l1: user.unit_l1 || '', unit_l2: user.unit_l2 || '' });
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
    const rows = users.map(u => ({
      'Nama Lengkap':        u.nama_lengkap || '-',
      'Hak Akses':           ROLE_LABEL[u.role] || u.role,
      'Username':            u.username,
      'Password':            u.plain_password || '(belum diset ulang)',
      'Unit Kerja Level 1':  (u.role === 'user' ? u.unit_l1 : '-') || '-',
      'Unit Kerja Level 2':  (u.role === 'user' ? u.unit_l2 : '-') || '-',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 55 }, { wch: 45 }];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Data Pengguna');
    XLSX.writeFile(wb, 'Data_Pengguna_SIMPEL.xlsx');
  };

  return (
    <div className={`p-4 md:p-6 lg:p-8 font-sans ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Kelola akun dan hak akses pengguna sistem</p>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'users' && (
            <>
              <button onClick={handleDownloadExcel} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-sm">
                <Download className="w-4 h-4" /> Unduh Excel
              </button>
              <button onClick={() => openModal()} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-sm">
                <Plus className="w-4 h-4" /> Tambah User
              </button>
            </>
          )}
          {activeTab === 'activity' && (
            <button onClick={fetchActivity} disabled={actLoading} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50">
              <Activity className="w-4 h-4" /> {actLoading ? 'Memuat...' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs — hanya superadmin lihat tab Aktivitas */}
      {isSuperAdmin && (
        <div className={`flex gap-1 p-1 rounded-xl w-fit mb-5 ${isDarkMode ? 'bg-[#0F172A] border border-slate-700' : 'bg-slate-100'}`}>
          {([['users','Daftar Pengguna'], ['activity','Aktivitas Akses']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === key ? (isDarkMode ? 'bg-[#151F32] text-blue-400 shadow-sm' : 'bg-white text-blue-700 shadow-sm') : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ===== TAB: DAFTAR PENGGUNA ===== */}
      {activeTab === 'users' && (
        loading ? (
          <div className={`p-12 text-center font-bold italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Menghubungkan ke server...</div>
        ) : (
          <div className={`rounded-2xl shadow-sm border overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className={`border-b text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  <tr>
                    <th className="px-6 py-4">Identitas User</th>
                    <th className="px-6 py-4">Unit Penempatan</th>
                    <th className="px-6 py-4 text-center">Hak Akses</th>
                    <th className="px-6 py-4 text-center">Login Terakhir</th>
                    <th className="px-6 py-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {users.map(user => (
                    <tr key={user.id} className={`transition ${isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50/50'}`}>
                      <td className="px-6 py-4">
                        <p className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{user.nama_lengkap || user.username}</p>
                        <p className="text-xs font-mono text-slate-500">@{user.username}</p>
                        {/* Password reveal — superadmin only */}
                        {isSuperAdmin && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <KeyRound className="w-3 h-3 text-slate-400 shrink-0" />
                            {revealFor === user.id ? (
                              <>
                                <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {user.plain_password || '(belum diset)'}
                                </span>
                                <button onClick={() => setRevealFor(null)} className="text-slate-400 hover:text-slate-600 transition">
                                  <EyeOff className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setRevealFor(user.id)}
                                className="text-[10px] text-slate-400 hover:text-blue-600 font-medium transition flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" /> Lihat Password
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {['admin', 'viewer', 'superadmin'].includes(user.role) ? (
                          <span className="text-xs font-bold text-slate-400 italic">
                            {user.role === 'viewer' ? 'Lihat Saja' : 'Akses Lintas Unit'}
                          </span>
                        ) : (
                          <>
                            <p className={`text-sm font-bold leading-tight ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{user.unit_l1}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{user.unit_l2 || 'Level 1'}</p>
                          </>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${ROLE_BADGE[user.role] || ROLE_BADGE.user}`}>
                          {ROLE_LABEL[user.role] || user.role}
                        </span>
                        {user.role === 'user' && (
                          <div className="mt-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              (user.active_sessions || 0) >= 4
                                ? 'bg-red-100 text-red-600'
                                : (user.active_sessions || 0) > 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : (isDarkMode ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                            }`}>
                              {user.active_sessions || 0}/4 aktif
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs text-slate-500">{fmtDt(user.last_login)}</span>
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
        )
      )}

      {/* ===== TAB: AKTIVITAS AKSES ===== */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Sedang aktif */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="w-4 h-4 text-emerald-500" />
              <h3 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Sedang Aktif Sekarang</h3>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full">{activeSessions.length} sesi</span>
            </div>
            {actLoading ? (
              <div className="p-8 text-center text-slate-400 italic text-sm">Memuat data...</div>
            ) : activeSessions.length === 0 ? (
              <div className={`p-8 text-center italic text-sm rounded-2xl border ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
                <WifiOff className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                Tidak ada sesi aktif saat ini
              </div>
            ) : (
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className={`border-b text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <tr>
                        <th className="px-5 py-3">Pengguna</th>
                        <th className="px-5 py-3 text-center">Role</th>
                        <th className="px-5 py-3">Waktu Login</th>
                        <th className="px-5 py-3">Sesi Berakhir</th>
                        <th className="px-5 py-3">IP Address</th>
                        <th className="px-5 py-3">Browser</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {activeSessions.map((s, i) => (
                        <tr key={i} className={isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50/50'}>
                          <td className="px-5 py-3">
                            <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{s.nama_lengkap || s.username}</p>
                            <p className="text-[10px] font-mono text-slate-400">@{s.username}</p>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${ROLE_BADGE[s.role] || ROLE_BADGE.user}`}>
                              {ROLE_LABEL[s.role] || s.role}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600">{fmtDt(s.login_time)}</td>
                          <td className="px-5 py-3 text-xs text-slate-500">{fmtDt(s.expires_at)}</td>
                          <td className="px-5 py-3">
                            <span className="text-xs font-mono text-slate-600">{s.ip_address || '-'}</span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-xs text-slate-600">{parseUA(s.user_agent)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Riwayat login */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-blue-500" />
              <h3 className={`text-sm font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>Riwayat Login</h3>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full">{loginHistory.length} entri</span>
            </div>
            {actLoading ? (
              <div className="p-8 text-center text-slate-400 italic text-sm">Memuat data...</div>
            ) : loginHistory.length === 0 ? (
              <div className={`p-8 text-center italic text-sm rounded-2xl border ${isDarkMode ? 'bg-[#151F32] border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>Belum ada riwayat login</div>
            ) : (
              <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className={`border-b text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'bg-[#0F172A] border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                      <tr>
                        <th className="px-5 py-3">Waktu Login</th>
                        <th className="px-5 py-3">Pengguna</th>
                        <th className="px-5 py-3 text-center">Role</th>
                        <th className="px-5 py-3">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {loginHistory.map((ev, i) => (
                        <tr key={i} className={isDarkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50/50'}>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{fmtDt(ev.created_at)}</span>
                          </td>
                          <td className="px-5 py-3">
                            <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{ev.nama_lengkap || ev.username}</p>
                            <p className="text-[10px] font-mono text-slate-400">@{ev.username}</p>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${ROLE_BADGE[ev.role] || ROLE_BADGE.user}`}>
                              {ROLE_LABEL[ev.role] || ev.role}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className="text-xs font-mono text-slate-600">{ev.ip_address || '-'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-[#002855]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-3xl p-8 w-full max-w-xl shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}>
            <div className={`flex justify-between items-center mb-8 border-b pb-4 ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h2 className={`text-xl font-black flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                <UserCheck className="w-6 h-6 text-blue-600" />
                {editingUser ? 'Edit Data Pengguna' : 'Tambah Pengguna Baru'}
              </h2>
              <button onClick={() => setShowModal(false)} className={`p-2 rounded-full transition ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Username</label>
                  <input type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'}`} required autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Hak Akses (Role)</label>
                  <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-[#002855] shadow-sm'}`}>
                    <option value="user">User (Terbatas)</option>
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  Password {editingUser && (editingUser.plain_password ? '(terisi otomatis — ubah jika perlu)' : '(kosong = tidak diubah)')}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type={showPassword ? "text" : "password"} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={`w-full pl-10 pr-12 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'}`} required={!editingUser} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2 p-1 text-slate-400 hover:text-blue-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nama Lengkap</label>
                <input type="text" value={formData.nama_lengkap} onChange={e => setFormData({...formData, nama_lengkap: e.target.value})} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'}`} required />
              </div>

              {!['admin', 'viewer', 'superadmin'].includes(formData.role) && (
                <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-3 h-3" /> Penempatan Unit Kerja
                  </p>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Kerja Level 1</label>
                    <select value={formData.unit_l1} onChange={e => setFormData({...formData, unit_l1: e.target.value, unit_l2: ''})} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'}`} required>
                      <option value="">-- Pilih Unit Kerja L1 --</option>
                      {Object.keys(HIERARKI_UNIT).map(l1 => <option key={l1} value={l1}>{l1}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Unit Kerja Level 2 (Opsional)</label>
                    <select value={formData.unit_l2} onChange={e => setFormData({...formData, unit_l2: e.target.value})} className={`w-full px-4 py-2.5 border rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'}`} disabled={!formData.unit_l1}>
                      <option value="">-- Pilih Unit Kerja L2 (Opsional) --</option>
                      {availableL2.map(sub => <option key={sub} value={sub}>{sub}</option>)}
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

              <button type="submit" disabled={loading} className={`w-full py-4 text-white font-black rounded-2xl transition shadow-sm mt-4 uppercase tracking-widest text-sm disabled:bg-slate-400 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-[#002855] hover:bg-blue-900'}`}>
                {loading ? 'Memproses...' : (editingUser ? 'Simpan Perubahan' : 'Daftarkan Pengguna')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
