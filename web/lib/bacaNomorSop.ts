// Membaca NOMOR SOP dari cover bertanda tangan yang diunggah (PDF/JPG/PNG).
//
// Nomor SOP sering baru diisi DI LUAR aplikasi (diketik/ditulis pada cover sebelum
// ditandatangani), sehingga kolom nomor di sistem tetap kosong. Modul ini membaca
// cover tersebut dan menebak nomornya agar tinggal dikonfirmasi pengguna:
//   1. PDF dengan lapisan teks (umumnya dokumen TTE e-Office) → baca teksnya langsung.
//   2. Gambar atau PDF hasil scan (tanpa teks) → OCR dengan tesseract.js di browser.
//      Aset OCR (worker, core wasm, data bahasa) dilayani dari /public/tesseract agar
//      tidak bergantung CDN luar.
//
// Pola yang dicari mengikuti tata letak cover SOP: baris "Nomor SOP : <nomor>" yang
// disusul "Tanggal Pembuatan". Hasil selalu dianggap TEBAKAN — UI wajib menampilkan
// kolom yang bisa disunting sebelum disimpan.

const BASE_PATH = '/e-sop-atrbpn';

export interface HasilBacaNomor {
  /** Nomor SOP yang ditebak (sudah dirapikan), atau '' bila tidak ditemukan. */
  nomor: string;
  /** Dari mana nomor diperoleh. */
  sumber: 'teks-pdf' | 'ocr' | 'tidak-ada';
  /** Cuplikan teks di sekitar label (untuk ditampilkan sebagai bukti). */
  cuplikan: string;
}

type PdfJs = typeof import('pdfjs-dist');
let pdfjsSiap: Promise<PdfJs> | null = null;
const muatPdfJs = () => (pdfjsSiap ||= import('pdfjs-dist').then(pdfjs => {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}));

/** Label yang mengakhiri nilai nomor pada cover (baris berikutnya di tabel cover). */
const LABEL_BERIKUTNYA = '(?:Tanggal|Tgl\\.?|Disahkan|Nama\\s*SOP|Dibuat|Direvisi|Efektif|Revisi|Pembuatan|Kementerian|Badan)';

/** Rapikan hasil baca: samakan spasi, buang spasi di sekitar '/', '-', '.', huruf kapital. */
export function rapikanNomor(raw: string): string {
  let v = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  v = v.replace(/^[:：\-–—.\s]+/, '').replace(/[:：\-–—.\s]+$/, '');
  v = v.replace(/\s*([\/\-.])\s*/g, '$1');
  // OCR kerap salah baca garis miring sebagai huruf/angka mirip: "1" atau "l" atau "|" di antara blok.
  v = v.replace(/\s*\|\s*/g, '/');
  return v.toUpperCase().slice(0, 80);
}

/** Ubah 1/l/| menjadi I pada segmen yang dianggap angka Romawi. */
const keRomawi = (seg: string) => seg.replace(/[1l|]/g, 'I');

/**
 * Koreksi salah-baca khas OCR pada nomor SOP (HANYA untuk hasil OCR, bukan teks PDF):
 *  - huruf O di antara angka → 0        ("HK.O1" → "HK.01")
 *  - segmen bulan Romawi yang terbaca 1/l/| → I ("111/2026" → "III/2026", "1V" → "IV")
 *    Segmen dianggap bulan Romawi bila terdiri dari 1/l/|/I/V/X dan berada tepat
 *    sebelum segmen tahun 4 digit, atau memuat huruf V/X/I bercampur 1/l.
 */
export function koreksiSalahBacaOcr(nomor: string): string {
  let v = nomor;
  v = v.replace(/(?<=[\d.])O+(?=[\d.\/]|$)/g, m => '0'.repeat(m.length));
  const seg = v.split('/');
  for (let i = 0; i < seg.length; i++) {
    const s = seg[i];
    const sebelumTahun = i + 1 < seg.length && /^(19|20)\d{2}$/.test(seg[i + 1]);
    const polaRomawi = /^[1lI|]*[VX][1lI|]*$/.test(s) || /^[1lI|]{1,3}$/.test(s);
    const campurHuruf = /[lI|VX]/.test(s) && /^[1lI|VX]+$/.test(s);
    if (polaRomawi && (sebelumTahun || campurHuruf)) seg[i] = keRomawi(s);
  }
  return seg.join('/');
}

/** Cari nomor SOP di sebuah teks (hasil lapisan teks PDF atau OCR). */
export function cariNomorDiTeks(teks: string): { nomor: string; cuplikan: string } {
  const t = teks.replace(/\s+/g, ' ');
  // 1) Pola utama: "Nomor SOP : <nilai>" sampai label berikutnya.
  //    OCR bisa menghasilkan "Nomor SOP", "NOMOR SOP", "Nomer SOP", "No. SOP", "N0mor S0P".
  const reLabel = new RegExp(
    `N[o0]m[oe0]r\\.?\\s*S[O0]P\\s*[:：;.\\-]?\\s*(.{2,90}?)\\s*(?=${LABEL_BERIKUTNYA}\\b|$)`,
    'i',
  );
  let m = reLabel.exec(t);
  if (m) {
    const nilai = rapikanNomor(m[1]);
    // Buang hasil yang jelas bukan nomor (hanya huruf tanpa angka, atau terlalu pendek).
    if (/\d/.test(nilai) && nilai.length >= 3) return { nomor: nilai, cuplikan: potongCuplikan(t, m.index) };
  }
  // 2) Pola "No. SOP :" atau "Nomor :" tepat sebelum nilai yang mengandung "SOP" dan angka.
  m = /\bN[o0]\.?\s*S[O0]P\s*[:：]?\s*(.{2,90}?)\s*(?=(?:Tanggal|Tgl|Disahkan|Nama)\b|$)/i.exec(t);
  if (m) {
    const nilai = rapikanNomor(m[1]);
    if (/\d/.test(nilai) && nilai.length >= 3) return { nomor: nilai, cuplikan: potongCuplikan(t, m.index) };
  }
  // 3) Pola bebas: token bernomor yang memuat "SOP" dengan pemisah garis miring,
  //    mis. "SOP/14/ATRBPN", "12/SOP-HK.01/III/2026", "SOP.01/HK.02/III/2026".
  m = /\b([A-Z0-9.\-]*\/?\s?S[O0]P[A-Z0-9.\-]*(?:\s?\/\s?[A-Z0-9.\-]+){1,6})\b/i.exec(t);
  if (m) {
    const nilai = rapikanNomor(m[1]);
    if (/\d/.test(nilai) && nilai.includes('/')) return { nomor: nilai, cuplikan: potongCuplikan(t, m.index) };
  }
  return { nomor: '', cuplikan: '' };
}

