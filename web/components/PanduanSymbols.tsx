'use client';

/* Komponen shared: legenda simbol SOP dan BPMN.
   Dipakai oleh panduan/page.tsx, sop/page.tsx, dan bpmn/page.tsx */

import { Clock } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* SOP                                                                  */
/* ------------------------------------------------------------------ */

export function SOPSymbolsSection({ isDarkMode }: { isDarkMode: boolean }) {
  const baganAlir = [
    {
      key: 'terminator',
      name: 'Terminator',
      sublabel: 'Mulai / Selesai',
      desc: 'Menandai titik awal (START) dan titik akhir (END) dari seluruh rangkaian proses kegiatan.',
      fill: '#DCFCE7', stroke: '#16A34A', text: '#166534',
    },
    {
      key: 'process',
      name: 'Proses / Kegiatan',
      sublabel: 'Aktivitas Utama',
      desc: 'Sebuah langkah atau tindakan konkret yang dilakukan oleh pelaksana dalam proses.',
      fill: '#DBEAFE', stroke: '#2563EB', text: '#1E40AF',
    },
    {
      key: 'decision',
      name: 'Keputusan',
      sublabel: 'Gateway / Percabangan',
      desc: 'Titik percabangan alur yang menghasilkan dua jalur berbeda berdasarkan kondisi Ya/Tidak.',
      fill: '#FEF9C3', stroke: '#CA8A04', text: '#713F12',
    },
    {
      key: 'arrow',
      name: 'Tanda Panah',
      sublabel: 'Alur / Koneksi',
      desc: 'Menunjukkan arah dan urutan perpindahan dari satu kegiatan ke kegiatan berikutnya.',
      fill: '#F1F5F9', stroke: '#475569', text: '#334155',
    },
  ];

  const renderShape = (key: string, fill: string, stroke: string, text: string) => {
    if (key === 'terminator') return (
      <svg viewBox="0 0 80 38" fill="none" className="w-20 h-10">
        <ellipse cx="40" cy="19" rx="36" ry="15" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <text x="40" y="23" textAnchor="middle" fontSize="9" fill={text} fontWeight="700">MULAI</text>
      </svg>
    );
    if (key === 'process') return (
      <svg viewBox="0 0 80 38" fill="none" className="w-20 h-10">
        <rect x="4" y="5" width="72" height="28" rx="4" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <text x="40" y="23" textAnchor="middle" fontSize="9" fill={text} fontWeight="700">Proses</text>
      </svg>
    );
    if (key === 'decision') return (
      <svg viewBox="0 0 80 38" fill="none" className="w-20 h-10">
        <polygon points="40,2 78,19 40,36 2,19" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <text x="40" y="23" textAnchor="middle" fontSize="8" fill={text} fontWeight="700">Ya/Tidak</text>
      </svg>
    );
    if (key === 'arrow') return (
      <svg viewBox="0 0 80 22" fill="none" className="w-20 h-6">
        <line x1="4" y1="11" x2="60" y2="11" stroke={stroke} strokeWidth="2.5"/>
        <polygon points="57,5 76,11 57,17" fill={stroke}/>
      </svg>
    );
    return null;
  };

  const tableItems = [
    { col: 'No', desc: 'Nomor urut setiap langkah kegiatan dalam proses', color: '#334155', bg: '#F8FAFC' },
    { col: 'Uraian Kegiatan', desc: 'Deskripsi lengkap dari setiap aktivitas atau langkah yang dilakukan', color: '#2563EB', bg: '#EFF6FF' },
    { col: 'Pelaksana', desc: 'Jabatan atau pihak yang bertanggung jawab melaksanakan kegiatan tersebut', color: '#16A34A', bg: '#F0FDF4' },
    { col: 'Persyaratan', desc: 'Dokumen, data, atau prasyarat yang diperlukan sebelum kegiatan dimulai', color: '#D97706', bg: '#FFFBEB' },
    { col: 'Waktu', desc: 'Durasi penyelesaian kegiatan menggunakan satuan Menit. 1 hari kerja = 5,5 jam = 330 menit (sesuai peraturan yang berlaku).', color: '#DC2626', bg: '#FEF2F2' },
    { col: 'Output', desc: 'Hasil, produk, atau dokumen yang dihasilkan dari pelaksanaan kegiatan', color: '#7C3AED', bg: '#F5F3FF' },
    { col: 'Keterangan', desc: 'Catatan tambahan atau penjelasan lebih lanjut mengenai kegiatan', color: '#0891B2', bg: '#ECFEFF' },
  ];

  const badgeItems = [
    { label: 'Draft', desc: 'SOP masih dalam tahap penyusunan, belum diajukan ke Biro Ortala MR.', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
    { label: 'Menunggu', desc: 'SOP telah diajukan dan menunggu persetujuan Biro Ortala MR.', color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
    { label: 'Perlu Revisi', desc: 'SOP dikembalikan untuk direvisi sesuai catatan Biro Ortala MR, lalu diajukan ulang.', color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' },
    { label: 'Menunggu Pengesahan Pimpinan', desc: 'SOP disetujui Biro Ortala MR. Cetak cover, mintakan tanda tangan pimpinan, lalu scan & unggah cover pada sistem.', color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
    { label: 'Menunggu Verifikasi Admin', desc: 'Cover bertanda tangan sudah diunggah. Admin memeriksa keabsahan tanda tangan & kelengkapan nomor SOP.', color: '#4338CA', bg: '#E0E7FF', border: '#A5B4FC' },
    { label: 'Menunggu Proses Penetapan Menteri', desc: 'Cover sudah disetujui admin. SOP menunggu Peraturan/penetapan menteri diproses sebelum resmi terbit.', color: '#6D28D9', bg: '#EDE9FE', border: '#C4B5FD' },
    { label: 'Terbit', desc: 'SOP sudah disahkan & ditetapkan. Resmi terbit, pindah ke Daftar SOP, masuk rekap Dashboard, dan kontennya terkunci.', color: '#166534', bg: '#DCFCE7', border: '#86EFAC' },
  ];

  const alurSOP = [
    { n: 1, t: 'Susun & Simpan Draft', d: 'Buat SOP di studio, lengkapi bagan alir & tabel mutu baku, lalu Simpan (status Draft).' },
    { n: 2, t: 'Kirim ke Biro Ortala MR', d: 'Ajukan dokumen. Status menjadi Menunggu persetujuan.' },
    { n: 3, t: 'Persetujuan Biro Ortala MR', d: 'Bila disetujui → Menunggu Pengesahan Pimpinan. Bila ada kekurangan → Perlu Revisi (perbaiki sesuai catatan, ajukan ulang).' },
    { n: 4, t: 'Pengesahan & Unggah Cover', d: 'Cetak cover, mintakan tanda tangan pimpinan, scan, lalu Unggah Cover TTD (PDF/JPG/PNG, maks 2 MB) — dapat dilakukan penyusun/unit atau admin. Status → Menunggu Verifikasi Admin.' },
    { n: 5, t: 'Verifikasi Admin', d: 'Admin memeriksa tanda tangan & nomor SOP pada cover, lalu Setujui Cover. Bila kurang → Kembalikan + catatan → penyusun unggah ulang cover.' },
    { n: 6, t: 'Menunggu Penetapan Menteri', d: 'SOP menunggu Peraturan/penetapan menteri diproses. Belum masuk Daftar SOP.' },
    { n: 7, t: 'Ditetapkan & Terbit', d: 'Setelah Peraturan ditetapkan, admin menekan tombol Ditetapkan → SOP TERBIT: pindah ke Daftar SOP, cover tergabung dalam PDF, masuk rekap Dashboard, konten terkunci (revisi = buat Salinan baru).' },
  ];

  const dm = isDarkMode;

  return (
    <div className="space-y-6">
      {/* Bagan Alir */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Simbol Bagan Alir (Permenpan RB No.&nbsp;35 Tahun 2012)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {baganAlir.map(item => (
            <div key={item.key} className={`flex items-start gap-3 p-3 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className="shrink-0 flex items-center justify-center w-20 h-10">
                {renderShape(item.key, item.fill, item.stroke, item.text)}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-extrabold leading-tight ${dm ? 'text-white' : 'text-slate-800'}`}>{item.name}</p>
                <p className={`text-[10px] font-semibold mb-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{item.sublabel}</p>
                <p className={`text-[11px] leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kolom Tabel Mutu Baku */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Kolom Tabel Mutu Baku SOP
        </p>
        {/* Catatan satuan waktu */}
        <div className={`mb-3 rounded-xl p-3 border flex items-start gap-2 ${dm ? 'bg-red-900/20 border-red-800/40' : 'bg-red-50 border-red-100'}`}>
          <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${dm ? 'text-red-400' : 'text-red-500'}`} />
          <p className={`text-[11px] leading-relaxed ${dm ? 'text-red-300/90' : 'text-red-700/80'}`}>
            <span className="font-bold">Satuan Waktu: Menit.</span>{' '}
            1 hari kerja = 5,5 jam = <span className="font-bold">330 menit</span> sesuai peraturan yang berlaku.
          </p>
        </div>
        <div className="space-y-2">
          {tableItems.map(item => (
            <div key={item.col} className={`flex items-start gap-3 p-2.5 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="shrink-0 pt-0.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold tracking-wide whitespace-nowrap"
                  style={{ backgroundColor: item.bg, color: item.color, border: `1.5px solid ${item.color}40` }}
                >
                  {item.col}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Status Badge */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Status Dokumen SOP
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {badgeItems.map(item => (
            <div key={item.label} className={`flex items-start gap-3 p-2.5 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="shrink-0 pt-0.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide"
                  style={{ backgroundColor: item.bg, color: item.color, border: `1.5px solid ${item.border}` }}
                >
                  {item.label}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alur Penerbitan SOP */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Alur Penerbitan SOP
        </p>
        <div className="space-y-2">
          {alurSOP.map(step => (
            <div key={step.n} className={`flex items-start gap-3 p-3 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${dm ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>{step.n}</div>
              <div className="min-w-0">
                <p className={`text-xs font-extrabold leading-tight ${dm ? 'text-white' : 'text-slate-800'}`}>{step.t}</p>
                <p className={`text-[11px] leading-relaxed mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{step.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl p-3 border flex items-start gap-2 ${dm ? 'bg-amber-900/15 border-amber-800/40' : 'bg-amber-50 border-amber-100'}`}>
          <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${dm ? 'text-amber-400' : 'text-amber-500'}`} />
          <p className={`text-[11px] leading-relaxed ${dm ? 'text-amber-200/90' : 'text-amber-800/80'}`}>
            <span className="font-bold">Daftar Pengajuan vs Daftar SOP:</span> selama belum Terbit, SOP berada di tab <b>Daftar Pengajuan</b>. Setelah Terbit, otomatis pindah ke tab <b>Daftar SOP</b>. Unggah cover dapat dilakukan oleh <b>penyusun</b> atau <b>admin</b>.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BPMN                                                                 */
/* ------------------------------------------------------------------ */

export function BPMNSymbolsSection({ isDarkMode }: { isDarkMode: boolean }) {
  const elements = [
    {
      key: 'start',
      name: 'Start Event',
      sublabel: 'Kejadian Awal',
      desc: 'Menandai titik di mana sebuah proses dimulai. Digambarkan sebagai lingkaran tipis berwarna hijau.',
      fill: '#DCFCE7', stroke: '#16A34A', text: '#166534',
    },
    {
      key: 'end',
      name: 'End Event',
      sublabel: 'Kejadian Akhir',
      desc: 'Menandai titik berakhirnya sebuah proses. Digambarkan sebagai lingkaran dengan garis tebal berwarna merah.',
      fill: '#FEE2E2', stroke: '#DC2626', text: '#991B1B',
    },
    {
      key: 'task',
      name: 'Task / Proses',
      sublabel: 'Aktivitas',
      desc: 'Sebuah pekerjaan atau aktivitas yang dilakukan dalam proses. Berbentuk persegi panjang dengan sudut membulat.',
      fill: '#DBEAFE', stroke: '#2563EB', text: '#1E40AF',
    },
    {
      key: 'subprocess',
      name: 'Sub-Process',
      sublabel: 'Proses Bersarang',
      desc: 'Aktivitas yang di dalamnya memiliki proses lebih rinci. Ditandai dengan simbol [+] di bagian bawah tengah.',
      fill: '#EDE9FE', stroke: '#7C3AED', text: '#4C1D95',
    },
    {
      key: 'pool',
      name: 'Pool',
      sublabel: 'Peserta / Pelaksana',
      desc: 'Wadah yang merepresentasikan satu peserta atau unit pelaksana utama. Dapat dibagi menjadi beberapa Lane.',
      fill: '#E0F2FE', stroke: '#0284C7', text: '#0369A1',
    },
    {
      key: 'gateway',
      name: 'Gateway / Keputusan',
      sublabel: 'Percabangan Alur',
      desc: 'Titik percabangan atau penggabungan alur proses. Simbol X menandakan percabangan eksklusif (hanya satu jalur yang diambil).',
      fill: '#FEF9C3', stroke: '#CA8A04', text: '#713F12',
    },
  ];

  const renderShape = (key: string, fill: string, stroke: string, text: string) => {
    if (key === 'start') return (
      <svg viewBox="0 0 80 40" fill="none" className="w-20 h-10">
        <circle cx="40" cy="20" r="16" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <text x="40" y="24" textAnchor="middle" fontSize="7.5" fill={text} fontWeight="700">START</text>
      </svg>
    );
    if (key === 'end') return (
      <svg viewBox="0 0 80 40" fill="none" className="w-20 h-10">
        <circle cx="40" cy="20" r="15" fill={fill} stroke={stroke} strokeWidth="5"/>
        <text x="40" y="24" textAnchor="middle" fontSize="7.5" fill={text} fontWeight="700">END</text>
      </svg>
    );
    if (key === 'task') return (
      <svg viewBox="0 0 80 40" fill="none" className="w-20 h-10">
        <rect x="4" y="4" width="72" height="32" rx="6" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <circle cx="14" cy="12" r="3" fill={stroke} opacity="0.6"/>
        <path d="M10 21 Q14 17 18 21" stroke={stroke} strokeWidth="1.5" fill="none" opacity="0.6"/>
        <text x="42" y="24" textAnchor="middle" fontSize="9" fill={text} fontWeight="700">Task</text>
      </svg>
    );
    if (key === 'subprocess') return (
      <svg viewBox="0 0 80 48" fill="none" className="w-20 h-12">
        <rect x="4" y="2" width="72" height="38" rx="6" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <text x="40" y="24" textAnchor="middle" fontSize="8" fill={text} fontWeight="700">Sub-Process</text>
        <rect x="33" y="30" width="14" height="12" rx="2" fill="white" stroke={stroke} strokeWidth="1.5"/>
        <line x1="40" y1="32.5" x2="40" y2="39.5" stroke={stroke} strokeWidth="1.5"/>
        <line x1="36.5" y1="36" x2="43.5" y2="36" stroke={stroke} strokeWidth="1.5"/>
      </svg>
    );
    if (key === 'pool') return (
      <svg viewBox="0 0 80 44" fill="none" className="w-20 h-11">
        <rect x="4" y="4" width="72" height="36" rx="4" fill={fill} stroke={stroke} strokeWidth="2"/>
        <rect x="4" y="4" width="17" height="36" rx="4" fill={stroke} opacity="0.25"/>
        <line x1="21" y1="4" x2="21" y2="40" stroke={stroke} strokeWidth="1.5"/>
        <text x="12.5" y="22" textAnchor="middle" fontSize="6.5" fill={text} fontWeight="800" transform="rotate(-90 12.5 22)">POOL</text>
        <line x1="21" y1="22" x2="76" y2="22" stroke={stroke} strokeWidth="1" strokeDasharray="3 2" opacity="0.4"/>
        <rect x="26" y="8" width="20" height="10" rx="2" fill={stroke} opacity="0.2"/>
        <rect x="52" y="8" width="20" height="10" rx="2" fill={stroke} opacity="0.2"/>
        <rect x="26" y="26" width="20" height="10" rx="2" fill={stroke} opacity="0.2"/>
      </svg>
    );
    if (key === 'gateway') return (
      <svg viewBox="0 0 80 40" fill="none" className="w-20 h-10">
        <polygon points="40,2 78,20 40,38 2,20" fill={fill} stroke={stroke} strokeWidth="2.5"/>
        <line x1="30" y1="12" x2="50" y2="28" stroke={stroke} strokeWidth="2.5"/>
        <line x1="50" y1="12" x2="30" y2="28" stroke={stroke} strokeWidth="2.5"/>
      </svg>
    );
    return null;
  };

  const bpmnBadgeItems = [
    { label: 'DRAFT', desc: 'Diagram sedang dalam tahap penyusunan, belum diajukan ke Biro Ortala MR.', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
    { label: 'MENUNGGU', desc: 'Diagram telah diajukan dan sedang menunggu persetujuan Biro Ortala MR.', color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
    { label: 'PERLU REVISI', desc: 'Diagram dikembalikan untuk direvisi sesuai catatan Biro Ortala MR, lalu diajukan ulang.', color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' },
    { label: 'DISETUJUI', desc: 'Diagram disetujui Biro Ortala MR: resmi berlaku, pindah ke tab Daftar Proses Bisnis, dan masuk rekap Dashboard.', color: '#166534', bg: '#DCFCE7', border: '#86EFAC' },
  ];

  const alurBPMN = [
    { n: 1, t: 'Susun & Simpan Draft', d: 'Buat diagram BPMN di studio (pool, lane, task, gateway, dsb.), lalu Simpan (status Draft).' },
    { n: 2, t: 'Kirim ke Biro Ortala MR', d: 'Ajukan diagram. Status menjadi Menunggu persetujuan.' },
    { n: 3, t: 'Persetujuan Biro Ortala MR', d: 'Bila disetujui → Disetujui: langsung pindah ke Daftar Proses Bisnis & masuk Dashboard. Bila ada kekurangan → Perlu Revisi (perbaiki sesuai catatan, ajukan ulang).' },
  ];

  const dm = isDarkMode;

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <p className={`text-[10px] leading-relaxed mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Berdasarkan standar <span className="font-bold">BPMN 2.0</span> — elemen-elemen di bawah tersedia di panel kiri kanvas editor.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {elements.map(item => (
            <div key={item.key} className={`flex items-start gap-3 p-3 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className="shrink-0 flex items-center justify-center" style={{ width: 80, minWidth: 80 }}>
                {renderShape(item.key, item.fill, item.stroke, item.text)}
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-extrabold leading-tight ${dm ? 'text-white' : 'text-slate-800'}`}>{item.name}</p>
                <p className={`text-[10px] font-semibold mb-1 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>{item.sublabel}</p>
                <p className={`text-[11px] leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Dokumen BPMN */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Status Dokumen Proses Bisnis
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {bpmnBadgeItems.map(item => (
            <div key={item.label} className={`flex items-start gap-3 p-2.5 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="shrink-0 pt-0.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide"
                  style={{ backgroundColor: item.bg, color: item.color, border: `1.5px solid ${item.border}` }}
                >
                  {item.label}
                </span>
              </div>
              <p className={`text-[11px] leading-relaxed ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alur Persetujuan BPMN */}
      <div>
        <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${dm ? 'text-slate-500' : 'text-slate-400'}`}>
          Alur Persetujuan Proses Bisnis
        </p>
        <div className="space-y-2">
          {alurBPMN.map(step => (
            <div key={step.n} className={`flex items-start gap-3 p-3 rounded-xl border ${dm ? 'bg-[#0F172A] border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${dm ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>{step.n}</div>
              <div className="min-w-0">
                <p className={`text-xs font-extrabold leading-tight ${dm ? 'text-white' : 'text-slate-800'}`}>{step.t}</p>
                <p className={`text-[11px] leading-relaxed mt-0.5 ${dm ? 'text-slate-400' : 'text-slate-600'}`}>{step.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className={`mt-3 rounded-xl p-3 border flex items-start gap-2 ${dm ? 'bg-blue-900/15 border-blue-800/40' : 'bg-blue-50 border-blue-100'}`}>
          <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${dm ? 'text-blue-400' : 'text-blue-500'}`} />
          <p className={`text-[11px] leading-relaxed ${dm ? 'text-blue-200/90' : 'text-blue-800/80'}`}>
            <span className="font-bold">Daftar Pengajuan vs Daftar Proses Bisnis:</span> sebelum disetujui, diagram ada di tab <b>Daftar Pengajuan</b>. Setelah <b>Disetujui</b>, otomatis pindah ke tab <b>Daftar Proses Bisnis</b>. Berbeda dengan SOP, Proses Bisnis tidak memerlukan unggah cover.
          </p>
        </div>
      </div>
    </div>
  );
}
