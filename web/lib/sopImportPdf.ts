// =============================================================================
// IMPOR SOP DARI PDF (semua pengguna penyusun)
// -----------------------------------------------------------------------------
// Membaca PDF SOP berbasis teks/vektor (hasil "Save as PDF" Visio/Word, BUKAN
// hasil scan) lalu menyusunnya kembali menjadi data kanvas Buat SOP (format yang
// sama dengan getSOPData()).
//
// Cara kerja — semuanya berdasar GEOMETRI halaman, bukan urutan teks:
//   1. Halaman cover  : judul kotak "Dasar Hukum", "Kualifikasi Pelaksana", dst.
//                        menjadi patokan; isi tiap kotak = teks di bawah judulnya
//                        sampai judul kotak berikutnya pada kolom yang sama.
//   2. Halaman alur   : garis vertikal tabel  → batas kolom (No | Kegiatan |
//                        Pelaksana… | Kelengkapan | Waktu | Output | Keterangan);
//                        garis horizontal      → batas baris.
//   3. Bentuk         : path tertutup ber-isi di area Pelaksana — belah ketupat
//                        (keputusan), persegi (proses), sudut membulat (mulai/
//                        selesai), segi lima kecil (konektor antarhalaman).
//   4. Panah          : garis tanpa isi yang ujungnya menyentuh bentuk + kepala
//                        panah segitiga kecil → arah dari bentuk asal ke tujuan.
//                        Ke baris berikutnya = alur lurus; ke baris lain = cabang.
//   5. Label panah    : teks pendek ("Ya"/"Tidak") terdekat ke garis panah.
//
// Hasilnya PERLU DIPERIKSA: teks hasil PDF kerap terpecah ("Me nit"), dan rute
// panah cabang hanya didekati (kanvas merutekan ulang garisnya sendiri).
// =============================================================================

type Pt = [number, number];
interface TextItem { x: number; y: number; w: number; h: number; str: string }
interface PathItem { fill: boolean; pts: Pt[]; curves: number; bb: [number, number, number, number] }
interface PageData { w: number; h: number; texts: TextItem[]; paths: PathItem[] }

type Symbol = 'start' | 'process' | 'decision' | 'connector' | 'end';
interface Shape { kind: Symbol; bb: [number, number, number, number]; cx: number; cy: number; text: string }

// ── 1. Ekstraksi mentah dari pdf.js ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJs = any;

export async function bacaHalamanPdf(pdfjs: PdfJs, data: Uint8Array): Promise<PageData[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const OPS = pdfjs.OPS;
  const hasil: PageData[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const texts: TextItem[] = [];
    const ol = await page.getOperatorList();
    let ctm = [1, 0, 0, 1, 0, 0];
    const tumpuk: number[][] = [];
    const kali = (a: number[], b: number[]) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    const ter = (x: number, y: number): Pt => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    const paths: PathItem[] = [];
    // Status teks (PDF §9.3) — teks DIRAKIT SENDIRI dari perintah showText, bukan
    // getTextContent(): pdf.js menyisipkan spasi palsu bila jarak antarhuruf lebar
    // (teks rata kiri-kanan hasil Visio → "Me nteri t entang"). Di dalam PDF, spasi
    // antarkata adalah glyph spasi sungguhan, jadi cukup gabungkan glyph apa adanya.
    let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
    let fs = 10, cs = 0, ws = 0, hs = 1, lead = 0;
    const geser = (m: number[], tx: number, ty: number) => [m[0], m[1], m[2], m[3], tx * m[0] + ty * m[2] + m[4], tx * m[1] + ty * m[3] + m[5]];
    const pindahBaris = (tx: number, ty: number) => { tlm = geser(tlm, tx, ty); tm = tlm; };
    const tulis = (glyphs: (number | { unicode?: string; width?: number; isSpace?: boolean } | null)[]) => {
      const awal = ter(tm[4], tm[5]);
      let str = '', x = 0;
      for (const g of glyphs) {
        if (typeof g === 'number') { x -= (g * fs) / 1000; continue; }
        if (!g) continue;
        str += g.unicode ?? '';
        x += (g.width ?? 0) * fs / 1000 + cs + (g.isSpace ? ws : 0);
      }
      x *= hs;
      const skala = Math.hypot(tm[0], tm[1]) * Math.hypot(ctm[0], ctm[1]);
      const tinggi = fs * Math.hypot(tm[2], tm[3]) * Math.hypot(ctm[2], ctm[3]);
      tm = geser(tm, x, 0);
      if (str.trim()) texts.push({ x: awal[0], y: awal[1], w: x * skala, h: tinggi || fs, str: str.replace(/\s+/g, ' ') });
    };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === OPS.beginText) { tm = [1, 0, 0, 1, 0, 0]; tlm = tm; }
      else if (fn === OPS.setFont) fs = a[1];
      else if (fn === OPS.setCharSpacing) cs = a[0];
      else if (fn === OPS.setWordSpacing) ws = a[0];
      else if (fn === OPS.setHScale) hs = a[0] / 100;
      else if (fn === OPS.setLeading) lead = a[0];
      // pdf.js v5 mengemas matriks sebagai satu argumen (Float32Array), versi lama 6 angka.
      else if (fn === OPS.setTextMatrix) { tm = Array.from(a.length === 1 ? a[0] : a) as number[]; tlm = tm; }
      else if (fn === OPS.moveText) pindahBaris(a[0], a[1]);
      else if (fn === OPS.setLeadingMoveText) { lead = -a[1]; pindahBaris(a[0], a[1]); }
      else if (fn === OPS.nextLine) pindahBaris(0, -lead);
      else if (fn === OPS.showText || fn === OPS.showSpacedText) tulis(a[0]);
      else if (fn === OPS.nextLineShowText) { pindahBaris(0, -lead); tulis(a[0]); }
      else if (fn === OPS.nextLineSetSpacingShowText) { ws = a[0]; cs = a[1]; pindahBaris(0, -lead); tulis(a[2]); }
      else if (fn === OPS.save) tumpuk.push(ctm);
      else if (fn === OPS.restore) ctm = tumpuk.pop() || ctm;
      else if (fn === OPS.transform) ctm = kali(ctm, Array.from(a.length === 1 ? a[0] : a) as number[]);
      else if (fn === OPS.constructPath) {
        // pdf.js v5: [operatorCat, [dataJalur], minMax]; dataJalur memakai kode
        // DrawOPS: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath.
        const cat = a[0];
        const d = a[1]?.[0];
        if (!d) continue;
        const isi = cat === OPS.fill || cat === OPS.eoFill || cat === OPS.fillStroke || cat === OPS.eoFillStroke ||
          cat === OPS.closeFillStroke || cat === OPS.closeEOFillStroke;
        const garis = cat === OPS.stroke || cat === OPS.closeStroke || isi;
        if (!garis) continue; // jalur kliping / endPath
        const pts: Pt[] = [];
        let k = 0, curves = 0;
        while (k < d.length) {
          const op = d[k++];
          if (op === 0 || op === 1) { pts.push(ter(d[k], d[k + 1])); k += 2; }
          else if (op === 2) { curves++; pts.push(ter(d[k + 4], d[k + 5])); k += 6; }
          else if (op === 3) { curves++; pts.push(ter(d[k + 2], d[k + 3])); k += 4; }
          else if (op === 4) { /* tutup jalur */ }
          else break;
        }
        if (!pts.length) continue;
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        paths.push({ fill: isi, pts, curves, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
      }
    }
    // Sebagian PDF menulis teks yang sama DUA KALI di posisi sama (lapisan ganda, mis.
    // blok pengesah di cover) — tanpa disaring, nama/jabatan terbaca dobel.
    const unik: TextItem[] = [];
    for (const t of texts) if (!unik.some(u => u.str === t.str && Math.abs(u.x - t.x) < 1 && Math.abs(u.y - t.y) < 1)) unik.push(t);
    hasil.push({ w: vp.width, h: vp.height, texts: unik, paths });
  }
  return hasil;
}

