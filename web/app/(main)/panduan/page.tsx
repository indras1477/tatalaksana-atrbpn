'use client';

import { useState } from 'react';
import {
  HelpCircle, BookOpen, GitBranch, FileSignature, ScrollText,
  Users, FilePlus, X, ChevronRight,
} from 'lucide-react';
import { useAppContext } from '@/lib/app-context';

/* ---------- SVG Infografis mini per menu ---------- */

function IllustDashboard() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#EFF6FF"/>
      {/* Tiga kartu stat */}
      {[0,1,2].map(i => (
        <rect key={i} x={12 + i*102} y="12" width="94" height="52" rx="8" fill="white" stroke="#BFDBFE" strokeWidth="1.5"/>
      ))}
      <rect x="20" y="22" width="32" height="32" rx="6" fill="#DBEAFE"/>
      <rect x="26" y="28" width="20" height="20" rx="3" fill="#3B82F6"/>
      <rect x="62" y="26" width="36" height="6" rx="3" fill="#93C5FD"/>
      <rect x="62" y="36" width="28" height="10" rx="3" fill="#1D4ED8"/>
      <rect x="122" y="22" width="32" height="32" rx="6" fill="#FEF3C7"/>
      <rect x="128" y="28" width="20" height="20" rx="3" fill="#F59E0B"/>
      <rect x="164" y="26" width="36" height="6" rx="3" fill="#FCD34D"/>
      <rect x="164" y="36" width="28" height="10" rx="3" fill="#B45309"/>
      <rect x="224" y="22" width="32" height="32" rx="6" fill="#D1FAE5"/>
      <rect x="230" y="28" width="20" height="20" rx="3" fill="#10B981"/>
      <rect x="266" y="26" width="36" height="6" rx="3" fill="#6EE7B7"/>
      <rect x="266" y="36" width="28" height="10" rx="3" fill="#065F46"/>
      {/* Bar chart */}
      <rect x="12" y="74" width="296" height="74" rx="8" fill="white" stroke="#BFDBFE" strokeWidth="1.5"/>
      {[0,1,2,3,4,5,6,7,8,9].map(i => {
        const h = [30,45,25,55,40,35,50,20,42,38][i];
        return <rect key={i} x={22+i*28} y={138-h} width="8" height={h} rx="2" fill="#3B82F6" opacity={0.7+i*0.03}/>;
      })}
      {[0,1,2,3,4,5,6,7,8,9].map(i => {
        const h = [20,30,18,38,28,22,35,15,28,25][i];
        return <rect key={i} x={32+i*28} y={138-h} width="8" height={h} rx="2" fill="#A29061" opacity={0.7}/>;
      })}
      <line x1="12" y1="138" x2="308" y2="138" stroke="#E2E8F0" strokeWidth="1"/>
    </svg>
  );
}

function IllustSOP() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#F0FDF4"/>
      <rect x="12" y="12" width="180" height="136" rx="8" fill="white" stroke="#BBF7D0" strokeWidth="1.5"/>
      {/* Tabel header */}
      <rect x="12" y="12" width="180" height="28" rx="8" fill="#ECFDF5"/>
      <rect x="24" y="20" width="60" height="12" rx="3" fill="#6EE7B7"/>
      <rect x="92" y="20" width="40" height="12" rx="3" fill="#6EE7B7"/>
      <rect x="140" y="20" width="40" height="12" rx="3" fill="#6EE7B7"/>
      {/* Baris tabel */}
      {[0,1,2,3,4].map(i => (
        <g key={i}>
          <rect x="24" y={50+i*18} width="60" height="10" rx="2" fill="#E2E8F0"/>
          <rect x="92" y={50+i*18} width="40" height="10" rx="2" fill="#E2E8F0"/>
          <rect x="140" y={50+i*18} width={i===1?32:i===3?24:40} height="10" rx="5" fill={i===1?"#DCFCE7":i===3?"#FEE2E2":"#DBEAFE"}/>
        </g>
      ))}
      {/* Panel kanan - status */}
      <rect x="204" y="12" width="104" height="136" rx="8" fill="white" stroke="#BBF7D0" strokeWidth="1.5"/>
      <rect x="214" y="22" width="84" height="14" rx="3" fill="#D1FAE5"/>
      <rect x="214" y="44" width="84" height="40" rx="6" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1"/>
      <rect x="220" y="52" width="40" height="8" rx="2" fill="#6EE7B7"/>
      <rect x="220" y="64" width="60" height="6" rx="2" fill="#BBF7D0"/>
      <rect x="214" y="92" width="84" height="10" rx="3" fill="#DCFCE7"/>
      <rect x="214" y="108" width="60" height="10" rx="3" fill="#E2E8F0"/>
      <rect x="214" y="124" width="84" height="16" rx="4" fill="#10B981"/>
      <rect x="226" y="129" width="60" height="6" rx="2" fill="white" opacity="0.7"/>
    </svg>
  );
}

