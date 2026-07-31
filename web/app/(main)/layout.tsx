'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { AppProvider, useAppContext } from '@/lib/app-context';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';
import { useIdleTimeout } from '@/lib/useIdleTimeout';

const WARN_SECONDS = 5 * 60;

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isDarkMode } = useAppContext();
  const pathname = usePathname();
  const prefLoaded = useRef(false);

  // --- Idle timeout ---
  const [idleWarning, setIdleWarning] = useState(false);
  const [countdown, setCountdown]     = useState(WARN_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Hapus sesi dari DB (fire-and-forget, tidak perlu tunggu respons)
      fetch('/e-sop-atrbpn/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('expiresIn');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.replace(window.location.origin + '/e-sop-atrbpn/login?expired=1');
  }, []);

  const handleWarn = useCallback(() => {
    setIdleWarning(true);
    setCountdown(WARN_SECONDS);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetIdle = useIdleTimeout(handleWarn, handleLogout);

  // KEEPALIVE: selagi tab terbuka, segarkan last_activity sesi tiap 2 menit agar
  // sesi pengguna yang sedang bekerja TIDAK ikut tergusur sebagai "sesi hantu" saat
  // rekan seakun (shared account) login. Bila server menjawab 401 (sesi sudah mati),
  // langsung logout supaya tidak kehilangan data pada aksi berikutnya.
  useEffect(() => {
    const ping = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await fetch('/e-sop-atrbpn/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) handleLogout();
      } catch { /* koneksi sesaat putus — abaikan, jangan logout */ }
    };
    const timer = setInterval(ping, 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, [handleLogout]);

  const handleContinue = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIdleWarning(false);
    setCountdown(WARN_SECONDS);
    resetIdle();
  }, [resetIdle]);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  useEffect(() => {
    // Saat app pertama dimuat (mis. setelah login): buka sidebar di desktop.
    // Preferensi buka/minimize disimpan agar dihormati saat reload berikutnya.
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('sidebarOpen');
    const isDesktop = window.innerWidth >= 1024;
    setSidebarOpen(isDesktop && (stored === null ? true : stored === '1'));
    prefLoaded.current = true;
  }, []);

  useEffect(() => {
    // Simpan preferensi hanya setelah nilai awal dibaca (hindari menimpa dengan default).
    if (prefLoaded.current && typeof window !== 'undefined') {
      localStorage.setItem('sidebarOpen', sidebarOpen ? '1' : '0');
    }
  }, [sidebarOpen]);

  useEffect(() => {
    // Di layar kecil, tutup overlay sidebar saat berpindah halaman.
    // Di desktop, buka/tutup sidebar HANYA lewat tombol menu (hamburger) — pindah menu
    // tidak lagi memaksa sidebar terbuka; cukup tetap ter-minimize.
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  const mins = Math.floor(countdown / 60);
  const secs = String(countdown % 60).padStart(2, '0');

  return (
    <div
      className={`h-screen overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'
      }`}
    >
      {/* Idle timeout warning */}
      {idleWarning && (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl ${isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-800'}`}>
            <div className="flex flex-col items-center text-center gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-amber-500/20' : 'bg-amber-50'}`}>
                <Clock className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold mb-1">Sesi Hampir Berakhir</h3>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Tidak ada aktivitas terdeteksi. Sesi akan otomatis berakhir dalam
                </p>
                <p className="text-3xl font-bold text-amber-500 mt-2 tabular-nums">
                  {mins}:{secs}
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={handleLogout}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${isDarkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  Logout Sekarang
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Lanjutkan Sesi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed sidebar — toggled via state on all screen sizes */}
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Content column — shifts right on desktop when sidebar is open */}
      <div
        className={`h-full flex flex-col overflow-hidden transition-[margin] duration-300 print:ml-0! ${
          sidebarOpen ? 'lg:ml-72' : 'lg:ml-16'
        }`}
      >
        <AppHeader onToggleSidebar={() => setSidebarOpen(prev => !prev)} sidebarOpen={sidebarOpen} />

        {/* Scrollable main area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Footer / Credit */}
        <footer
          className={`px-4 py-2.5 border-t text-xs text-center shrink-0 ${
            isDarkMode
              ? 'border-slate-800 text-slate-500 bg-[#090f1d]'
              : 'border-slate-200 text-slate-400 bg-white'
          }`}
        >
          Dibuat oleh{' '}
          <a
            href="https://nanda-portfolio-flax.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-medium"
          >
            Nanda Ferdiansyah
          </a>{' '}
          &copy; 2025–{new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <DashboardShell>{children}</DashboardShell>
    </AppProvider>
  );
}