// ── 2. Utilitas teks ────────────────────────────────────────────────────────
const RAPI = (s: string) => s.replace(/\s+/g, ' ').trim();
// Nomor butir kadang tanpa spasi ("9.Peraturan…") — tetap dikenali sbg butir baru.
const PENANDA_DAFTAR = /^(\d{1,2}[.)](\s|(?=[A-Za-z]))|[a-zA-Z][.)]\s|[-•]\s)/;

/** Susun potongan teks dalam satu area menjadi baris-baris berurutan. */
function susunBaris(items: TextItem[]): string[] {
  const urut = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const baris: TextItem[][] = [];
  for (const it of urut) {
    const b = baris.find(r => Math.abs(r[0].y - it.y) <= Math.max(2, it.h * 0.35));
    if (b) b.push(it); else baris.push([it]);
  }
  return baris
    .sort((a, b) => b[0].y - a[0].y)
    .map(r => {
      r.sort((a, b) => a.x - b.x);
      let s = '';
      let akhir = -Infinity;
      for (const it of r) {
        const celah = it.x - akhir;
        // Potongan yang menempel (mis. "Undang " + "-" + "Undang") disambung tanpa
        // spasi; spasi di ujung potongan sebelumnya pun dibuang.
        if (s && celah <= Math.max(1.5, it.h * 0.22)) s = s.replace(/\s+$/, '') + it.str;
        else s += (s && !/\s$/.test(s) ? ' ' : '') + it.str;
        // Ujung "terlihat": lebar spasi penutup tidak dihitung.
        akhir = it.x + it.w - (/\s$/.test(it.str) ? it.h * 0.28 : 0);
      }
      return RAPI(s).replace(/^[-•](?=\S)/, '- ').replace(/^(\d{1,2}[.)])(?=[A-Za-z])/, '$1 ');
    })
    .filter(Boolean);
}

/** Gabungkan baris menjadi teks sel: paragraf disambung spasi, butir daftar
 *  ("1.", "a.", "-") tetap di baris baru. */
function teksSel(items: TextItem[]): string {
  const brs = susunBaris(items);
  let out = '';
  for (const b of brs) {
    if (!out) out = b;
    else if (PENANDA_DAFTAR.test(b)) out += '\n' + b;
    else out += (out.endsWith('-') ? '' : ' ') + b;
  }
  return out.trim();
}


const dalam = (it: TextItem, x0: number, x1: number, y0: number, y1: number) => {
  const cx = it.x + it.w / 2;
  return cx >= x0 && cx <= x1 && it.y >= y0 && it.y <= y1;
};

/** Kelompokkan nilai berdekatan (toleransi tol) → rata-ratanya, terurut. */
function kelompok(nilai: number[], tol: number): number[] {
  const s = [...nilai].sort((a, b) => a - b);
  const g: number[][] = [];
  for (const v of s) {
    const t = g[g.length - 1];
    if (t && v - t[t.length - 1] <= tol) t.push(v); else g.push([v]);
  }
  return g.map(t => t.reduce((a, b) => a + b, 0) / t.length);
}