function IllustBPMN() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#EFF6FF"/>
      {/* Flow diagram */}
      <rect x="20" y="62" width="48" height="36" rx="18" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
      <text x="44" y="85" textAnchor="middle" fontSize="9" fill="#1D4ED8" fontWeight="bold">MULAI</text>
      <line x1="68" y1="80" x2="100" y2="80" stroke="#93C5FD" strokeWidth="2" strokeDasharray="4 2"/>
      <rect x="100" y="62" width="52" height="36" rx="6" fill="white" stroke="#93C5FD" strokeWidth="2"/>
      <rect x="108" y="72" width="36" height="6" rx="2" fill="#BFDBFE"/>
      <rect x="108" y="82" width="28" height="6" rx="2" fill="#DBEAFE"/>
      <line x1="152" y1="80" x2="184" y2="80" stroke="#93C5FD" strokeWidth="2" strokeDasharray="4 2"/>
      {/* Diamond decision */}
      <polygon points="200,60 228,80 200,100 172,80" fill="#FEF3C7" stroke="#FCD34D" strokeWidth="2"/>
      <text x="200" y="84" textAnchor="middle" fontSize="8" fill="#92400E">Cek</text>
      <line x1="228" y1="80" x2="260" y2="80" stroke="#93C5FD" strokeWidth="2" strokeDasharray="4 2"/>
      <rect x="260" y="62" width="48" height="36" rx="18" fill="#D1FAE5" stroke="#6EE7B7" strokeWidth="2"/>
      <text x="284" y="85" textAnchor="middle" fontSize="9" fill="#065F46" fontWeight="bold">SELESAI</text>
      {/* Arrow heads */}
      <polygon points="100,76 92,80 100,84" fill="#93C5FD"/>
      <polygon points="184,76 176,80 184,84" fill="#93C5FD"/>
      <polygon points="260,76 252,80 260,84" fill="#93C5FD"/>
      {/* Tools palette */}
      <rect x="20" y="110" width="280" height="30" rx="6" fill="white" stroke="#DBEAFE" strokeWidth="1.5"/>
      {["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6"].map((c,i) => (
        <rect key={i} x={32+i*48} y="118" width="28" height="14" rx="4" fill={c} opacity="0.7"/>
      ))}
    </svg>
  );
}

