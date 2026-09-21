'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Heart, ExternalLink, X, Briefcase } from 'lucide-react';

const SAWERIA_URL = 'https://saweria.co/nandaferdiansyah';
const PORTOFOLIO_URL = 'https://nanda-portfolio-flax.vercel.app';

interface Props {
  /** Selaraskan warna popup dengan mode gelap aplikasi (login & halaman bagikan selalu terang). */
  isDarkMode?: boolean;
}

/**
 * Teks kredit pada footer. Nama pengembang tidak lagi menuju portofolio secara langsung —
 * klik akan membuka popup dukungan (Traktir Kopi) dengan tombol portofolio di bawahnya.
 */
export default function KreditPengembang({ isDarkMode = false }: Props) {
  const [open, setOpen] = useState(false);
  // Modal dipasang lewat portal ke <body>: footer membungkusnya dengan <p>/<span>,
  // sehingga <div> di dalamnya akan dipecah oleh parser HTML bila dirender di tempat.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panel = isDarkMode ? 'bg-[#151F32]' : 'bg-white';
  const heading = isDarkMode ? 'text-white' : 'text-[#002855]';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const garis = isDarkMode ? 'border-slate-800' : 'border-slate-100';

  return (
    <>
      Dibuat oleh{' '}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Tentang pengembang"
        className="text-blue-500 hover:underline font-medium cursor-pointer"
      >
        Nanda Ferdiansyah
      </button>{' '}
      &copy; Biro Ortala MR ATR/BPN {new Date().getFullYear()}

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-9999 p-4 text-left"
          onClick={() => setOpen(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto ${panel}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kepala */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${garis} ${isDarkMode ? 'bg-[#001F43]/40' : 'bg-[#002855]/5'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-[#001F43]' : 'bg-[#002855]/10'}`}>
                  <Coffee className={`w-5 h-5 ${isDarkMode ? 'text-blue-300' : 'text-[#002855]'}`} />
                </div>
                <div className="min-w-0">
                  <p className={`font-bold text-sm leading-tight ${heading}`}>
                    Traktir Secangkir Kopi untuk Pengembang
                  </p>
                  <p className={`text-xs mt-0.5 ${muted}`}>Nanda Ferdiansyah</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                  isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Isi */}
            <div className="px-5 py-5">
              <p className={`text-sm leading-relaxed ${body}`}>
                Aplikasi ini tumbuh sedikit demi sedikit di sela-sela jam kerja — satu tombol yang
                dibetulkan malam hari, satu keluhan yang dijawab dengan fitur baru pekan berikutnya.
              </p>
              <p className={`text-sm leading-relaxed mt-2.5 ${body}`}>
                Bila SIMPEL pernah menghemat waktu Anda, secangkir kopi akan sangat berarti — bukan
                pada nominalnya, melainkan pada pesan yang dibawanya: bahwa yang dikerjakan ini ada
                yang memakai, dan layak untuk terus dirawat.
              </p>

              {/* Kode QR */}
              <div className="mt-4 flex flex-col items-center gap-2">
                <a
                  href={SAWERIA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Pindai atau klik untuk mendukung pengembang"
                  className={`block p-3 rounded-2xl bg-white border-2 transition-all hover:scale-105 active:scale-95 ${
                    isDarkMode ? 'border-[#001F43]' : 'border-[#002855]/20'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/e-sop-atrbpn/dukung-qr.svg"
                    alt="Kode QR dukungan pengembang melalui Saweria"
                    className="w-32 h-32 block"
                    width={128}
                    height={128}
                  />
                </a>
                <p className={`text-[11px] font-semibold ${muted}`}>Pindai dengan kamera ponsel</p>
              </div>

              <a
                href={SAWERIA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-[#001F43] to-[#000F24] hover:from-[#002855] hover:to-[#001F43] shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                <Heart className="w-4 h-4" />
                Dukung Pengembang
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            </div>

            {/* Tombol portofolio */}
            <div className={`px-5 pb-5 pt-1 border-t ${garis}`}>
              <p className={`text-[11px] text-center mt-3 mb-2.5 ${muted}`}>
                Penasaran dengan karya lainnya?
              </p>
              <a
                href={PORTOFOLIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                  isDarkMode
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-600'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                Kunjungi Portofolioku
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
