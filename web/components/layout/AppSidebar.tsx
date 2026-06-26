'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Home, FileSignature, GitBranch, Users, LogOut,
  HelpCircle, X, FilePlus, ScrollText,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { label: 'Dashboard', icon: Home, href: '/' },
  { label: 'Dokumen SOP', icon: FileSignature, href: '/sop' },
  { label: 'Proses Bisnis (BPMN)', icon: GitBranch, href: '/bpmn' },
  { label: 'Juknis / Juklak / SE', icon: ScrollText, href: '/juknis' },
];

export default function AppSidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, handleLogout } = useAppContext();

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const allNavItems = [
    ...NAV_ITEMS,
    ...(currentUser?.role === 'admin'
      ? [{ label: 'Manajemen Pengguna', icon: Users, href: '/users' }]
      : []),
  ];

  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-screen z-30 flex flex-col shadow-2xl
          bg-gradient-to-b from-[#001F43] to-[#000F24] text-white
          transition-all duration-300 ease-in-out overflow-hidden
          ${isOpen
            ? 'translate-x-0 w-72'
            : '-translate-x-full w-72 lg:translate-x-0 lg:w-16'}
        `}
      >
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-white/50 hover:text-white rounded-lg lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand */}
        <div className={`border-b border-white/10 shrink-0 transition-all duration-300 ${isOpen ? 'p-6' : 'flex flex-col items-center px-2 py-4'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/e-sop-atrbpn/logo-bpn.png"
            alt="Logo ATR/BPN"
            className={`object-contain transition-all duration-300 ${isOpen ? 'w-12 h-12 mb-4' : 'w-8 h-8'}`}
          />
          {isOpen && (
            <>
              <h1 className="text-xl font-extrabold text-white leading-tight tracking-wide">SIMPEL</h1>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-semibold">
                Kementerian ATR/BPN
              </p>
            </>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-5 overflow-y-auto ${isOpen ? 'px-3' : 'px-2'}`}>
          {isOpen && (
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-3">
              Menu Utama
            </p>
          )}

          {allNavItems.map(({ label, icon: Icon, href }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                title={!isOpen ? label : undefined}
                className={`
                  w-full flex items-center py-3 mb-1 rounded-2xl
                  transition-all duration-200 text-sm
                  ${isOpen ? 'gap-3 px-4' : 'justify-center px-3'}
                  ${active
                    ? 'bg-gradient-to-r from-[#A29061] to-[#8c7a4b] text-white font-bold shadow-lg shadow-[#A29061]/25'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white font-medium'}
                `}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {isOpen && <span>{label}</span>}
              </button>
            );
          })}

          {/* Upload Manual — aksi cepat */}
          <div className={`mt-4 ${isOpen ? 'px-1' : ''}`}>
            {isOpen && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-3">
                Upload Manual
              </p>
            )}
            <button
              onClick={() => navigate('/?mode=tambah')}
              title={!isOpen ? 'Tambah Dokumen Probis/SOP/SP Manual' : undefined}
              className={`
                w-full flex items-center py-3 mb-1 rounded-2xl
                bg-[#A29061]/20 hover:bg-[#A29061]/40 text-[#c9b87a] hover:text-white
                transition-all duration-200 text-sm font-bold
                ${isOpen ? 'gap-3 px-4' : 'justify-center px-3'}
              `}
            >
              <FilePlus className="w-5 h-5 shrink-0" />
              {isOpen && <span className="leading-tight">Tambah Dokumen Probis/SOP/SP Manual</span>}
            </button>
          </div>

          {/* Sistem */}
          <div className="mt-6">
            {isOpen && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-3">
                Sistem
              </p>
            )}

            <button
              onClick={() => navigate('/panduan')}
              title={!isOpen ? 'Panduan Penggunaan' : undefined}
              className={`
                w-full flex items-center py-3 mb-1 rounded-2xl text-slate-400 hover:bg-white/5 hover:text-white transition-all text-sm font-medium
                ${isOpen ? 'gap-3 px-4' : 'justify-center px-3'}
              `}
            >
              <HelpCircle className="w-5 h-5 shrink-0" />
              {isOpen && <span>Panduan Penggunaan</span>}
            </button>

            <button
              onClick={handleLogout}
              title={!isOpen ? 'Keluar' : undefined}
              className={`
                w-full flex items-center py-3 rounded-2xl text-red-400 hover:bg-red-900/30 transition-all text-sm font-medium
                ${isOpen ? 'gap-3 px-4' : 'justify-center px-3'}
              `}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {isOpen && <span>Keluar</span>}
            </button>
          </div>
        </nav>

      </aside>
    </>
  );
}
