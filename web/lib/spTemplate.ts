// =============================================================================
// TEMPLATE NASKAH STANDAR PELAYANAN (SP)
// -----------------------------------------------------------------------------
// Susunan komponen mengikuti Permenpan RB Nomor 15 Tahun 2014 tentang Pedoman
// Standar Pelayanan (dasar: Pasal 21 UU Nomor 25 Tahun 2009):
//   • Service Delivery (6 komponen) — WAJIB DIPUBLIKASIKAN
//   • Manufacturing   (8 komponen) — pengelolaan pelayanan di internal organisasi
// Komponen tambahan (mis. "Peringatan") boleh disisipkan sesuai kebutuhan unit.
// =============================================================================

export interface SPItem {
  id: string;
  komponen: string;
  uraian: string;   // HTML sederhana: <p>, <ol>/<ul>/<li>, <b>/<i>/<u>, <br>
  /** Sel NO menyatu ke baris di atasnya: baris ini tidak bernomor dan tidak
   *  ikut menaikkan penomoran (mis. baris lanjutan "Terintegrasi dengan sistem
   *  layanan diluar kementerian" pada naskah PTP). */
  gabungNo?: boolean;
  /** Sel KOMPONEN menyatu ke baris di atasnya — satu komponen, beberapa uraian. */
  gabungKomponen?: boolean;
  /** Sel URAIAN menyatu ke baris di atasnya — beberapa komponen, satu uraian. */
  gabungUraian?: boolean;
}

/**
 * Hitung nomor & rentang gabung (rowspan) tiap baris dalam satu kelompok.
 * Baris yang menyatu ke atas TIDAK merender selnya sendiri; sel milik baris
 * pembuka yang direntangkan ke bawah. Logika ini digandakan di
 * api/spDocument.js — ubah keduanya bila aturannya berganti.
 */
export function hitungBaris(items: SPItem[]) {
  let nomor = 0;
  return items.map((it, i) => {
    if (!(i > 0 && it.gabungNo)) nomor += 1;
    const rentang = (kunci: 'gabungNo' | 'gabungKomponen' | 'gabungUraian') => {
      if (i > 0 && it[kunci]) return 0;           // selnya milik baris di atas
      let n = 1;
      while (i + n < items.length && items[i + n][kunci]) n += 1;
      return n;
    };
    return {
      nomor,
      noSpan: rentang('gabungNo'),
      kompSpan: rentang('gabungKomponen'),
      uraianSpan: rentang('gabungUraian'),
    };
  });
}
export interface SPSection {
  id: string;
  judul: string;
  items: SPItem[];
}
export interface SPDoc {
  judul: string;          // Nama Pelayanan
  lampiran: string;       // blok kanan atas, mis. "Lampiran III Standar Pelayanan …"
  nomor: string;
  tanggal: string;
  /** Judul tengah di atas Nama Pelayanan. SENGAJA KOSONG secara bawaan —
   *  naskah langsung dimulai dari Nama Pelayanan. Diisi hanya bila unit memang
   *  memakai kepala naskah, mis. "STANDAR PELAYANAN PENATAAN AGRARIA …". */
  instansi: string;
  klasifikasi: string;    // SP Layanan Pertanahan | SP Layanan Penataan Ruang
  unitKerja: string;
  subUnitKerja: string;
  sections: SPSection[];
  /** Keterkaitan dokumen: tautan ke SOP / Proses Bisnis yang sudah ditetapkan.
   *  Metadata murni (tak ikut dicetak) — dikelola dari panel properti studio. */
  tautan?: TautanDok[];
}

/** Satu dokumen terkait. `sumber` membedakan asalnya:
 *  - 'registri' → tabel `dokumen` (yang dihitung Dashboard; dibuka lewat `link`)
 *  - 'studio'   → naskah sop_models/bpmn_models (dibuka di studio, mode lihat) */
export interface TautanDok {
  kind: 'sop' | 'bpmn';
  id: number;
  judul: string;
  sumber?: 'registri' | 'studio';
  unit?: string | null;
  tahun?: string | null;
  link?: string | null;
}

/** Klasifikasi SP — dipilih di modal "Informasi SP Baru". */
export const KLASIFIKASI_SP = ['SP Layanan Pertanahan', 'SP Layanan Penataan Ruang'] as const;

/** Ukuran kertas & huruf naskah SP — harus sama persis dengan api/spDocument.js. */
export const SP_PAGE = {
  w: 210, h: 330,                                  // F4 potret (mm)
  mTop: 25, mRight: 20, mBottom: 20, mLeft: 20,    // margin (mm)
  fontStack: "'Bookman Old Style','URW Bookman','Bookman',serif",
  fontSize: '12pt',
} as const;
export const SP_CONTENT_W = SP_PAGE.w - SP_PAGE.mLeft - SP_PAGE.mRight;   // 170 mm
export const SP_CONTENT_H = SP_PAGE.h - SP_PAGE.mTop - SP_PAGE.mBottom;   // 285 mm
// Proporsi kolom mengikuti naskah SP ATR/BPN yang sudah ditetapkan (≈6% / 30% / 64%),
// sehingga nama komponen panjang seperti "Jaminan keamanan dan keselamatan
// pelayanan" tidak pecah menjadi terlalu banyak baris.
export const SP_COL = { no: 10, komponen: 52, uraian: SP_CONTENT_W - 10 - 52 }; // 10/52/108