function IllustJuknis() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#F5F3FF"/>
      {/* 3 tipe dokumen */}
      {[
        {x:12, color:"#DBEAFE", border:"#93C5FD", label:"Juknis", lc:"#1D4ED8"},
        {x:116, color:"#EDE9FE", border:"#C4B5FD", label:"Juklak", lc:"#6D28D9"},
        {x:220, color:"#FEF3C7", border:"#FCD34D", label:"SE", lc:"#B45309"},
      ].map(({x,color,border,label,lc}) => (
        <g key={label}>
          <rect x={x} y="12" width="90" height="110" rx="8" fill={color} stroke={border} strokeWidth="1.5"/>
          <rect x={x+8} y="22" width="74" height="12" rx="3" fill={border}/>
          <text x={x+45} y="33" textAnchor="middle" fontSize="9" fill={lc} fontWeight="bold">{label}</text>
          {[0,1,2,3,4].map(j => (
            <rect key={j} x={x+8} y={42+j*14} width={j%2===0?74:54} height="8" rx="2" fill="white" opacity="0.7"/>
          ))}
        </g>
      ))}
      {/* Toolbar bawah */}
      <rect x="12" y="132" width="296" height="20" rx="6" fill="white" stroke="#DDD6FE" strokeWidth="1.5"/>
      <rect x="20" y="138" width="60" height="8" rx="2" fill="#EDE9FE"/>
      <rect x="88" y="138" width="140" height="8" rx="2" fill="#F1F5F9"/>
      <rect x="236" y="136" width="64" height="12" rx="4" fill="#8B5CF6"/>
      <rect x="244" y="139" width="48" height="6" rx="2" fill="white" opacity="0.6"/>
    </svg>
  );
}

function IllustTambah() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#ECFDF5"/>
      <rect x="20" y="12" width="280" height="136" rx="8" fill="white" stroke="#BBF7D0" strokeWidth="1.5"/>
      <rect x="28" y="20" width="100" height="10" rx="3" fill="#D1FAE5"/>
      <rect x="28" y="36" width="264" height="12" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1"/>
      <rect x="30" y="39" width="80" height="6" rx="3" fill="#94A3B8"/>
      <rect x="28" y="56" width="120" height="12" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1"/>
      <rect x="160" y="56" width="132" height="12" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1"/>
      <rect x="28" y="76" width="264" height="28" rx="6" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1"/>
      <rect x="36" y="84" width="80" height="6" rx="2" fill="#CBD5E1"/>
      <rect x="36" y="94" width="120" height="6" rx="2" fill="#E2E8F0"/>
      <rect x="28" y="112" width="264" height="12" rx="6" fill="#F1F5F9" stroke="#E2E8F0" strokeWidth="1"/>
      <rect x="174" y="132" width="118" height="12" rx="6" fill="#10B981"/>
      <rect x="180" y="135" width="106" height="6" rx="3" fill="white" opacity="0.7"/>
    </svg>
  );
}

function IllustUsers() {
  return (
    <svg viewBox="0 0 320 160" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="160" rx="12" fill="#FFF1F2"/>
      {/* User cards */}
      {[0,1,2].map(i => (
        <g key={i}>
          <rect x={12+i*102} y="20" width="92" height="80" rx="8" fill="white" stroke="#FECDD3" strokeWidth="1.5"/>
          <circle cx={58+i*102} cy="50" r="18" fill={i===0?"#FECDD3":i===1?"#DBEAFE":"#D1FAE5"}/>
          <rect x={30+i*102} y="74" width="56" height="8" rx="3" fill="#F1F5F9"/>
          <rect x={38+i*102} y="86" width="40" height="6" rx="3" fill={i===0?"#FCA5A5":i===1?"#93C5FD":"#6EE7B7"}/>
        </g>
      ))}
      <rect x="12" y="112" width="296" height="36" rx="8" fill="white" stroke="#FECDD3" strokeWidth="1.5"/>
      <rect x="22" y="122" width="60" height="8" rx="3" fill="#FECDD3"/>
      <rect x="90" y="122" width="100" height="8" rx="3" fill="#F1F5F9"/>
      <rect x="254" y="120" width="46" height="12" rx="4" fill="#F43F5E"/>
      <rect x="260" y="123" width="34" height="6" rx="2" fill="white" opacity="0.7"/>
    </svg>
  );
}

/* ---------- Data panduan ---------- */