const potongCuplikan = (t: string, idx: number) => t.slice(Math.max(0, idx - 10), idx + 120).trim();

/** Teks lapisan PDF untuk beberapa halaman pertama (cover). */
async function teksPdf(data: ArrayBuffer, maksHalaman = 3): Promise<{ teks: string; halaman: number }> {
  const pdfjs = await muatPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  let teks = '';
  const n = Math.min(doc.numPages, maksHalaman);
  for (let no = 1; no <= n; no++) {
    const page = await doc.getPage(no);
    const isi = await page.getTextContent();
    // Sisipkan spasi antar item agar label dan nilai tidak menempel.
    teks += ' ' + isi.items.map(i => ('str' in i ? i.str : '')).join(' ');
  }
  await doc.destroy();
  return { teks, halaman: n };
}

/** Render halaman PDF ke kanvas (±200 dpi) untuk OCR. */
async function kanvasDariPdf(data: ArrayBuffer, no = 1): Promise<HTMLCanvasElement> {
  const pdfjs = await muatPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const page = await doc.getPage(Math.min(no, doc.numPages));
  const vp = page.getViewport({ scale: 200 / 72 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  await doc.destroy();
  return canvas;
}

/** Gambar (JPG/PNG) → kanvas; diperbesar bila kecil agar OCR lebih akurat. */
async function kanvasDariGambar(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, gagal) => {
      const el = new Image();
      el.onload = () => ok(el); el.onerror = () => gagal(new Error('Gambar tidak dapat dibaca'));
      el.src = url;
    });
    const skala = Math.max(1, Math.min(3, 1700 / Math.max(img.naturalWidth, 1)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * skala); canvas.height = Math.round(img.naturalHeight * skala);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

/** OCR satu kanvas (bahasa Indonesia + Inggris) memakai aset lokal. */
async function ocrKanvas(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['ind', 'eng'], 1, {
    workerPath: `${BASE_PATH}/tesseract/worker.min.js`,
    corePath: `${BASE_PATH}/tesseract/core`,
    langPath: `${BASE_PATH}/tesseract/lang`,
    gzip: true,
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  try {
    // Nomor SOP ada di bagian atas cover — OCR hanya 45% bagian atas supaya lebih cepat
    // dan tidak terganggu teks alur di bawahnya.
    const tinggi = Math.round(canvas.height * 0.45);
    const atas = document.createElement('canvas');
    atas.width = canvas.width; atas.height = tinggi;
    atas.getContext('2d')!.drawImage(canvas, 0, 0, canvas.width, tinggi, 0, 0, canvas.width, tinggi);
    const { data } = await worker.recognize(atas);
    return data.text || '';
  } finally { await worker.terminate(); }
}

/**
 * Baca nomor SOP dari berkas cover.
 * @param blob  berkas cover (PDF/JPG/PNG)
 * @param opsi.ocr  izinkan OCR bila lapisan teks tidak ada (default true)
 */
export async function bacaNomorSopDariCover(
  blob: Blob,
  opsi: { ocr?: boolean; onProgress?: (tahap: string, p?: number) => void } = {},
): Promise<HasilBacaNomor> {
  const { ocr = true, onProgress } = opsi;
  const mime = blob.type || '';
  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test((blob as File).name || '');

  let kanvas: HTMLCanvasElement | null = null;
  if (isPdf) {
    const buf = await blob.arrayBuffer();
    onProgress?.('Membaca teks PDF…');
    try {
      const { teks } = await teksPdf(buf);
      if (teks.replace(/\s/g, '').length > 40) {
        const hasil = cariNomorDiTeks(teks);
        if (hasil.nomor) return { ...hasil, sumber: 'teks-pdf' };
      }
    } catch (e) { console.warn('Teks PDF gagal dibaca:', e); }
    if (!ocr) return { nomor: '', sumber: 'tidak-ada', cuplikan: '' };
    onProgress?.('Menyiapkan OCR…');
    kanvas = await kanvasDariPdf(buf, 1);
  } else {
    if (!ocr) return { nomor: '', sumber: 'tidak-ada', cuplikan: '' };
    onProgress?.('Menyiapkan OCR…');
    kanvas = await kanvasDariGambar(blob);
  }

  onProgress?.('Mengenali teks (OCR)…', 0);
  const teksOcr = await ocrKanvas(kanvas, p => onProgress?.('Mengenali teks (OCR)…', p));
  const hasil = cariNomorDiTeks(teksOcr);
  return hasil.nomor
    ? { ...hasil, nomor: koreksiSalahBacaOcr(hasil.nomor), sumber: 'ocr' }
    : { nomor: '', sumber: 'tidak-ada', cuplikan: teksOcr.replace(/\s+/g, ' ').trim().slice(0, 160) };
}
