"use client";
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

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

      const maxAge = rememberMe ? 120 * 60 : 120 * 60;
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/e-sop-atrbpn/logo-bpn.png"
              alt="Logo ATR/BPN"
              className="h-16 w-16 object-contain mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-900 text-center">
              Sistem Informasi Manajemen Prosedur dan Pelayanan (SIMPEL)
            </h1>
            <p className="text-base font-semibold text-gray-700 mt-1 text-center">
              Kementerian ATR/BPN
            </p>
            <p className="text-sm text-gray-500 mt-1">Masuk ke akun Anda</p>
          </div>

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
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm text-gray-800 placeholder:text-gray-400 bg-gray-50 focus:bg-white transition-colors"
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
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm pr-10 text-gray-800 placeholder:text-gray-400 bg-gray-50 focus:bg-white transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-linear-to-r from-violet-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6 leading-relaxed">
          Dibuat oleh{' '}
          <a
            href="https://www.instagram.com/ferdiansyah_nanda"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-medium"
          >
            Ferdiansyah
          </a>{' '}
          &copy; 2025–{new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}