// ── 3. Cover ────────────────────────────────────────────────────────────────
const JUDUL_KOTAK: { kunci: string; re: RegExp }[] = [
  { kunci: 'dasarHukum', re: /^dasar\s*hukum/i },
  { kunci: 'kualifikasi', re: /^kualifikasi\s*pelaksana/i },
  { kunci: 'keterkaitan', re: /^keterkaitan/i },
  { kunci: 'peralatan', re: /^peralatan/i },
  { kunci: 'peringatan', re: /^peringatan/i },
  { kunci: 'pencatatan', re: /^pencatatan/i },
];

function cariTeks(page: PageData, re: RegExp): TextItem | undefined {
  // Judul kotak bisa terpecah jadi beberapa potongan — cocokkan per baris.
  const baris = new Map<number, TextItem[]>();
  for (const t of page.texts) {
    const k = Math.round(t.y);
    const ada = [...baris.keys()].find(y => Math.abs(y - k) <= 2);
    baris.get(ada ?? k)?.push(t) ?? baris.set(k, [t]);
  }
  for (const its of baris.values()) {
    its.sort((a, b) => a.x - b.x);
    // Potong per kolom: potongan berjarak jauh (>40pt) dianggap kolom lain.
    let grup: TextItem[] = [];
    const cek = (g: TextItem[]) => {
      const s = RAPI(g.map(x => x.str).join(' '));
      if (re.test(s)) return { ...g[0], w: g[g.length - 1].x + g[g.length - 1].w - g[0].x, str: s };
      return undefined;
    };
    for (const t of its) {
      const akhir = grup.length ? grup[grup.length - 1].x + grup[grup.length - 1].w : -Infinity;
      if (grup.length && t.x - akhir > 40) { const r = cek(grup); if (r) return r; grup = []; }
      grup.push(t);
    }
    const r = cek(grup); if (r) return r;
  }
  return undefined;
}

interface CoverHasil {
  judul: string; jabatanPengesah: string; namaPengesah: string; nipPengesah: string; tglRevisi: string; tglEfektif: string;
  dasarHukum: string; kualifikasi: string; keterkaitan: string; peralatan: string; peringatan: string; pencatatan: string;
}

function bacaCover(page: PageData): Partial<CoverHasil> {
  const hasil: Partial<CoverHasil> = {};
  const judul = JUDUL_KOTAK.map(j => ({ ...j, t: cariTeks(page, j.re) })).filter(j => j.t) as { kunci: string; t: TextItem }[];
  if (!judul.length) return hasil;
  // Batas kolom kiri/kanan cover = posisi x judul kotak kolom kanan.
  const xKanan = Math.min(...judul.filter(j => j.t.x > page.w * 0.3).map(j => j.t.x), page.w);
  const xBatas = xKanan - 4;
  const bawah = 0;
  for (const j of judul) {
    const kiri = j.t.x < xBatas;
    const x0 = kiri ? 0 : xBatas, x1 = kiri ? xBatas : page.w;
    const lainBawah = judul.filter(o => o !== j && (o.t.x < xBatas) === kiri && o.t.y < j.t.y - 2).map(o => o.t.y);
    const y0 = lainBawah.length ? Math.max(...lainBawah) + 4 : bawah;
    const y1 = j.t.y - 2;
    const its = page.texts.filter(t => dalam(t, x0, x1, y0, y1));
    const isi = teksSel(its);
    (hasil as Record<string, string>)[j.kunci] = isi === '-' ? '' : isi;
  }

  // Kepala cover: "Judul SOP" & "Disahkan Oleh".
  const lblJudul = cariTeks(page, /^(judul|nama)\s*sop/i);
  const lblSah = cariTeks(page, /^disahkan\s*oleh/i);
  const yAtasIsi = Math.max(...judul.map(j => j.t.y)); // judul kotak teratas (Dasar Hukum)
  const isiKanan = (it: TextItem, lbl: TextItem) => it.x > lbl.x + lbl.w + 8 && it.str.trim() !== ':';
  if (lblJudul) {
    const its = page.texts.filter(t => isiKanan(t, lblJudul) && t.y <= lblJudul.y + 10 && t.y > yAtasIsi + 6);
    hasil.judul = RAPI(susunBaris(its).join(' '));
  }
  // Tanggal revisi/efektif bila terisi (nilai di kanan label, baris yang sama).
  for (const [k, re] of [['tglRevisi', /^tgl\.?\s*revisi/i], ['tglEfektif', /^tgl\.?\s*efektif/i]] as const) {
    const lbl = cariTeks(page, re);
    if (!lbl) continue;
    const v = RAPI(susunBaris(page.texts.filter(t => isiKanan(t, lbl) && Math.abs(t.y - lbl.y) < 3)).join(' ')).replace(/^:\s*/, '');
    if (v) hasil[k] = v;
  }
  if (lblSah) {
    const yBawah = lblJudul ? lblJudul.y + 10 : yAtasIsi + 6;
    const its = page.texts.filter(t => isiKanan(t, lblSah) && t.y <= lblSah.y + 10 && t.y > yBawah);
    const brs = susunBaris(its).map(b => b.replace(/^:\s*/, ''));
    const iNip = brs.findIndex(b => /^NIP\b/i.test(b));
    if (iNip >= 0) {
      hasil.nipPengesah = RAPI(brs[iNip].replace(/^NIP\.?\s*/i, ''));
      hasil.namaPengesah = iNip > 0 ? brs[iNip - 1] : '';
      hasil.jabatanPengesah = brs.slice(0, Math.max(0, iNip - 1)).join(' ').replace(/\s*,\s*$/, '');
    } else {
      hasil.jabatanPengesah = brs.join(' ');
    }
  }
  return hasil;
}

