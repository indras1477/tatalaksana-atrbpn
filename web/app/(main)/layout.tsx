'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider, useAppContext } from '@/lib/app-context';
import AppSidebar from '@/components/layout/AppSidebar';
import AppHeader from '@/components/layout/AppHeader';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isDarkMode } = useAppContext();
  const pathname = usePathname();

  useEffect(() => {
    // Di layar kecil, tutup overlay sidebar saat berpindah halaman.
    // Di desktop, buka/tutup sidebar HANYA lewat tombol menu (hamburger) — pindah menu
    // tidak lagi memaksa sidebar terbuka; cukup tetap ter-minimize.
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [pathname]);

  return (
    <div
      className={`h-screen overflow-hidden font-sans transition-colors duration-300 ${
        isDarkMode ? 'bg-[#0B1121] text-slate-200' : 'bg-[#f3f4f6] text-slate-800'
      }`}
    >
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
            href="https://www.instagram.com/ferdiansyah_nanda"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-medium"
          >
            Ferdiansyah
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
