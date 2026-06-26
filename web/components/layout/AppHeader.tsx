'use client';

import { Menu, Sun, Moon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAppContext } from '@/lib/app-context';

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Dashboard Monitoring',
    subtitle: 'Rekapitulasi dokumen ketatalaksanaan seluruh unit kerja',
  },
  '/sop': {
    title: 'Dokumen SOP',
    subtitle: 'Manajemen dan pengajuan Standard Operating Procedure',
  },
  '/bpmn': {
    title: 'Proses Bisnis (BPMN)',
    subtitle: 'Pemodelan alur kerja dan proses bisnis unit kerja',
  },
  '/users': {
    title: 'Manajemen Pengguna',
    subtitle: 'Kelola akun dan hak akses pengguna sistem',
  },
  '/bpmn/studio': {
    title: 'Studio Editor BPMN',
    subtitle: 'Editor visual diagram proses bisnis',
  },
  '/sop/studio': {
    title: 'Studio Editor SOP',
    subtitle: 'Penyusunan dokumen Standard Operating Procedure',
  },
  '/juknis': {
    title: 'Juknis / Juklak / SE',
    subtitle: 'Daftar petunjuk teknis, petunjuk pelaksanaan, dan surat edaran',
  },
  '/panduan': {
    title: 'Panduan Penggunaan',
    subtitle: 'Tata cara dan pedoman penggunaan aplikasi SIMPEL',
  },
};

interface Props {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function AppHeader({ onToggleSidebar, sidebarOpen }: Props) {
  const pathname = usePathname();
  const { currentUser, isDarkMode, setIsDarkMode } = useAppContext();
  const page = PAGE_TITLES[pathname] ?? { title: 'SIMPEL ATR/BPN', subtitle: '' };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center gap-3 px-4 md:px-6 shrink-0 shadow-sm z-10">
      {/* Hamburger — all screen sizes */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="Toggle navigasi"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo — hanya di mobile saat overlay sidebar tersembunyi
          Di desktop sidebar selalu tampil (minimal icon), jadi header tidak perlu logo */}
      {!sidebarOpen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/e-sop-atrbpn/logo-bpn.png"
          alt="Logo ATR/BPN"
          className="w-7 h-7 object-contain lg:hidden"
        />
      )}

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-[#002855] text-base md:text-lg leading-none truncate">
          {page.title}
        </h2>
        <p className="text-[10px] md:text-xs text-slate-400 mt-0.5 hidden sm:block truncate">
          {page.subtitle}
        </p>
      </div>

      {/* Dark/light toggle */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        title={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
      >
        {isDarkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* User chip */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-sm font-bold text-slate-700 leading-none">
            {currentUser?.nama_lengkap || currentUser?.username || 'Pengguna'}
          </span>
          <span className="text-[10px] text-slate-400 capitalize mt-0.5">
            {currentUser?.role || 'viewer'}
          </span>
        </div>
        <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-[#001F43] to-[#003a7a] flex items-center justify-center font-bold text-white text-xs md:text-sm shrink-0">
          {(currentUser?.nama_lengkap || currentUser?.username || 'U')
            .substring(0, 2)
            .toUpperCase()}
        </div>
      </div>
    </header>
  );
}
