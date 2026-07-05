'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Menu, Sun, Moon, X, KeyRound, Eye, EyeOff, Building2, Save, LogOut, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '@/lib/app-context';
import { HIERARKI_UNIT } from '@/lib/constants';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard Monitoring', subtitle: 'Rekapitulasi dokumen ketatalaksanaan seluruh unit kerja' },
  '/sop': { title: 'Dokumen SOP', subtitle: 'Manajemen dan pengajuan Standard Operating Procedure' },
  '/bpmn': { title: 'Proses Bisnis (BPMN)', subtitle: 'Pemodelan alur kerja dan proses bisnis unit kerja' },
  '/users': { title: 'Manajemen Pengguna', subtitle: 'Kelola akun dan hak akses pengguna sistem' },
  '/bpmn/studio': { title: 'Studio Editor BPMN', subtitle: 'Editor visual diagram proses bisnis' },
  '/sop/studio': { title: 'Studio Editor SOP', subtitle: 'Penyusunan dokumen Standard Operating Procedure' },
  '/juknis': { title: 'Juknis / Juklak / SE', subtitle: 'Daftar petunjuk teknis, petunjuk pelaksanaan, dan surat edaran' },
  '/panduan': { title: 'Panduan Penggunaan', subtitle: 'Tata cara dan pedoman penggunaan aplikasi SIMPEL' },
  '/peraturan': { title: 'Daftar Peraturan', subtitle: 'Peraturan Menteri ATR/BPN dan regulasi terkait' },
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  viewer: 'Viewer',
  user: 'User (Terbatas)',
};

const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  viewer: 'bg-teal-100 text-teal-700 border-teal-200',
  user: 'bg-blue-100 text-blue-700 border-blue-200',
};

interface Props {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function AppHeader({ onToggleSidebar, sidebarOpen }: Props) {
  const pathname = usePathname();
  const { currentUser, isDarkMode, setIsDarkMode, updateCurrentUser, handleLogout } = useAppContext();
  const page = PAGE_TITLES[pathname] ?? { title: 'SIMPEL ATR/BPN', subtitle: '' };

  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [form, setForm] = useState({
    nama_lengkap: '',
    username: '',
    password: '',
    password_confirm: '',
    unit_l1: '',
    unit_l2: '',
  });

  // Sync form when modal opens
  useEffect(() => {
    if (showProfile && currentUser) {
      setForm({
        nama_lengkap: currentUser.nama_lengkap || '',
        username: currentUser.username || '',
        password: '',
        password_confirm: '',
        unit_l1: currentUser.unit_l1 || '',
        unit_l2: currentUser.unit_l2 || '',
      });
      setSaveError('');
      setSaveSuccess(false);
    }
  }, [showProfile, currentUser]);

  const availableL2 = useMemo(() =>
    form.unit_l1 && HIERARKI_UNIT[form.unit_l1] ? Object.keys(HIERARKI_UNIT[form.unit_l1]) : [],
    [form.unit_l1]
  );

  const handleSave = async () => {
    setSaveError('');
    if (!form.nama_lengkap.trim() || !form.username.trim()) {
      setSaveError('Nama Lengkap dan Username wajib diisi.');
      return;
    }
    if (form.password && form.password !== form.password_confirm) {
      setSaveError('Konfirmasi password tidak cocok.');
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/e-sop-atrbpn/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nama_lengkap: form.nama_lengkap.trim(),
          username: form.username.trim(),
          password: form.password || '',
          unit_l1: form.unit_l1,
          unit_l2: form.unit_l2,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(err.error || 'Gagal menyimpan perubahan.');
        return;
      }
      const updated = await res.json();
      updateCurrentUser({
        id: updated.id,
        username: updated.username,
        nama_lengkap: updated.nama_lengkap,
        role: updated.role,
        unit_l1: updated.unit_l1,
        unit_l2: updated.unit_l2,
      });
      setSaveSuccess(true);
      setForm(f => ({ ...f, password: '', password_confirm: '' }));
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError('Terjadi kesalahan jaringan.');
    } finally {
      setSaving(false);
    }
  };

  const initials = (currentUser?.nama_lengkap || currentUser?.username || 'U').substring(0, 2).toUpperCase();
  const roleKey = currentUser?.role || 'viewer';

