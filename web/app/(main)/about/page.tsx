'use client';

import {
  Info, Coffee, Heart, ShieldCheck, Sparkles, ExternalLink,
  FileSignature, GitBranch, ClipboardCheck, ScrollText, Home, Share2,
  Bell, History, Layers,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

/* Ringkasan kemampuan utama aplikasi */
const KEMAMPUAN = [
  {
    icon: GitBranch,
    judul: 'Proses Bisnis BPMN',
    teks: 'Memodelkan alur kerja berstandar BPMN 2.0 lewat kanvas seret-dan-lepas, dari Peta Proses Bisnis Kementerian sampai Level 3/N.',
    light: 'bg-emerald-100 text-emerald-600',
    dark: 'bg-emerald-900/40 text-emerald-400',
  },
  {
    icon: FileSignature,
    judul: 'Studio SOP',
    teks: 'Merangkai bagan alur prosedur beserta seluruh kelengkapan naskahnya, lalu mengunduhnya sebagai PDF siap tanda tangan.',
    light: 'bg-blue-100 text-blue-600',
    dark: 'bg-blue-900/40 text-blue-400',
  },
  {
    icon: ClipboardCheck,
    judul: 'Studio Standar Pelayanan',
    teks: 'Menyusun naskah Standar Pelayanan pada kanvas F4, lengkap dengan ekspor PDF maupun DOCX dan impor dari Word.',
    light: 'bg-violet-100 text-violet-600',
    dark: 'bg-violet-900/40 text-violet-400',
  },
  {
    icon: ScrollText,
    judul: 'Repositori Regulasi',
    teks: 'Menghimpun Juknis, Juklak, Surat Edaran, dan peraturan pendukung dalam satu rak digital yang mudah ditelusuri.',
    light: 'bg-amber-100 text-amber-600',
    dark: 'bg-amber-900/40 text-amber-400',
  },
  {
    icon: Home,
    judul: 'Dashboard Monitoring',
    teks: 'Merangkum capaian dokumen tiap unit kerja secara berjenjang, sehingga kemajuan penyusunan terbaca sekilas.',
    light: 'bg-sky-100 text-sky-600',
    dark: 'bg-sky-900/40 text-sky-400',
  },
  {
    icon: Share2,
    judul: 'Tautan Bagikan',
    teks: 'Membagikan dokumen yang telah terbit lewat satu tautan yang dapat dibuka siapa pun tanpa perlu masuk ke aplikasi.',
    light: 'bg-rose-100 text-rose-600',
    dark: 'bg-rose-900/40 text-rose-400',
  },
];

/* Tahapan perjalanan dokumen */
const ALUR = [
  { no: '1', judul: 'Disusun', teks: 'Unit kerja menyusun dokumen langsung di dalam studio, atau mengunggah berkas yang sudah ada.' },
  { no: '2', judul: 'Diajukan', teks: 'Dokumen dikirim ke Biro Ortala MR untuk direview, tanpa perlu surat pengantar berlembar-lembar.' },
  { no: '3', judul: 'Direview', teks: 'Catatan perbaikan disampaikan langsung pada dokumennya, sehingga perbaikan tidak lagi beredar lewat surel.' },
  { no: '4', judul: 'Ditetapkan', teks: 'Dokumen yang disetujui ditandatangani, diberi lembar pengesahan, lalu terbit dan tercatat dalam registri.' },
];

export default function AboutPage() {
  const { isDarkMode } = useAppContext();

  const card = isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100';
  const heading = isDarkMode ? 'text-white' : 'text-[#002855]';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="overflow-auto p-4 md:p-6 lg:p-8 h-full">
      <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

        {/* ---------- Header halaman ---------- */}
        <div className="mb-2">
          <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${heading}`}>
            About
          </h2>
          <p className={`mt-2 text-sm font-medium ${muted}`}>
            Mengenal lebih dekat aplikasi yang Anda gunakan sehari-hari
          </p>
        </div>

        {/* ---------- Kartu identitas aplikasi ---------- */}
        <div className={`rounded-2xl border overflow-hidden ${card}`}>
          <div className={`px-5 py-4 flex items-center gap-3 border-b ${isDarkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-slate-50/60'}`}>
            <div className={`p-2.5 rounded-xl shrink-0 ${isDarkMode ? 'bg-indigo-900/40 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-extrabold ${heading}`}>Tentang Aplikasi Ini</h3>
              <p className={`text-xs ${muted}`}>
                SIMPEL — Sistem Informasi Manajemen Peta Layanan
              </p>
            </div>
          </div>

          {/* Narasi utama */}
          <div className={`px-5 py-5 space-y-4 text-sm leading-relaxed ${body}`}>
            <p>
              Setiap unit kerja punya cerita yang sama. Satu Standar Operasional Prosedur disusun di
              komputer seseorang, dicetak, ditandatangani, lalu disimpan dalam map. Ketika dibutuhkan
              kembali, yang tersisa tinggal berkas hasil pindaian entah di folder mana, dengan versi
              yang tak lagi jelas mana yang paling mutakhir.
            </p>
            <p>
              <span className={`font-bold ${heading}`}>SIMPEL</span> dibangun untuk mengakhiri kebiasaan
              itu. Aplikasi ini menjadi satu ruang kerja bersama tempat seluruh unit kerja Kementerian
              Agraria dan Tata Ruang/Badan Pertanahan Nasional menyusun, mengajukan, mereview, hingga
              menetapkan dokumen ketatalaksanaan — proses bisnis, standar operasional prosedur, dan
              standar pelayanan — seluruhnya dalam satu alur yang sama dan satu tempat penyimpanan yang
              sama.
            </p>
            <p>
              Yang berubah bukan sekadar wujudnya dari kertas menjadi layar. Dokumen kini dibuat langsung
              di dalam aplikasi, bukan diunggah sebagai berkas mati; perbaikan dari hasil review
              disampaikan di tempat dokumen itu berada; dan setiap perpindahan status terekam sehingga
              riwayatnya selalu dapat ditelusuri. Tidak ada lagi pertanyaan &ldquo;berkas yang mana yang
              terbaru&rdquo; — karena hanya ada satu.
            </p>
          </div>

          {/* Chip identitas */}
          <div className={`px-5 pb-5 flex flex-wrap gap-2`}>
            {[
              { icon: ShieldCheck, label: 'Kementerian ATR/BPN' },
              { icon: Sparkles, label: 'Biro Ortala MR' },
              { icon: Layers, label: 'Probis • SOP • SP • Regulasi' },
            ].map(({ icon: Ico, label }) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                  isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Ico className="w-3.5 h-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* ---------- Apa saja yang bisa dikerjakan ---------- */}
        <div>
          <h3 className={`text-base font-extrabold mb-1 ${heading}`}>Apa Saja yang Bisa Dikerjakan</h3>
          <p className={`text-sm mb-4 ${muted}`}>
            Enam kemampuan utama yang menopang pekerjaan ketatalaksanaan sehari-hari
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {KEMAMPUAN.map(({ icon: Ico, judul, teks, light, dark }) => (
              <div key={judul} className={`rounded-2xl border p-4 ${card}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${isDarkMode ? dark : light}`}>
                  <Ico className="w-4 h-4" />
                </div>
                <p className={`text-sm font-bold mb-1.5 ${heading}`}>{judul}</p>
                <p className={`text-[13px] leading-relaxed ${muted}`}>{teks}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Perjalanan sebuah dokumen ---------- */}
        <div className={`rounded-2xl border p-5 ${card}`}>
          <h3 className={`text-base font-extrabold mb-1 ${heading}`}>Perjalanan Sebuah Dokumen</h3>
          <p className={`text-sm mb-5 ${muted}`}>
            Empat tahap yang dilalui setiap dokumen, dari gagasan sampai ditetapkan
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ALUR.map(({ no, judul, teks }) => (
              <div key={no} className="relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold mb-2.5 ${
                  isDarkMode ? 'bg-[#A29061]/25 text-[#c9b87a]' : 'bg-[#A29061]/15 text-[#8c7a4b]'
                }`}>
                  {no}
                </div>
                <p className={`text-sm font-bold mb-1 ${heading}`}>{judul}</p>
                <p className={`text-[13px] leading-relaxed ${muted}`}>{teks}</p>
              </div>
            ))}
          </div>

          {/* Catatan pelengkap */}
          <div className={`mt-5 pt-4 border-t flex flex-col sm:flex-row gap-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="flex items-start gap-2.5 flex-1">
              <Bell className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-[13px] leading-relaxed ${muted}`}>
                Setiap perpindahan tahap memicu notifikasi, sehingga tidak ada usulan yang mengendap
                tanpa kabar.
              </p>
            </div>
            <div className="flex items-start gap-2.5 flex-1">
              <History className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <p className={`text-[13px] leading-relaxed ${muted}`}>
                Seluruh perjalanan tersimpan dalam riwayat dokumen dan dapat dibuka kembali kapan saja.
              </p>
            </div>
          </div>
        </div>

        {/* ---------- Dukung Pengembang ---------- */}
        <div className={`rounded-2xl border overflow-hidden ${isDarkMode ? 'bg-[#151F32] border-[#001F43]' : 'bg-white border-[#002855]/20'}`}>
          <div className={`px-5 py-5 ${isDarkMode ? 'bg-[#001F43]/25' : 'bg-[#002855]/5'}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              {/* Narasi dukungan */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-extrabold flex items-center gap-2 mb-2.5 ${isDarkMode ? 'text-blue-300' : 'text-[#002855]'}`}>
                  <Coffee className="w-4 h-4 shrink-0" />
                  Traktir Secangkir Kopi untuk Pengembang
                </p>
                <p className={`text-sm leading-relaxed ${body}`}>
                  Aplikasi ini tidak lahir dari proyek bernilai miliaran. Ia tumbuh sedikit demi sedikit
                  di sela-sela jam kerja — satu tombol yang dibetulkan malam hari, satu keluhan yang
                  dijawab dengan fitur baru pekan berikutnya, satu galat yang diburu sampai larut.
                </p>
                <p className={`text-sm leading-relaxed mt-2.5 ${body}`}>
                  Tidak ada biaya langganan di sini, dan memang tidak akan pernah ada. Namun bila SIMPEL
                  pernah menghemat waktu Anda, secangkir kopi akan sangat berarti — bukan pada
                  nominalnya, melainkan pada pesan yang dibawanya: bahwa yang dikerjakan ini ada yang
                  memakai, dan layak untuk terus dirawat.
                </p>
                <p className={`text-sm leading-relaxed mt-2.5 font-semibold ${isDarkMode ? 'text-blue-300/90' : 'text-[#002855]/90'}`}>
                  Pindai kode QR di samping, atau tekan tombol di bawah ini.
                </p>

                <a
                  href="https://saweria.co/nandaferdiansyah"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-linear-to-r from-[#001F43] to-[#000F24] hover:from-[#002855] hover:to-[#001F43] shadow-sm hover:shadow-md transition-all active:scale-95"
                >
                  <Heart className="w-4 h-4" />
                  Dukung Pengembang
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>
              </div>

              {/* Kode QR */}
              <div className="shrink-0 flex flex-col items-center gap-2 md:w-44">
                <a
                  href="https://saweria.co/nandaferdiansyah"
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
                    className="w-36 h-36 block"
                    width={144}
                    height={144}
                  />
                </a>
                <p className={`text-[11px] text-center font-semibold ${muted}`}>
                  Pindai dengan kamera ponsel
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- Kredit ---------- */}
        <p className={`text-center text-xs leading-relaxed ${muted}`}>
          Dikembangkan dan dirawat oleh{' '}
          <a
            href="https://nanda-portfolio-flax.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline font-semibold"
          >
            Nanda Ferdiansyah
          </a>{' '}
          untuk Biro Organisasi, Tata Laksana, dan Manajemen Risiko ATR/BPN
        </p>

      </div>
    </div>
  );
}