const PANDUAN_ITEMS = [
  {
    id: 'dashboard',
    icon: BookOpen,
    color: 'bg-blue-50 text-blue-600',
    colorDark: 'bg-blue-900/30 text-blue-400',
    border: 'border-blue-100',
    borderDark: 'border-blue-800/30',
    judul: 'Dashboard Monitoring',
    ringkasan: 'Memantau rekapitulasi dokumen seluruh unit kerja secara berjenjang dengan grafik distribusi.',
    Illust: IllustDashboard,
    deskripsi: 'Halaman utama yang menampilkan rekapitulasi dokumen ketatalaksanaan (Proses Bisnis, SOP, Standar Pelayanan) seluruh unit kerja Kementerian ATR/BPN secara berjenjang dari level 1 hingga level 3.',
    langkah: [
      'Klik nama unit kerja pada tabel untuk melihat rincian sub-unit (Level 1 → Level 2)',
      'Klik "Lihat Semua Dokumen" untuk menampilkan seluruh dokumen unit kerja (Level 3)',
      'Gunakan filter jenis, tahun, dan kolom pencarian untuk mempersempit hasil tampilan',
      'Klik nama dokumen pada tabel untuk membuka pratinjau isi dokumen langsung',
      'Klik "Unduh Excel" untuk mengekspor daftar dokumen ke file spreadsheet',
    ],
  },
  {
    id: 'sop',
    icon: FileSignature,
    color: 'bg-emerald-50 text-emerald-600',
    colorDark: 'bg-emerald-900/30 text-emerald-400',
    border: 'border-emerald-100',
    borderDark: 'border-emerald-800/30',
    judul: 'Dokumen SOP',
    ringkasan: 'Menyusun Standard Operating Procedure secara digital menggunakan Studio Editor interaktif.',
    Illust: IllustSOP,
    deskripsi: 'Menu khusus untuk menyusun Standard Operating Procedure (SOP) secara digital menggunakan Studio Editor SOP interaktif. Hasil SOP dapat diajukan ke Ortala untuk mendapatkan persetujuan.',
    langkah: [
      'Buka menu "Dokumen SOP" di sidebar kiri',
      'Klik "Buat SOP Baru" dan isi informasi identitas SOP (Judul, Nomor, Unit Kerja)',
      'Lengkapi tabel mutu baku di Studio Editor: isi kolom aktivitas, pelaksana, mutu baku, dan keterangan',
      'Simpan SOP dan ubah status menjadi "Pending" untuk mengajukan ke Ortala',
      'Admin Ortala akan menyetujui atau memberikan catatan revisi',
    ],
  },
  {
    id: 'bpmn',
    icon: GitBranch,
    color: 'bg-indigo-50 text-indigo-600',
    colorDark: 'bg-indigo-900/30 text-indigo-400',
    border: 'border-indigo-100',
    borderDark: 'border-indigo-800/30',
    judul: 'Proses Bisnis (BPMN)',
    ringkasan: 'Memodelkan alur kerja menggunakan standar BPMN 2.0 dengan editor visual drag-and-drop.',
    Illust: IllustBPMN,
    deskripsi: 'Editor visual untuk memodelkan alur kerja dan proses bisnis unit kerja menggunakan standar Business Process Model and Notation (BPMN 2.0). Diagram dapat disimpan dan diajukan untuk persetujuan.',
    langkah: [
      'Buka menu "Proses Bisnis (BPMN)" di sidebar kiri',
      'Klik "Buat BPMN Baru" untuk membuka studio editor visual',
      'Gunakan panel elemen di sisi kiri untuk menarik elemen (Start Event, Task, Gateway, End Event) ke kanvas',
      'Hubungkan elemen dengan klik dan tarik dari tepi elemen sumber ke elemen tujuan',
      'Simpan diagram dan ajukan untuk mendapatkan persetujuan Admin Ortala',
    ],
  },
  {
    id: 'juknis',
    icon: ScrollText,
    color: 'bg-violet-50 text-violet-600',
    colorDark: 'bg-violet-900/30 text-violet-400',
    border: 'border-violet-100',
    borderDark: 'border-violet-800/30',
    judul: 'Juknis / Juklak / SE',
    ringkasan: 'Repositori dokumen referensi petunjuk teknis, pelaksanaan, dan surat edaran.',
    Illust: IllustJuknis,
    deskripsi: 'Repositori dokumen referensi berupa Petunjuk Teknis (Juknis), Petunjuk Pelaksanaan (Juklak), dan Surat Edaran (SE) yang digunakan sebagai acuan pelaksanaan tugas oleh seluruh unit kerja.',
    langkah: [
      'Buka menu "Juknis / Juklak / SE" di sidebar kiri',
      'Gunakan filter jenis (Juknis/Juklak/SE) dan kolom pencarian untuk menemukan dokumen',
      'Klik "Buka" pada baris dokumen untuk mengakses file asli di sumber eksternal',
      'Admin Ortala dapat menambahkan dokumen baru menggunakan tombol "Tambah Dokumen Referensi"',
      'Isi form lengkap (judul, nomor, jenis, tahun, deskripsi, dan link dokumen) lalu simpan',
    ],
  },
  {
    id: 'tambah',
    icon: FilePlus,
    color: 'bg-amber-50 text-amber-600',
    colorDark: 'bg-amber-900/30 text-amber-400',
    border: 'border-amber-100',
    borderDark: 'border-amber-800/30',
    judul: 'Upload Manual (Tambah Dokumen)',
    ringkasan: 'Menambahkan dokumen Probis, SOP, atau SP secara manual dengan lampiran link eksternal.',
    Illust: IllustTambah,
    deskripsi: 'Fitur untuk menambahkan dokumen ketatalaksanaan (Proses Bisnis, SOP, atau Standar Pelayanan) secara manual ke dalam sistem, dengan menyertakan link dokumen dari Google Drive atau sumber lain.',
    langkah: [
      'Klik tombol "Tambah Dokumen Probis/SOP/SP Manual" di bagian Upload Manual pada sidebar kiri',
      'Isi nama proses/layanan yang akan dicatat',
      'Pilih jenis dokumen (Proses Bisnis, SOP, atau Standar Pelayanan) dan tahun terbit',
      'Pilih unit kerja secara berjenjang: Level 1 (unit utama) → Level 2 → Level 3',
      'Tempelkan link Google Drive atau sumber eksternal lain, isi dasar hukum, lalu klik Simpan',
    ],
  },
  {
    id: 'users',
    icon: Users,
    color: 'bg-rose-50 text-rose-600',
    colorDark: 'bg-rose-900/30 text-rose-400',
    border: 'border-rose-100',
    borderDark: 'border-rose-800/30',
    judul: 'Manajemen Pengguna',
    ringkasan: 'Kelola akun, hak akses, dan peran pengguna sistem (khusus Administrator Ortala).',
    Illust: IllustUsers,
    deskripsi: 'Menu khusus administrator untuk mengelola akun pengguna, mengatur hak akses berdasarkan unit kerja, dan menetapkan peran (role) masing-masing pengguna sistem SIMPEL.',
    langkah: [
      'Menu ini hanya tersedia bagi pengguna dengan peran Administrator Ortala',
      'Buka "Manajemen Pengguna" di sidebar kiri',
      'Klik "Tambah Pengguna" untuk mendaftarkan akun baru dengan username dan password',
      'Tetapkan peran (Admin/Viewer) dan unit kerja yang sesuai',
      'Edit atau nonaktifkan akun pengguna yang sudah tidak aktif',
    ],
  },
];