// ── 4. Halaman alur ─────────────────────────────────────────────────────────
interface Langkah {
  id: string; kegiatan: string; pelaksanaCol: number; symbol: Symbol; arrowDown: boolean;
  waktu: string; syarat: string; output: string; ket: string;
  nomorOverride?: string; isPageBreak?: boolean; shapeText?: string; arrowUp?: boolean; upText?: string;
  loopTarget?: string; loopTargetCol?: number; branchSide?: 'left' | 'right'; branchText?: string;
  downText?: string; extraBranches?: { target: string; targetCol?: number; side?: 'left' | 'right'; text?: string }[];
  extraShapes?: { colIdx: number; symbol: Symbol; arrowDown?: boolean; arrowUp?: boolean; upText?: string; shapeText?: string; loopTarget?: string; loopTargetCol?: number; branchSide?: 'left' | 'right'; branchText?: string }[];
}

let seq = 0;
const idBaru = () => `step-imp-${Date.now()}-${(seq++).toString(36)}`;

function klasifikasiBentuk(p: PathItem): Symbol | null {
  const [x0, y0, x1, y1] = p.bb;
  const w = x1 - x0, h = y1 - y0;
  if (w < 10 || h < 10 || w > 140 || h > 100) return null; // kepala panah, latar label, bingkai
  if (p.curves >= 2) return 'start';
  const unik = p.pts.filter((q, i) => i === 0 || Math.hypot(q[0] - p.pts[i - 1][0], q[1] - p.pts[i - 1][1]) > 0.5);
  if (unik.length > 1 && Math.hypot(unik[0][0] - unik[unik.length - 1][0], unik[0][1] - unik[unik.length - 1][1]) < 0.5) unik.pop();
  const tepi = (v: number, a: number) => Math.abs(v - a) < 1.5;
  const sejajar = unik.every(q => (tepi(q[0], x0) || tepi(q[0], x1)) && (tepi(q[1], y0) || tepi(q[1], y1)));
  if (unik.length === 4 && sejajar) return 'process';
  if (unik.length === 4) return 'decision';
  if (unik.length === 5) return 'connector';
  return null;
}

/** Jarak titik ke polyline. */
function jarakKeGaris(pt: Pt, pts: Pt[]): number {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((pt[0] - ax) * dx + (pt[1] - ay) * dy) / L)) : 0;
    m = Math.min(m, Math.hypot(pt[0] - (ax + t * dx), pt[1] - (ay + t * dy)));
  }
  return m;
}

const dekatKotak = (pt: Pt, bb: [number, number, number, number], tol: number) =>
  pt[0] >= bb[0] - tol && pt[0] <= bb[2] + tol && pt[1] >= bb[1] - tol && pt[1] <= bb[3] + tol;

interface HalamanAlur {
  headers: string[];
  baris: { no: string; kegiatan: string; syarat: string; waktu: string; output: string; ket: string; shapes: Shape[]; yAtas: number; yBawah: number }[];
  panah: { dari: Shape; ke: Shape; sisi: 'left' | 'right' | 'bottom' | 'top'; label: string }[];
}