  return (
    <>
      <header className={`h-16 border-b flex items-center gap-3 px-4 md:px-6 shrink-0 shadow-sm z-10 ${isDarkMode ? 'bg-[#0F172A] border-slate-700' : 'bg-white border-slate-200'}`}>
        <button onClick={onToggleSidebar} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`} aria-label="Toggle navigasi">
          <Menu className="w-5 h-5" />
        </button>

        {!sidebarOpen && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/e-sop-atrbpn/logo-bpn.png" alt="Logo ATR/BPN" className="w-7 h-7 object-contain lg:hidden" />
        )}

        <div className="flex-1 min-w-0">
          <h2 className={`font-bold text-base md:text-lg leading-none truncate ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
            {page.title}
          </h2>
          <p className={`text-[10px] md:text-xs mt-0.5 hidden sm:block truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {page.subtitle}
          </p>
        </div>

        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
          className={`p-2 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          {isDarkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User chip — clickable */}
        <button
          onClick={() => setShowProfile(true)}
          className={`flex items-center gap-2.5 shrink-0 rounded-xl px-2 py-1.5 transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
        >
          <div className={`hidden md:flex flex-col items-end ${isDarkMode ? '' : ''}`}>
            <span className={`text-sm font-bold leading-none ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>
              {currentUser?.nama_lengkap || currentUser?.username || 'Pengguna'}
            </span>
            <span className={`text-[10px] capitalize mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>
              {ROLE_LABEL[roleKey] || roleKey}
            </span>
          </div>
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-linear-to-br from-[#001F43] to-[#003a7a] flex items-center justify-center font-bold text-white text-xs md:text-sm shrink-0">
            {initials}
          </div>
        </button>
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setShowProfile(false)}
        >
          <div
            className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200 flex flex-col ${isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'}`}
            style={{ maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle mobile */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className={`w-10 h-1 rounded-full ${isDarkMode ? 'bg-slate-600' : 'bg-slate-300'}`} />
            </div>

            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#001F43] to-[#003a7a] flex items-center justify-center font-bold text-white text-sm">
                  {initials}
                </div>
                <div>
                  <p className={`font-extrabold text-sm leading-tight ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                    {currentUser?.nama_lengkap || currentUser?.username}
                  </p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border mt-0.5 ${ROLE_COLOR[roleKey] || ROLE_COLOR.user}`}>
                    {ROLE_LABEL[roleKey] || roleKey}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowProfile(false)} className={`p-1.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-400'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable form body */}
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 flex items-center gap-1.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <User className="w-3 h-3" /> Edit Profil
              </p>

              {/* Nama Lengkap */}
              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nama Lengkap</label>
                <input
                  type="text"
                  value={form.nama_lengkap}
                  onChange={e => setForm(f => ({ ...f, nama_lengkap: e.target.value }))}
                  className={`w-full px-4 py-2.5 text-sm font-semibold border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>

              {/* Username */}
              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  autoComplete="off"
                  className={`w-full px-4 py-2.5 text-sm font-semibold border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label className={`text-[10px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Password Baru <span className={`font-normal normal-case tracking-normal ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>(kosongkan jika tidak ganti)</span>
                </label>
                <div className="relative">
                  <KeyRound className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    autoComplete="new-password"
                    className={`w-full pl-10 pr-11 py-2.5 text-sm font-semibold border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900'}`}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className={`absolute right-3 top-2 p-1 transition-colors ${isDarkMode ? 'text-slate-500 hover:text-blue-400' : 'text-slate-400 hover:text-blue-600'}`}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Konfirmasi Password — only shown if password filled */}
              {form.password.length > 0 && (
                <div className="space-y-1">
                  <label className={`text-[10px] font-extrabold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Konfirmasi Password</label>
                  <div className="relative">
                    <KeyRound className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={form.password_confirm}
                      onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))}
                      autoComplete="new-password"
                      className={`w-full pl-10 pr-11 py-2.5 text-sm font-semibold border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 ${
                        form.password_confirm && form.password !== form.password_confirm
                          ? 'border-red-400 focus:ring-red-400'
                          : isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)} className={`absolute right-3 top-2 p-1 transition-colors ${isDarkMode ? 'text-slate-500 hover:text-blue-400' : 'text-slate-400 hover:text-blue-600'}`}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password_confirm && form.password !== form.password_confirm && (
                    <p className="text-[11px] text-red-500 font-semibold">Password tidak cocok</p>
                  )}
                </div>
              )}

              {/* Unit Kerja — only for 'user' role */}
              {currentUser?.role === 'user' && (
                <div className={`p-4 rounded-2xl border space-y-3 ${isDarkMode ? 'bg-blue-900/10 border-blue-800/30' : 'bg-blue-50/50 border-blue-100'}`}>
                  <p className={`text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    <Building2 className="w-3 h-3" /> Unit Kerja
                  </p>
                  <div className="space-y-1">
                    <label className={`text-[9px] font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 1</label>
                    <select
                      value={form.unit_l1}
                      onChange={e => setForm(f => ({ ...f, unit_l1: e.target.value, unit_l2: '' }))}
                      className={`w-full px-3 py-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">-- Pilih Unit Kerja L1 --</option>
                      {Object.keys(HIERARKI_UNIT).map(l1 => (
                        <option key={l1} value={l1}>{l1}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={`text-[9px] font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Level 2 (Opsional)</label>
                    <select
                      value={form.unit_l2}
                      onChange={e => setForm(f => ({ ...f, unit_l2: e.target.value }))}
                      disabled={!form.unit_l1}
                      className={`w-full px-3 py-2 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${isDarkMode ? 'bg-[#0F172A] border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">-- Pilih Unit Kerja L2 (Opsional) --</option>
                      {availableL2.map(l2 => (
                        <option key={l2} value={l2}>{l2}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Feedback */}
              {saveError && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold">
                  Profil berhasil diperbarui.
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className={`px-5 py-4 border-t flex items-center justify-between gap-3 shrink-0 ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
              <button
                onClick={handleLogout}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${isDarkMode ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50'}`}
              >
                <LogOut className="w-4 h-4" /> Keluar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#002855] hover:bg-blue-900 text-white transition-colors disabled:opacity-60 shadow-md"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