export const SEC_SERVICE = 'KOMPONEN SERVICE DELIVERY';
export const SEC_MANUFACTURING = 'KOMPONEN MANUFACTURING';

const KOMPONEN_SERVICE = [
  'Persyaratan',
  'Sistem, mekanisme, dan prosedur',
  'Jangka waktu penyelesaian',
  'Biaya/tarif',
  'Produk pelayanan',
  'Penanganan pengaduan, saran, dan masukan',
];
const KOMPONEN_MANUFACTURING = [
  'Dasar Hukum',
  'Sarana, prasarana, dan/atau fasilitas',
  'Kompetensi pelaksana',
  'Pengawasan internal',
  'Jumlah pelaksana',
  'Jaminan pelayanan',
  'Jaminan keamanan dan keselamatan pelayanan',
  'Evaluasi kinerja pelaksana',
];

/** Komponen tambahan yang lazim dipakai di luar 14 komponen baku. */
export const KOMPONEN_TAMBAHAN = [
  'Peringatan',
  'Definisi',
  'Waktu pelayanan',
  'Dasar hukum tambahan',
  'Keterangan',
];

let urutan = 0;
export const spId = (awalan = 'it') => {
  urutan += 1;
  return `${awalan}-${Date.now().toString(36)}-${urutan.toString(36)}`;
};

/**
 * Contoh isi baku — disarikan dari naskah SP ATR/BPN yang sudah ditetapkan.
 * Penyusun dapat menyisipkannya sekali klik lalu menyesuaikan, alih-alih
 * mengetik ulang paragraf yang praktis sama di setiap dokumen.
 */
export const CONTOH_ISI: Record<string, string> = {
  'penanganan pengaduan, saran, dan masukan':
    '<p>Pengaduan, saran dan masukan dapat disampaikan melalui:</p><ol>' +
    '<li>Help Desk pada Kantor Pertanahan Terdekat/Kanwil Pertanahan/Kementerian ATR/BPN;</li>' +
    '<li>Kotak pengaduan, saran dan masukan;</li>' +
    '<li>e-lapor: lapor.go.id;</li><li>SMS: 1708;</li>' +
    '<li>Instagram: @atr_bpn;</li><li>Youtube: Kementerian ATR BPN;</li>' +
    '<li>Twitter: kementerian.atrbpn;</li><li>Email: surat@atrbpn.go.id;</li>' +
    '<li>https://bit.ly/HotlinePelayananPertanahan.</li></ol>',
  'biaya/tarif':
    '<p>Sesuai dengan ketentuan peraturan pemerintah tentang jenis dan tarif atas jenis PNBP yang berlaku pada Kementerian Agraria dan Tata Ruang/BPN.</p>',
  'pengawasan internal':
    '<ol><li>Pengawasan dilakukan oleh atasan langsung pejabat yang ditugaskan;</li>' +
    '<li>Pengawasan juga dilakukan dengan menggunakan aplikasi monitoring berkas berbasis Web KKP yang dapat dipantau dan diakses oleh seluruh pejabat di lingkungan Kantor Pertanahan/Kantor Wilayah BPN/Kementerian ATR/BPN.</li></ol>',
  'jaminan keamanan dan keselamatan pelayanan':
    '<ol><li>Disediakan minimal 2 (dua) orang petugas keamanan pada area loket pelayanan (1 di dalam, 1 di luar);</li>' +
    '<li>Disediakan tabung pemadam kebakaran di area loket pelayanan;</li>' +
    '<li>Disediakan kamera pengawas (CCTV) pada area loket pelayanan;</li>' +
    '<li>Disediakan informasi jalur evakuasi dalam keadaan darurat pada area loket pelayanan;</li>' +
    '<li>Disediakan informasi titik kumpul dalam keadaan darurat pada area gedung pelayanan;</li>' +
    '<li>Setiap penerimaan berkas oleh Petugas BPN akan disertai tanda bukti penerimaan;</li>' +
    '<li>Semua transaksi pembayaran PNBP dilakukan melalui bank mitra (cashless);</li>' +
    '<li>Semua petugas lapangan dilengkapi dengan kartu tanda pengenal dan Surat Tugas;</li>' +
    '<li>Bebas korupsi, kolusi dan nepotisme (KKN); dan</li>' +
    '<li>Produk layanan dibubuhi tanda tangan serta cap basah/tanda tangan elektronik, sehingga dijamin keasliannya.</li></ol>',
  'evaluasi kinerja pelaksana':
    '<p>Evaluasi kinerja pelaksana dilaksanakan dengan melakukan survei kepuasan pengguna layanan dengan mekanisme:</p><ol>' +
    '<li>Survei dilakukan dengan menggunakan aplikasi survei kepuasan masyarakat yang diisi secara online oleh pengguna layanan setelah menerima produk pelayanan;</li>' +
    '<li>Data isian survei yang masuk akan diolah oleh sistem dan kemudian hasilnya akan diumumkan pada web Kementerian ATR/BPN dan akan menjadi bahan evaluasi oleh masing-masing Kantor Pertanahan/Kantor Wilayah BPN/Kementerian ATR/BPN.</li></ol>',
};