function bacaHalamanAlur(page: PageData): HalamanAlur | null {
  const lblKeg = cariTeks(page, /^kegiatan$/i);
  if (!lblKeg) return null;

  // Batas kolom: garis vertikal tabel yang menjangkau baris judul kolom. Diukur
  // RELATIF terhadap tabel, bukan tinggi halaman — halaman terakhir sering hanya
  // berisi 1–2 baris sehingga garisnya pendek (dulu halaman itu terlewat).
  const vertikal = page.paths.filter(p => !p.fill && p.bb[2] - p.bb[0] < 1.5 && p.bb[3] - p.bb[1] > 40 && p.bb[3] >= lblKeg.y - 2);
  const xs = vertikal.map(p => (p.bb[0] + p.bb[2]) / 2);
  // Bingkai tabel berupa persegi (bukan garis) — tepinya ikut menjadi batas.
  // (Persegi seukuran halaman penuh = latar/kliping, bukan bingkai tabel.)
  const bingkai = page.paths.filter(p => p.bb[2] - p.bb[0] > page.w * 0.6 && p.bb[3] - p.bb[1] > 40
    && p.bb[3] >= lblKeg.y - 2 && p.bb[1] < lblKeg.y
    && p.bb[0] > 2 && p.bb[1] > 2 && p.bb[2] < page.w - 2 && p.bb[3] < page.h - 2);
  for (const b of bingkai) xs.push(b.bb[0], b.bb[2]);
  const kolom = kelompok(xs, 3);
  if (kolom.length < 8) return null;
  const xKeg = lblKeg.x + lblKeg.w / 2;
  const iKeg = kolom.findIndex((x, i) => i < kolom.length - 1 && xKeg > x && xKeg < kolom[i + 1]);
  if (iKeg < 1) return null;
  // Urutan kolom: [No][Kegiatan][Pelaksana…][Kelengkapan][Waktu][Output][Keterangan]
  const nKol = kolom.length - 1;
  const iPel0 = iKeg + 1, iPel1 = nKol - 4; // eksklusif
  const nPel = iPel1 - iPel0;
  if (nPel < 1) return null;
  const sel = (i: number) => [kolom[i], kolom[i + 1]] as const;

  // Batas atas data = garis horizontal tepat di bawah judul kolom.
  const horiz = page.paths
    .filter(p => p.bb[3] - p.bb[1] < 1.5 && p.bb[2] - p.bb[0] > 60)
    .map(p => (p.bb[1] + p.bb[3]) / 2)
    .concat(page.paths.filter(p => p.bb[2] - p.bb[0] > page.w * 0.5 && p.bb[3] - p.bb[1] > 5).flatMap(p => [p.bb[1], p.bb[3]]));
  const yKepala = Math.max(...horiz.filter(y => y < lblKeg.y - 4));
  // Dasar tabel = ujung bawah garis kolom (garis yang tingginya mendekati yang tertinggi).
  const tinggiMaks = Math.max(...vertikal.map(p => p.bb[3] - p.bb[1]), 0);
  const yDasar = Math.min(
    ...vertikal.filter(p => p.bb[3] - p.bb[1] >= tinggiMaks * 0.6).map(p => p.bb[1]),
    // Persegi yang menjulur di bawah baris judul = bingkai tabel (bukan latar judul kolom).
    ...bingkai.filter(b => b.bb[1] < yKepala - 20).map(b => b.bb[1]),
  );
  const pemisah = kelompok(horiz.filter(y => y < yKepala - 8 && y > yDasar + 8), 4);
  const tepiBaris = [yKepala, ...pemisah.sort((a, b) => b - a), yDasar];

  // Nama pelaksana (judul kolom).
  const yAtasTabel = Math.max(...vertikal.map(p => p.bb[3]), ...bingkai.map(b => b.bb[3]), lblKeg.y + 20);
  // Yang dibuang hanya label grup "Pelaksana" (paling atas) — baris terakhir judul
  // kolom seperti "Jabatan Fungsional/ Jabatan Pelaksana" juga berbunyi "Pelaksana".
  const yGrup = Math.max(...page.texts.filter(t => /^pelaksana$/i.test(RAPI(t.str))).map(t => t.y));
  const headers: string[] = [];
  for (let c = iPel0; c < iPel1; c++) {
    const [x0, x1] = sel(c);
    const its = page.texts.filter(t => dalam(t, x0, x1, yKepala, yAtasTabel) && !(/^pelaksana$/i.test(RAPI(t.str)) && Math.abs(t.y - yGrup) < 2));
    headers.push(RAPI(susunBaris(its).join(' ')).toUpperCase());
  }

  // Bentuk (dedupe pasangan fill+stroke berbingkai sama).
  const xPel0 = kolom[iPel0], xPel1 = kolom[iPel1];
  const shapes: Shape[] = [];
  for (const p of page.paths) {
    if (!p.fill) continue;
    const cx = (p.bb[0] + p.bb[2]) / 2, cy = (p.bb[1] + p.bb[3]) / 2;
    if (cx < xPel0 || cx > xPel1 || cy > yKepala || cy < yDasar) continue;
    const k = klasifikasiBentuk(p);
    if (!k) continue;
    // Latar putih label panah ("Ya"/"Tidak" pada keluaran Visio) berupa persegi berisi
    // yang pas membungkus satu baris teks — bukan bentuk proses.
    if (k === 'process' && p.bb[3] - p.bb[1] < 14 && page.texts.some(t => dalam(t, p.bb[0] - 1, p.bb[2] + 1, p.bb[1] - 1, p.bb[3] + 1))) continue;
    if (shapes.some(s => Math.abs(s.cx - cx) < 2 && Math.abs(s.cy - cy) < 2)) continue;
    shapes.push({ kind: k, bb: p.bb, cx, cy, text: '' });
  }
  // Teks di dalam bentuk.
  const teksDipakai = new Set<TextItem>();
  for (const s of shapes) {
    const its = page.texts.filter(t => dalam(t, s.bb[0], s.bb[2], s.bb[1] - 1, s.bb[3]));
    its.forEach(t => teksDipakai.add(t));
    s.text = RAPI(susunBaris(its).join(' '));
  }

  // Panah: garis tak berisi yang menyentuh bentuk, kepala = segitiga kecil berisi.
  const kepala = page.paths.filter(p => p.fill && p.bb[2] - p.bb[0] < 10 && p.bb[3] - p.bb[1] < 10 && p.bb[2] - p.bb[0] > 2);
  const bentukDi = (pt: Pt, tol: number) => shapes
    .filter(s => dekatKotak(pt, s.bb, tol))
    .sort((a, b) => Math.hypot(a.cx - pt[0], a.cy - pt[1]) - Math.hypot(b.cx - pt[0], b.cy - pt[1]))[0];
  const labelTeks = page.texts.filter(t => !teksDipakai.has(t) && t.x + t.w / 2 > xPel0 && t.x < xPel1 && t.y < yKepala && t.y > yDasar);
  // Label panah bisa beberapa baris ("[belum dilakukan / pemeriksaan / kelengkapan]") —
  // gabungkan baris yang berdekatan & bertumpuk mendatar menjadi satu blok label.
  const label: { its: TextItem[]; str: string }[] = [];
  for (const t of [...labelTeks].sort((a, b) => b.y - a.y)) {
    const cx = t.x + t.w / 2;
    const blok = label.find(b => b.its.some(u => Math.abs(u.y - t.y) <= Math.max(u.h, t.h) * 1.6 &&
      Math.abs((u.x + u.w / 2) - cx) <= Math.max(u.w, t.w) / 2 + 4));
    if (blok) blok.its.push(t); else label.push({ its: [t], str: '' });
  }
  for (const b of label) b.str = RAPI(susunBaris(b.its).join(' '));
  const panah: HalamanAlur['panah'] = [];
  for (const g of page.paths) {
    if (g.fill || g.pts.length < 2) continue;
    const w = g.bb[2] - g.bb[0], h = g.bb[3] - g.bb[1];
    if (w > xPel1 - xPel0 + 5 || h > page.h * 0.5) continue;
    const a = g.pts[0], b = g.pts[g.pts.length - 1];
    // Kepala panah milik ujung ini = segitiga di dekatnya yang berada DI DEPAN arah
    // garis (bukan kepala panah garis lain yang kebetulan berujung di titik sama).
    const kepUjung = (e: Pt, sebelum: Pt) => {
      const L = Math.hypot(e[0] - sebelum[0], e[1] - sebelum[1]) || 1;
      const dx = (e[0] - sebelum[0]) / L, dy = (e[1] - sebelum[1]) / L;
      let terbaik: PathItem | undefined, skor = 0.5;
      for (const k of kepala) {
        if (!dekatKotak(e, k.bb, 2.5)) continue;
        const cx = (k.bb[0] + k.bb[2]) / 2, cy = (k.bb[1] + k.bb[3]) / 2;
        const sk = (cx - e[0]) * dx + (cy - e[1]) * dy;
        if (sk > skor) { skor = sk; terbaik = k; }
      }
      return terbaik ? { k: terbaik, skor } : undefined;
    };
    const kb = kepUjung(b, g.pts[g.pts.length - 2]), ka = kepUjung(a, g.pts[1]);
    let ujung: Pt, pangkal: Pt, k: PathItem;
    if (kb && (!ka || kb.skor >= ka.skor)) { ujung = b; pangkal = a; k = kb.k; }
    else if (ka) { ujung = a; pangkal = b; k = ka.k; }
    else continue;
    // Titik tumpu kepala panah: verteks segitiga terjauh dari ujung garis.
    const tip = k.pts.reduce((m, q) => (Math.hypot(q[0] - ujung[0], q[1] - ujung[1]) > Math.hypot(m[0] - ujung[0], m[1] - ujung[1]) ? q : m), k.pts[0]);
    const dari = bentukDi(pangkal, 3);
    const ke = bentukDi(tip, 4);
    if (!dari || !ke || dari === ke) continue;
    const sisi: 'left' | 'right' | 'bottom' | 'top' =
      Math.abs(pangkal[0] - dari.bb[0]) < 2 ? 'left' : Math.abs(pangkal[0] - dari.bb[2]) < 2 ? 'right'
        : Math.abs(pangkal[1] - dari.bb[1]) < 2 ? 'bottom' : 'top';
    // Label terdekat ke garis (maks 20pt).
    let lbl = '';
    let dMin = 20;
    for (const b of label) {
      const d = Math.min(...b.its.map(t => jarakKeGaris([t.x + t.w / 2, t.y + t.h / 2], g.pts)));
      if (d < dMin && b.str.length <= 90) { dMin = d; lbl = b.str; }
    }
    panah.push({ dari, ke, sisi, label: lbl });
  }

  // Isi baris. Sel teks bisa TERGABUNG beberapa baris (mis. Keterangan baris 1–2):
  // garis pemisah baris tidak melintasi kolom itu. Seluruh teksnya diberikan ke baris
  // teratas rentang tsb (kanvas tidak mengenal sel gabung) — dulu terbelah per baris.
  const segH = page.paths.filter(p => p.bb[3] - p.bb[1] < 1.5 && p.bb[2] - p.bb[0] > 8)
    .map(p => ({ y: (p.bb[1] + p.bb[3]) / 2, x0: p.bb[0], x1: p.bb[2] }));
  const melintasi = (y: number, c: number) => {
    const [x0, x1] = sel(c), mid = (x0 + x1) / 2;
    return segH.some(s => Math.abs(s.y - y) < 3 && s.x0 <= mid && s.x1 >= mid);
  };
  // Pemisah ke-i dianggap ada bila melintasi kolom Kegiatan (kolom yang tak pernah digabung).
  const tergabung = (i: number, c: number) => i > 0 && i < tepiBaris.length - 1 && melintasi(tepiBaris[i], iKeg) && !melintasi(tepiBaris[i], c);
  const baris: HalamanAlur['baris'] = [];
  for (let r = 0; r < tepiBaris.length - 1; r++) {
    const yA = tepiBaris[r], yB = tepiBaris[r + 1];
    const ambil = (c: number) => {
      if (c !== iKeg && c !== 0 && tergabung(r, c)) return ''; // lanjutan sel gabung di atasnya
      let akhir = r + 1;
      if (c !== iKeg && c !== 0) while (akhir < tepiBaris.length - 1 && tergabung(akhir, c)) akhir++;
      const [x0, x1] = sel(c);
      return teksSel(page.texts.filter(t => dalam(t, x0, x1, tepiBaris[akhir], yA)));
    };
    const shp = shapes.filter(s => s.cy < yA && s.cy > yB).sort((a, b) => a.cx - b.cx);
    const no = ambil(0), keg = ambil(iKeg);
    if (!no && !keg && !shp.length) continue;
    baris.push({
      no, kegiatan: keg, syarat: ambil(iPel1), waktu: ambil(iPel1 + 1), output: ambil(iPel1 + 2), ket: ambil(iPel1 + 3),
      shapes: shp, yAtas: yA, yBawah: yB,
    });
  }
  // Kolom pelaksana tiap bentuk dihitung belakangan (butuh batas kolom).
  for (const s of shapes) (s as Shape & { col?: number }).col = Math.max(0, kolom.findIndex((x, i) => i >= iPel0 && i < iPel1 && s.cx >= x && s.cx < kolom[i + 1]) - iPel0);

  return { headers, baris, panah };
}

