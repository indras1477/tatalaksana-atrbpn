"use client";
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2, Headphones, X, MessageCircle } from 'lucide-react';
import KreditPengembang from '@/components/KreditPengembang';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  // Dibaca SEKALI dari query URL (?expired=1) via lazy initializer — bukan setState di
  // dalam effect (memicu cascading render). Aman dari hydration mismatch karena render
  // pertama (server & klien) selalu menampilkan layar isAuthChecking, bukan banner ini.
  const [sessionExpiredMsg] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('expired') === '1'
      ? 'Sesi Anda telah berakhir. Silakan login kembali.'
      : ''
  );
  const [showCallCenter, setShowCallCenter] = useState(false);

  const ADMINS = [
    { name: 'Bima Karismanto', phone: '6285292724654' },
    { name: 'Nanda Ferdiansyah', phone: '6285713595915' },
  ];

  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');

      if (!token || !userStr) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const res = await fetch('/e-sop-atrbpn/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          window.location.replace(window.location.origin + '/e-sop-atrbpn/');
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          setIsAuthChecking(false);
        }
      } catch {
        setIsAuthChecking(false);
      }
    };

    checkSession();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/e-sop-atrbpn/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember: rememberMe }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login gagal');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('expiresIn', String(data.expiresIn || 120));

      const maxAge = rememberMe ? 120 * 3600 : 8 * 3600;
      document.cookie = `token=${data.token}; path=/; max-age=${maxAge}`;

      window.location.replace(window.location.origin + '/e-sop-atrbpn/');
    } catch (err) {
      console.error('Login error:', err);
      setError('Tidak dapat terhubung ke server');
      setLoading(false);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-linear-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
          <p className="text-sm text-gray-500 animate-pulse">Menyiapkan halaman...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-8">
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/e-sop-atrbpn/logo-bpn.png"
              alt="Logo ATR/BPN"
              className="h-16 w-16 object-contain mb-4"
            />
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900 text-center">
              Sistem Informasi Manajemen Prosedur dan Pelayanan (SIMPEL)
            </h1>
            <p className="text-base font-semibold text-gray-700 mt-1 text-center">
              Kementerian ATR/BPN
            </p>
            <p className="text-sm text-gray-500 mt-1">Masuk ke akun Anda</p>
          </div>

          {sessionExpiredMsg && (
            <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-amber-700 text-sm text-center">{sessionExpiredMsg}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm text-gray-800 placeholder:text-gray-400 bg-gray-50 focus:bg-white transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm pr-10 text-gray-800 placeholder:text-gray-400 bg-gray-50 focus:bg-white transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-600">
                Ingat saya
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-600 text-sm text-center">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-linear-to-r from-[#001F43] to-[#000F24] text-white px-5 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Memproses...' : 'Masuk'}
              </button>

              {/* Tombol Call Center */}
              <button
                type="button"
                onClick={() => setShowCallCenter(true)}
                title="Hubungi Admin"
                className="w-12 h-12 shrink-0 rounded-lg border border-gray-200 bg-gray-50 hover:bg-green-50 hover:border-green-300 text-gray-500 hover:text-green-600 flex items-center justify-center transition-colors"
              >
                <Headphones className="w-5 h-5" />
              </button>
            </div>
          </form>

          {/* Popup Call Center */}
          {showCallCenter && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setShowCallCenter(false)}
            >
              <div
                className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header popup */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                      <Headphones className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">Butuh Bantuan?</p>
                      <p className="text-xs text-gray-500">Hubungi admin Biro ORTALAMR</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCallCenter(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Daftar kontak */}
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-400 text-center mb-1">
                    Pilih admin yang ingin dihubungi via WhatsApp
                  </p>
                  {ADMINS.map((admin) => (
                    <a
                      key={admin.phone}
                      href={`https://wa.me/${admin.phone}?text=${encodeURIComponent('Halo, saya tidak bisa masuk ke aplikasi SIMPEL ATR/BPN. Mohon bantuannya.')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-green-200 hover:bg-green-50 transition-all group"
                    >
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-full bg-linear-to-br from-green-400 to-emerald-600 flex items-center justify-center font-bold text-white text-base shrink-0">
                        {admin.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{admin.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">+{admin.phone}</p>
                      </div>
                      <MessageCircle className="w-5 h-5 text-green-500 group-hover:text-green-600 shrink-0" />
                    </a>
                  ))}
                </div>

                <div className="px-5 pb-4 pt-1">
                  <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                    Jam kerja: Senin–Jumat, 08.00–16.00 WIB
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6 leading-relaxed">
          <KreditPengembang />
        </p>
      </div>
    </div>
  );
}