/* ---------- Komponen Modal Panduan ---------- */

function PanduanModal({ item, onClose }: { item: typeof PANDUAN_ITEMS[0]; onClose: () => void }) {
  const { isDarkMode } = useAppContext();
  const { icon: Icon, color, colorDark, judul, deskripsi, langkah, Illust } = item;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col ${
          isDarkMode ? 'bg-[#151F32] border border-slate-700' : 'bg-white'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-100 bg-slate-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isDarkMode ? colorDark : color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className={`text-lg font-extrabold ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>{judul}</h3>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Deskripsi */}
          <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{deskripsi}</p>

          {/* Langkah-langkah */}
          <div className={`rounded-2xl p-5 border ${isDarkMode ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Langkah Penggunaan
            </p>
            <div className="space-y-3">
              {langkah.map((l, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold mt-0.5 ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-white border border-slate-200 text-slate-600 shadow-sm'}`}>
                    {i + 1}
                  </span>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Infografis SVG */}
          <div>
            <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Tampilan Fitur
            </p>
            <div className={`rounded-2xl overflow-hidden border h-40 ${isDarkMode ? 'border-slate-700 opacity-80' : 'border-slate-100'}`}>
              <Illust />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t flex justify-end ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <button
            onClick={onClose}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors ${
              isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-[#002855] hover:bg-[#001b3a] text-white'
            }`}
          >
            Mengerti <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Halaman utama ---------- */

export default function PanduanPage() {
  const { isDarkMode } = useAppContext();
  const [activeItem, setActiveItem] = useState<typeof PANDUAN_ITEMS[0] | null>(null);

  return (
    <div className="overflow-auto p-4 md:p-6 lg:p-8 h-full">
      <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">

        {/* Header */}
        <div className="mb-2">
          <h2 className={`text-2xl md:text-3xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
            Panduan Penggunaan
          </h2>
          <p className={`mt-2 text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Pilih menu di bawah untuk melihat tata cara penggunaan masing-masing fitur
          </p>
        </div>

        {/* Banner info singkat */}
        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${isDarkMode ? 'bg-blue-900/20 border-blue-800/40' : 'bg-blue-50 border-blue-100'}`}>
          <div className={`p-2.5 rounded-xl shrink-0 ${isDarkMode ? 'bg-blue-800/50 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
            <HelpCircle className="w-5 h-5" />
          </div>
          <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-blue-300/80' : 'text-blue-700/80'}`}>
            <span className="font-bold">SIMPEL</span> — Sistem Informasi Manajemen Peta Layanan Kementerian ATR/BPN.
            Dikembangkan oleh Biro Ortala untuk membantu unit kerja mengelola dokumen ketatalaksanaan secara digital.
          </p>
        </div>

        {/* Grid kartu panduan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PANDUAN_ITEMS.map(item => {
            const { icon: Icon, color, colorDark, border, borderDark, judul, ringkasan, Illust } = item;
            return (
              <button
                key={item.id}
                onClick={() => setActiveItem(item)}
                className={`text-left rounded-2xl border p-0 shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 ${
                  isDarkMode
                    ? `bg-[#151F32] ${borderDark} hover:border-slate-600`
                    : `bg-white ${border} hover:border-slate-200`
                }`}
              >
                {/* Miniatur ilustrasi */}
                <div className="h-28 overflow-hidden">
                  <Illust />
                </div>

                {/* Konten kartu */}
                <div className="p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`p-2 rounded-xl ${isDarkMode ? colorDark : color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className={`text-sm font-extrabold leading-tight ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
                      {judul}
                    </h3>
                  </div>
                  <p className={`text-xs leading-relaxed line-clamp-2 mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {ringkasan}
                  </p>
                  <div className={`flex items-center gap-1 text-[11px] font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                    Lihat Panduan <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Kontak bantuan */}
        <div className={`rounded-2xl border p-5 text-center ${isDarkMode ? 'bg-[#151F32] border-slate-800' : 'bg-white border-slate-100'}`}>
          <p className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-[#002855]'}`}>
            Butuh bantuan lebih lanjut?
          </p>
          <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Hubungi tim Biro Organisasi, Tata Laksana, dan Manajemen Risiko (Ortala) ATR/BPN
          </p>
        </div>
      </div>

      {/* Modal popup panduan */}
      {activeItem && <PanduanModal item={activeItem} onClose={() => setActiveItem(null)} />}
    </div>
  );
}