// ── 5. Rakit data SOP ───────────────────────────────────────────────────────
export interface HasilImpor {
  data: Record<string, unknown>;
  ringkasan: { halamanAlur: number; langkah: number; bentuk: number; panah: number; peringatan: string[] };
}

export function rakitSop(pages: PageData[]): HasilImpor {
  const peringatan: string[] = [];
  // Cover bisa lebih dari satu halaman (Dasar Hukum berlanjut, Keterkaitan/Peringatan
  // di halaman 2). Semua halaman SEBELUM halaman alur pertama dibaca & isinya disambung.
  const iAlurPertama = pages.findIndex(p => !!cariTeks(p, /^kegiatan$/i));
  const halCover = pages.slice(0, iAlurPertama > 0 ? iAlurPertama : 1);
  const cover: Partial<CoverHasil> = {};
  for (const p of halCover) {
    const c = bacaCover(p) as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(c)) {
      if (v === undefined) continue;
      const lama = (cover as Record<string, string | undefined>)[k];
      const kotak = JUDUL_KOTAK.some(j => j.kunci === k);
      if (lama === undefined) (cover as Record<string, string>)[k] = v;
      else if (kotak && v) (cover as Record<string, string>)[k] = lama ? `${lama}\n${v}` : v;
    }
  }
  const alur = pages.map(bacaHalamanAlur).filter((x): x is HalamanAlur => !!x);
  if (!alur.length) throw new Error('Tabel alur SOP (kolom "Kegiatan" & "Pelaksana") tidak ditemukan di PDF ini.');

  const nPel = Math.max(...alur.map(a => a.headers.length));
  if (alur.some(a => a.headers.length !== nPel)) peringatan.push('Jumlah kolom pelaksana berbeda antarhalaman — disamakan ke yang terbanyak.');

  const steps: Langkah[] = [];
  const peta = new Map<Shape, { step: Langkah; extra?: number }>();
  let nBentuk = 0, nPanah = 0, sekolom = 0;
  let terminatorPertama = true;
  for (const hal of alur) {
    // Bentuk UTAMA tiap baris = bentuk yang menerima alur dari baris di atasnya
    // (atau mengalirkan ke baris di bawahnya) — bukan sekadar yang paling kiri.
    // Kanvas menggambar "panah turun" ke bentuk utama baris berikutnya; kalau yang
    // dipilih salah, mis. dua konektor sebaris, panah "Ya" masuk ke konektor keliru.
    const ada = (dari: Shape | undefined, ke: Shape) => hal.panah.some(p => p.ke === ke && (!dari || p.dari === dari));
    hal.baris.forEach((b, i) => {
      if (b.shapes.length < 2) return;
      const sebelum = hal.baris[i - 1], sesudah = hal.baris[i + 1];
      const pilih =
        (sebelum?.shapes[0] && b.shapes.find(x => ada(sebelum.shapes[0], x))) ||
        (sebelum && b.shapes.find(x => sebelum.shapes.some(d => ada(d, x)))) ||
        (sesudah && b.shapes.find(x => hal.panah.some(p => p.dari === x && sesudah.shapes.includes(p.ke))));
      if (pilih) b.shapes = [pilih, ...b.shapes.filter(x => x !== pilih)];
    });
    hal.baris.forEach((b, i) => {
      const colOf = (s: Shape) => (s as Shape & { col?: number }).col ?? 0;
      const utama = b.shapes[0];
      const simbolDari = (s: Shape): Symbol => {
        if (s.kind !== 'start') return s.kind;
        const k = terminatorPertama ? 'start' : 'end';
        terminatorPertama = false;
        return k;
      };
      const step: Langkah = {
        id: idBaru(), kegiatan: b.kegiatan, pelaksanaCol: utama ? colOf(utama) : 0,
        symbol: utama ? simbolDari(utama) : 'process', arrowDown: false,
        waktu: b.waktu.replace(/^(\d+)\s*Menit$/i, '$1'), syarat: b.syarat, output: b.output, ket: b.ket,
      };
      if (!b.no.replace(/[.\s]/g, '')) step.nomorOverride = '';
      if (utama?.text) step.shapeText = utama.text;
      if (utama) { peta.set(utama, { step }); nBentuk++; }
      const lain = b.shapes.slice(1).filter(s => {
        // Kanvas hanya menampung SATU bentuk per sel — bentuk kedua di kolom yang sama dilewati.
        const dobel = colOf(s) === colOf(b.shapes[0]) || b.shapes.slice(1).some(o => o !== s && colOf(o) === colOf(s) && o.cx < s.cx);
        if (dobel) sekolom++;
        return !dobel;
      });
      if (lain.length) {
        step.extraShapes = lain.map(s => ({ colIdx: colOf(s), symbol: simbolDari(s), ...(s.text ? { shapeText: s.text } : {}) }));
        lain.forEach((s, x) => { peta.set(s, { step, extra: x }); nBentuk++; });
      }
      if (i === hal.baris.length - 1) step.isPageBreak = true;
      steps.push(step);
    });
  }
  if (steps.length) delete steps[steps.length - 1].isPageBreak;

  // Panah → alur lurus (ke langkah berikutnya) atau cabang (ke langkah lain).
  for (const hal of alur) {
    for (const p of hal.panah) {
      const a = peta.get(p.dari), b = peta.get(p.ke);
      if (!a || !b) continue;
      nPanah++;
      const iA = steps.indexOf(a.step), iB = steps.indexOf(b.step);
      const colKe = (p.ke as Shape & { col?: number }).col ?? 0;
      const target = a.extra !== undefined ? a.step.extraShapes![a.extra] : a.step;
      // Label ditulis APA ADANYA (kosong bila di PDF tanpa label) — kalau dibiarkan
      // undefined, kanvas memasang label bawaan "Ya"/"Tidak" yang tidak ada di PDF.
      // Kanvas selalu mengarahkan "panah turun" ke bentuk di KOLOM YANG SAMA bila baris
      // berikutnya punya bentuk di kolom itu. Jadi bila tujuan PDF ada di kolom lain
      // sementara kolom sendiri terisi bentuk lain (mis. "Ya" ke konektor kanan, bukan
      // ke konektor tepat di bawah), gambarkan sebagai panah cabang dari samping.
      const colDari = (p.dari as Shape & { col?: number }).col ?? 0;
      // Bentuk TAMBAHAN hanya bisa "turun lurus" di kolomnya sendiri; ke kolom lain → cabang.
      const tambahanKeKolomLain = a.extra !== undefined && colKe !== colDari;
      const kolomSendiriTerisi = tambahanKeKolomLain || iB === iA + 1 && colKe !== colDari &&
        alur.some(h => h.baris.some(r => r.shapes.includes(p.ke) && r.shapes.some(x => x !== p.ke && ((x as Shape & { col?: number }).col ?? -1) === colDari)));
      if (iB === iA + 1 && b.extra === undefined && !kolomSendiriTerisi) {
        target.arrowDown = true;
        if (a.extra === undefined && !a.step.downText) a.step.downText = p.label;
        continue;
      }
      // Naik lurus ke bentuk TEPAT di atasnya pada kolom yang sama (mis. konektor
      // "Tidak" dari halaman lain masuk ke dasar belah ketupat) → "panah naik" kanvas,
      // bukan cabang memutar lewat samping yang bertumpuk dengan panah lain.
      if (iB === iA - 1 && colKe === colDari && b.extra === undefined && !target.arrowUp) {
        target.arrowUp = true;
        target.upText = p.label;
        continue;
      }
      const sisi: 'left' | 'right' = p.sisi === 'left' ? 'left' : 'right';
      if (!target.loopTarget) {
        target.loopTarget = b.step.id; target.loopTargetCol = colKe; target.branchSide = sisi;
        target.branchText = p.label;
      } else if (a.extra === undefined) {
        a.step.extraBranches = [...(a.step.extraBranches || []), { target: b.step.id, targetCol: colKe, side: sisi, text: p.label }];
      }
    }
  }

  // Judul kolom disimpan PER HALAMAN KANVAS, dan kanvas memecah halaman otomatis
  // tiap 7 baris — halaman PDF berisi >7 baris menjadi beberapa halaman kanvas,
  // masing-masing harus mendapat judul kolom halaman PDF asalnya.
  // SOP hasil impor = SOP BARU → halaman kanvas pertama memuat 6 baris, berikutnya 7.
  // Kecuali halaman pertama PDF memang berisi 7 baris (tata letak lama): ikuti PDF agar
  // baris ke-7 (biasanya konektor) tidak terlempar sendirian ke halaman kedua.
  const barisAlur1 = (alur[0]?.baris.length ?? 0) === 7 ? 7 : 6;
  const kapasitas = (hal: number) => (hal === 0 ? barisAlur1 : 7);
  const pelaksanaHeaders: string[][] = [];
  let dipecah = false;
  alur.forEach(a => {
    const h = [...a.headers];
    while (h.length < nPel) h.push('');
    let sisa = a.baris.length, n = 0;
    do { sisa -= kapasitas(pelaksanaHeaders.length + n); n++; } while (sisa > 0);
    if (n > 1) dipecah = true;
    for (let i = 0; i < n; i++) pelaksanaHeaders.push([...h]);
  });
  if (dipecah) peringatan.push('Ada halaman PDF berisi lebih banyak baris dari kapasitas kanvas (Alur 1: 6 baris, berikutnya 7) — di kanvas dipecah menjadi beberapa halaman.');

  if (sekolom) peringatan.push(`${sekolom} bentuk berada satu sel dengan bentuk lain (kanvas hanya menampung satu bentuk per sel) dan tidak diimpor — cek baris konektor.`);
  if (!cover.dasarHukum) peringatan.push('Halaman cover (Dasar Hukum dst.) tidak terbaca — isi cover tetap seperti semula.');
  peringatan.push('Periksa kembali panah cabang (arah & label Ya/Tidak) serta panah di sekitar konektor antarhalaman.');

  const data: Record<string, unknown> = { pelaksanaHeaders, steps, barisAlur1 };
  // Bila kotak cover terbaca, SEMUA kotak ikut ditulis (kosong = "") — kalau tidak,
  // isi lama kanvas tertinggal pada kotak yang di PDF berisi "-".
  const coverTerbaca = JUDUL_KOTAK.some(j => (cover as Record<string, string | undefined>)[j.kunci] !== undefined);
  if (coverTerbaca) for (const j of JUDUL_KOTAK) data[j.kunci] = (cover as Record<string, string | undefined>)[j.kunci] ?? '';
  for (const k of ['judul', 'jabatanPengesah', 'namaPengesah', 'nipPengesah', 'tglRevisi', 'tglEfektif'] as const) if (cover[k]) data[k] = cover[k];
  return { data, ringkasan: { halamanAlur: alur.length, langkah: steps.length, bentuk: nBentuk, panah: nPanah, peringatan } };
}

/** Pintu masuk dari browser: berkas PDF → data SOP. */
export async function imporSopDariPdf(file: ArrayBuffer): Promise<HasilImpor> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pages = await bacaHalamanPdf(pdfjs, new Uint8Array(file));
  return rakitSop(pages);
}
