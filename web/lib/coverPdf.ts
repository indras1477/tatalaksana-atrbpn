// Baca PDF cover/dokumen TTE di browser (pdf.js): jumlah halaman, gambar mini tiap
// halaman, dan tebakan halaman cover. Dokumen yang ditandatangani elektronik (TTE
// e-Office) diunggah UTUH — halamannya tak bisa dipisah dgn aplikasi PDF biasa —
// lalu penyusun cukup mencentang halaman cover-nya; server yang memotongnya.

type PdfJs = typeof import('pdfjs-dist');
let pdfjsSiap: Promise<PdfJs> | null = null;
const muatPdfJs = () => (pdfjsSiap ||= import('pdfjs-dist').then(pdfjs => {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}));

export interface HalamanPdf { no: number; thumb: string; alur: boolean }
export interface InfoPdfCover { total: number; halaman: HalamanPdf[]; saran: number[] }

const MAKS_THUMB = 30;

/** Halaman alur SOP = memuat judul kolom "Kegiatan" + ("Pelaksana" atau "Mutu Baku"). */
const halamanAlur = (teks: string) => /kegiatan/i.test(teks) && /(pelaksana|mutu\s*baku)/i.test(teks);

export async function bacaPdfCover(data: ArrayBuffer): Promise<InfoPdfCover> {
  const pdfjs = await muatPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const halaman: HalamanPdf[] = [];
  for (let no = 1; no <= Math.min(doc.numPages, MAKS_THUMB); no++) {
    const page = await doc.getPage(no);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 220 / Math.max(vp1.width, vp1.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
    const isi = await page.getTextContent();
    const teks = isi.items.map(i => ('str' in i ? i.str : '')).join(' ');
    halaman.push({ no, thumb: canvas.toDataURL('image/jpeg', 0.7), alur: halamanAlur(teks) });
  }
  // Cover = halaman-halaman SEBELUM halaman alur pertama (minimal halaman 1).
  const pertamaAlur = halaman.find(h => h.alur)?.no;
  const saran = pertamaAlur && pertamaAlur > 1 ? Array.from({ length: pertamaAlur - 1 }, (_, i) => i + 1) : [1];
  await doc.destroy();
  return { total: doc.numPages, halaman, saran };
}

/** Cadangan bila PDF terkunci (server tak bisa memotongnya): render halaman terpilih jadi JPEG resolusi cetak. */
export async function gambarHalamanCover(data: ArrayBuffer, nomor: number[]): Promise<{ data: string; w: number; h: number }[]> {
  const pdfjs = await muatPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const hasil: { data: string; w: number; h: number }[] = [];
  for (const no of nomor) {
    const page = await doc.getPage(no);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 200 / 72 }); // ±200 dpi
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    hasil.push({ data: canvas.toDataURL('image/jpeg', 0.85), w: vp1.width, h: vp1.height });
  }
  await doc.destroy();
  return hasil;
}