export const contohIsiUntuk = (komponen: string) =>
  CONTOH_ISI[komponen.trim().toLowerCase()] || '';

/** Naskah kosong berisi 14 komponen baku, siap diisi penyusun. */
export function templateSPBaru(opsi?: Partial<SPDoc>): SPDoc {
  return {
    judul: '',
    lampiran: '',
    nomor: '',
    tanggal: '',
    instansi: '',
    klasifikasi: '',
    unitKerja: '',
    subUnitKerja: '',
    sections: [
      { id: spId('sec'), judul: SEC_SERVICE, items: KOMPONEN_SERVICE.map(k => ({ id: spId(), komponen: k, uraian: '' })) },
      { id: spId('sec'), judul: SEC_MANUFACTURING, items: KOMPONEN_MANUFACTURING.map(k => ({ id: spId(), komponen: k, uraian: '' })) },
    ],
    ...opsi,
  };
}

/** Baca sp_data tersimpan; kembalikan template baru bila kosong/rusak. */
export function parseSPDoc(raw: string | null | undefined, opsi?: Partial<SPDoc>): SPDoc {
  if (!raw) return templateSPBaru(opsi);
  try {
    const d = JSON.parse(raw) as Partial<SPDoc>;
    const kosong = templateSPBaru(opsi);
    const sections = Array.isArray(d.sections) && d.sections.length
      ? d.sections.map((s, i) => ({
          id: s?.id || spId('sec'),
          judul: String(s?.judul || `Kelompok ${i + 1}`),
          items: (Array.isArray(s?.items) ? s.items : []).map(it => ({
            id: it?.id || spId(),
            komponen: String(it?.komponen || ''),
            uraian: String(it?.uraian || ''),
            ...(it?.gabungNo ? { gabungNo: true } : {}),
            ...(it?.gabungKomponen ? { gabungKomponen: true } : {}),
            ...(it?.gabungUraian ? { gabungUraian: true } : {}),
          })),
        }))
      : kosong.sections;
    return {
      judul: String(d.judul ?? kosong.judul),
      lampiran: String(d.lampiran ?? ''),
      nomor: String(d.nomor ?? ''),
      tanggal: String(d.tanggal ?? ''),
      instansi: String(d.instansi ?? kosong.instansi),
      klasifikasi: String(d.klasifikasi ?? opsi?.klasifikasi ?? ''),
      unitKerja: String(d.unitKerja ?? opsi?.unitKerja ?? ''),
      subUnitKerja: String(d.subUnitKerja ?? opsi?.subUnitKerja ?? ''),
      sections,
      tautan: (Array.isArray(d.tautan) ? d.tautan : [])
        .filter(t => t && (t.kind === 'sop' || t.kind === 'bpmn') && Number.isFinite(Number(t.id)))
        .map(t => ({
          kind: t.kind, id: Number(t.id), judul: String(t.judul || ''),
          // Tautan lama (sebelum registri didukung) tidak menyimpan `sumber`;
          // semuanya berasal dari naskah studio.
          sumber: t.sumber === 'registri' ? 'registri' as const : 'studio' as const,
          ...(t.unit ? { unit: String(t.unit) } : {}),
          ...(t.tahun ? { tahun: String(t.tahun) } : {}),
          ...(t.link ? { link: String(t.link) } : {}),
        })),
    };
  } catch {
    return templateSPBaru(opsi);
  }
}

/**
 * Bersihkan HTML uraian di sisi klien (hasil tempel dari Word kerap membawa
 * <span style>, <font>, dan komentar MSO). Aturannya sama dengan sanitizeHtml
 * di api/spDocument.js supaya tampilan studio = hasil PDF/DOCX.
 */
const TAG_AMAN = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'div']);
export function bersihkanUraian(html: string): string {
  if (!html) return '';
  let s = html;
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (utuh, tag: string) => {
    const t = tag.toLowerCase();
    if (!TAG_AMAN.has(t)) return '';
    if (t === 'br') return '<br>';
    return utuh.startsWith('</') ? `</${t}>` : `<${t}>`;
  });
  return s.trim();
}

/** Ringkasan teks polos — dipakai untuk mendeteksi komponen yang masih kosong. */
export const uraianKosong = (html: string) =>
  !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
