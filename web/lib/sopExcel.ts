// Ekspor Excel SOP (.xlsx, exceljs): sheet "Ringkasan" (identitas cover, total waktu,
// jumlah tahapan, rekap per pelaksana — memakai RUMUS Excel yang merujuk sheet alur)
// + sheet "Alur SOP" (tabel mutu baku). Angka hasil juga disertakan sebagai nilai awal
// rumus agar tampil benar walau aplikasi pembuka belum menghitung ulang.

export const MENIT_PER_HARI_KERJA = 330;

/** Waktu sebuah langkah → menit. Satuan: menit/jam/hari (330 mnt)/minggu (5 hari)/bulan (22 hari); angka polos = menit. */
export function menitDariWaktu(waktu: string | undefined | null): number | null {
  const str = (waktu || '').toLowerCase();
  if (!str.trim()) return null;
  const re = /(\d+(?:[.,]\d+)?)\s*(menit|mnt|jam|jm|hari|hr|minggu|mgg|bulan|bln)/g;
  let menit = 0, cocok = false, m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    cocok = true;
    const n = parseFloat(m[1].replace(',', '.'));
    const u = m[2];
    if (u === 'menit' || u === 'mnt') menit += n;
    else if (u === 'jam' || u === 'jm') menit += n * 60;
    else if (u === 'hari' || u === 'hr') menit += n * MENIT_PER_HARI_KERJA;
    else if (u === 'minggu' || u === 'mgg') menit += n * 5 * MENIT_PER_HARI_KERJA;
    else menit += n * 22 * MENIT_PER_HARI_KERJA;
  }
  if (cocok) return menit;
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) ? null : n;
}

export interface BarisExcelSop {
  no: string; kegiatan: string; pelaksanaCol: number; simbol: string; teksBentuk?: string;
  syarat: string; waktu: string; output: string; ket: string;
}
export interface DataExcelSop {
  judul: string; nomor: string; unitKerja: string; subUnitKerja: string; jenisSOP: string; klasifikasiSOP: string;
  tglPembuatan: string; tglRevisi: string; tglEfektif: string;
  pengesahanTte?: boolean;
  jabatanPengesah: string; namaPengesah: string; nipPengesah: string;
  cover: { judul: string; isi: string }[];
  halaman: { headers: string[]; baris: BarisExcelSop[] }[];
}

const polos = (s: string) => (s || '').replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/_([^_\n]+?)_/g, '$1').replace(/\r/g, '').trim();
const rapi = (s: string) => polos(s).replace(/\s+/g, ' ').trim();
const kolomHuruf = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

const NAVY = 'FF002855', ABU = 'FFE2E8F0', ABU_MUDA = 'FFF8FAFC', HIJAU = 'FFE8F5E9';
const garis = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };

export async function unduhExcelSop(d: DataExcelSop) {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIMPEL ATR/BPN';
  wb.calcProperties.fullCalcOnLoad = true;
  const wsR = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
  const wsA = wb.addWorksheet('Alur SOP', { views: [{ state: 'frozen', ySplit: 4 }] });

  // ── Sheet "Alur SOP" ─────────────────────────────────────────────────────────
  const nPel = Math.max(1, ...d.halaman.map(h => h.headers.length));
  const C_NO = 0, C_KEG = 1, C_PEL0 = 2;
  const C_KEL = C_PEL0 + nPel, C_WAK = C_KEL + 1, C_OUT = C_KEL + 2, C_KET = C_KEL + 3, C_NAMA = C_KEL + 4, C_TULIS = C_KEL + 5;
  const nKol = C_TULIS + 1;
  wsA.columns = Array.from({ length: nKol }, (_, i) => ({
    width: i === C_NO ? 6 : i === C_KEG ? 46 : i < C_KEL ? 13 : i === C_WAK ? 11 : i === C_NAMA ? 30 : i === C_TULIS ? 16 : 30,
  }));
  const H = (c: number) => kolomHuruf(c);
  wsA.mergeCells(`A1:${H(nKol - 1)}1`);
  wsA.getCell('A1').value = `ALUR SOP — ${rapi(d.judul).toUpperCase() || 'TANPA JUDUL'}`;
  wsA.getCell('A1').font = { bold: true, size: 13, color: { argb: NAVY } };
  // Judul kolom (2 baris)
  const sel = (r: number, c: number) => wsA.getCell(r, c + 1);
  const judulKolom = (r1: number, r2: number, c1: number, c2: number, t: string) => {
    if (r1 !== r2 || c1 !== c2) wsA.mergeCells(r1, c1 + 1, r2, c2 + 1);
    sel(r1, c1).value = t;
  };
  judulKolom(3, 4, C_NO, C_NO, 'No');
  judulKolom(3, 4, C_KEG, C_KEG, 'Kegiatan');
  judulKolom(3, 3, C_PEL0, C_KEL - 1, 'Pelaksana');
  (d.halaman[0]?.headers || []).forEach((h, i) => { sel(4, C_PEL0 + i).value = rapi(h) || `Pelaksana ${i + 1}`; });
  judulKolom(3, 3, C_KEL, C_OUT, 'Mutu Baku');
  sel(4, C_KEL).value = 'Kelengkapan'; sel(4, C_WAK).value = 'Waktu (Menit)'; sel(4, C_OUT).value = 'Output';
  judulKolom(3, 4, C_KET, C_KET, 'Keterangan');
  judulKolom(3, 4, C_NAMA, C_NAMA, 'Pelaksana Kegiatan (untuk rekap)');
  judulKolom(3, 4, C_TULIS, C_TULIS, 'Waktu Tertulis');
  for (const r of [3, 4]) for (let c = 0; c < nKol; c++) {
    const x = sel(r, c);
    x.font = { bold: true, size: 10 }; x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c >= C_NAMA ? HIJAU : ABU } }; x.border = garis;
  }
  wsA.getRow(4).height = 32;

  let r = 5;
  const barisData: number[] = [];
  const pelaksanaUrut: string[] = [];
  const kunciNama = new Map<string, string>(); // kecil-huruf → ejaan pertama
  d.halaman.forEach((hal, hi) => {
    if (hi > 0) { // pemisah halaman: judul kolom pelaksana halaman ini
      sel(r, C_KEG).value = `[Alur ${hi + 1}]`;
      hal.headers.forEach((h, i) => { sel(r, C_PEL0 + i).value = rapi(h) || '-'; });
      for (let c = 0; c < nKol; c++) {
        const x = sel(r, c);
        x.font = { bold: true, size: 9, color: { argb: 'FF475569' } }; x.alignment = { horizontal: c === C_KEG ? 'left' : 'center', vertical: 'middle', wrapText: true };
        x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU_MUDA } }; x.border = garis;
      }
      r++;
    }
    hal.baris.forEach(b => {
      const nomor = (b.no || '').trim();
      if (nomor) sel(r, C_NO).value = /^\d+$/.test(nomor) ? Number(nomor) : nomor;
      sel(r, C_KEG).value = polos(b.kegiatan);
      hal.headers.forEach((_, i) => { if (b.pelaksanaCol === i) sel(r, C_PEL0 + i).value = b.simbol + (b.teksBentuk ? `\n${polos(b.teksBentuk)}` : ''); });
      sel(r, C_KEL).value = polos(b.syarat);
      const menit = menitDariWaktu(b.waktu);
      if (menit !== null) sel(r, C_WAK).value = menit;
      sel(r, C_OUT).value = polos(b.output);
      sel(r, C_KET).value = polos(b.ket);
      // Nama pelaksana diambil dari judul kolom HALAMAN baris ini (bisa beda antarhalaman).
      const namaAsli = rapi(hal.headers[b.pelaksanaCol] || '') || `Pelaksana ${b.pelaksanaCol + 1}`;
      const k = namaAsli.toLowerCase();
      if (!kunciNama.has(k)) { kunciNama.set(k, namaAsli); }
      const nama = kunciNama.get(k)!;
      // Semua baris (termasuk konektor tak bernomor) diberi nama pelaksana agar SUMIFS waktu
      // = total waktu SOP; jumlah KEGIATAN tetap hanya baris bernomor (syarat COUNTIFS).
      if ((nomor || menit) && !pelaksanaUrut.includes(nama)) pelaksanaUrut.push(nama);
      sel(r, C_NAMA).value = nama;
      const tulis = (b.waktu || '').trim();
      if (tulis && (menit === null || String(menit) !== tulis)) sel(r, C_TULIS).value = polos(tulis);
      for (let c = 0; c < nKol; c++) {
        const x = sel(r, c);
        x.border = garis;
        x.font = { size: c >= C_PEL0 && c < C_KEL ? 14 : 10 };
        x.alignment = { vertical: c >= C_PEL0 && c < C_KEL || c === C_NO || c === C_WAK ? 'middle' : 'top', horizontal: c === C_NO || c === C_WAK || (c >= C_PEL0 && c < C_KEL) ? 'center' : 'left', wrapText: true };
        if (c >= C_NAMA) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4FBF4' } };
      }
      barisData.push(r);
      r++;
    });
  });
  const r0 = 5, r1 = Math.max(r - 1, 5);
  const rng = (c: number) => `'Alur SOP'!$${H(c)}$${r0}:$${H(c)}$${r1}`;
  // Baris jumlah di bawah tabel
  sel(r, C_KEG).value = 'JUMLAH';
  for (let c = 0; c < nKol; c++) { const x = sel(r, c); x.font = { bold: true, size: 10 }; x.border = garis; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } }; x.alignment = { horizontal: c === C_WAK ? 'center' : 'left', vertical: 'middle' }; }

  // ── Nilai hasil (untuk cache rumus) ─────────────────────────────────────────
  const semua = d.halaman.flatMap(h => h.baris.map(b => ({ b, nama: kunciNama.get((rapi(h.headers[b.pelaksanaCol] || '') || `Pelaksana ${b.pelaksanaCol + 1}`).toLowerCase())! })));
  const totalMenit = semua.reduce((s, x) => s + (menitDariWaktu(x.b.waktu) || 0), 0);
  sel(r, C_WAK).value = { formula: `SUM(${H(C_WAK)}${r0}:${H(C_WAK)}${r1})`, result: totalMenit };
  const tahapan = semua.filter(x => (x.b.no || '').trim()).length;

  // ── Sheet "Ringkasan" ────────────────────────────────────────────────────────
  wsR.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  let y = 1;
  const judulBagian = (t: string) => {
    wsR.mergeCells(y, 1, y, 6);
    const c = wsR.getCell(y, 1); c.value = t;
    c.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { vertical: 'middle', indent: 1 }; wsR.getRow(y).height = 20; y++;
  };
  const isian = (label: string, nilai: unknown, opt: { tebal?: boolean; fmt?: string; tinggi?: number } = {}) => {
    wsR.mergeCells(y, 2, y, 6);
    const a = wsR.getCell(y, 1), b = wsR.getCell(y, 2);
    a.value = label; a.font = { bold: true, size: 10 }; a.alignment = { vertical: 'top', wrapText: true };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU_MUDA } };
    b.value = nilai as never; b.font = { size: 10, bold: !!opt.tebal }; b.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    if (opt.fmt) b.numFmt = opt.fmt;
    for (let c = 1; c <= 6; c++) wsR.getCell(y, c).border = garis;
    if (opt.tinggi) wsR.getRow(y).height = opt.tinggi;
    y++;
  };
  // Perkiraan tinggi baris utk teks panjang (lebar gabungan B:F ±90 karakter).
  const tinggiTeks = (s: string) => Math.min(409, Math.max(15, s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 95)), 0) * 13.5));

  wsR.mergeCells(y, 1, y, 6);
  wsR.getCell(y, 1).value = 'RINGKASAN STANDAR OPERASIONAL PROSEDUR';
  wsR.getCell(y, 1).font = { bold: true, size: 14, color: { argb: NAVY } }; y++;
  wsR.mergeCells(y, 1, y, 6);
  wsR.getCell(y, 1).value = rapi(d.judul).toUpperCase() || '-';
  wsR.getCell(y, 1).font = { bold: true, size: 12 }; wsR.getCell(y, 1).alignment = { wrapText: true };
  wsR.getRow(y).height = Math.max(18, Math.ceil(rapi(d.judul).length / 80) * 16); y += 2;

  judulBagian('IDENTITAS SOP (COVER)');
  isian('Nama SOP', rapi(d.judul) || '-');
  isian('Nomor SOP', rapi(d.nomor) || '-');
  isian('Unit Kerja (Level 1)', rapi(d.unitKerja) || '-');
  isian('Sub-Unit (Level 2)', rapi(d.subUnitKerja) || '-');
  isian('Jenis SOP (Kewenangan)', rapi(d.jenisSOP) || '-');
  isian('Klasifikasi SOP', rapi(d.klasifikasiSOP) || '-');
  isian('Tanggal Pembuatan', rapi(d.tglPembuatan) || '-');
  isian('Tanggal Revisi', rapi(d.tglRevisi) || '-');
  isian('Tanggal Efektif', rapi(d.tglEfektif) || '-');
  const pengesah = [rapi(d.jabatanPengesah), rapi(d.namaPengesah), d.nipPengesah ? `NIP ${rapi(d.nipPengesah)}` : ''].filter(Boolean).join('\n');
  isian('Disahkan Oleh', pengesah || '-', { tinggi: pengesah ? tinggiTeks(pengesah) : undefined });
  isian('Jenis Pengesahan', d.pengesahanTte ? 'Tanda tangan elektronik (TTE)' : 'Tanda tangan basah');
  y++;

  judulBagian('WAKTU & TAHAPAN (dihitung otomatis dengan rumus dari sheet "Alur SOP")');
  const yMenit = y;
  isian('Total Waktu SOP (menit)', { formula: `SUM(${rng(C_WAK)})`, result: totalMenit }, { tebal: true, fmt: '#,##0.##' });
  isian('Total Waktu SOP (jam)', { formula: `B${yMenit}/60`, result: totalMenit / 60 }, { fmt: '#,##0.00' });
  isian('Total Waktu SOP (hari kerja, dibulatkan ke atas)', { formula: `ROUNDUP(B${yMenit}/${MENIT_PER_HARI_KERJA},0)`, result: Math.ceil(totalMenit / MENIT_PER_HARI_KERJA) }, { tebal: true, fmt: '0' });
  isian('Total Tahapan (kegiatan bernomor)', { formula: `COUNTA(${rng(C_NO)})`, result: tahapan }, { tebal: true, fmt: '0' });
  const yJmlPel = y;
  isian('Jumlah Pelaksana', pelaksanaUrut.length, { fmt: '0' }); // diganti rumus setelah tabel rekap tersusun
  wsR.mergeCells(y, 1, y, 6);
  wsR.getCell(y, 1).value = `Catatan: 1 hari kerja = 5,5 jam = ${MENIT_PER_HARI_KERJA} menit. Waktu bersatuan (jam/hari/minggu/bulan) dikonversi ke menit pada kolom "Waktu (Menit)"; teks aslinya tercantum di kolom "Waktu Tertulis".`;
  wsR.getCell(y, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }; wsR.getCell(y, 1).alignment = { wrapText: true };
  wsR.getRow(y).height = 26; y += 2;

  judulBagian('REKAP PER PELAKSANA');
  const kepala = ['Pelaksana', 'Jumlah Kegiatan', 'Total Waktu (menit)', 'Total Waktu (jam)', 'Hari Kerja', 'Porsi Waktu'];
  kepala.forEach((t, i) => {
    const c = wsR.getCell(y, i + 1); c.value = t;
    c.font = { bold: true, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = garis;
  });
  wsR.getRow(y).height = 28; y++;
  const yRekap0 = y;
  const yTotalRekap = yRekap0 + pelaksanaUrut.length;
  pelaksanaUrut.forEach(nama => {
    const milik = semua.filter(x => x.nama === nama);
    const nKeg = milik.filter(x => (x.b.no || '').trim()).length;
    const mnt = milik.reduce((s, x) => s + (menitDariWaktu(x.b.waktu) || 0), 0);
    wsR.getCell(y, 1).value = nama;
    wsR.getCell(y, 2).value = { formula: `COUNTIFS(${rng(C_NAMA)},A${y},${rng(C_NO)},"<>")`, result: nKeg };
    wsR.getCell(y, 3).value = { formula: `SUMIFS(${rng(C_WAK)},${rng(C_NAMA)},A${y})`, result: mnt };
    wsR.getCell(y, 4).value = { formula: `C${y}/60`, result: mnt / 60 };
    wsR.getCell(y, 5).value = { formula: `C${y}/${MENIT_PER_HARI_KERJA}`, result: mnt / MENIT_PER_HARI_KERJA };
    wsR.getCell(y, 6).value = { formula: `IF($C$${yTotalRekap}=0,0,C${y}/$C$${yTotalRekap})`, result: totalMenit ? mnt / totalMenit : 0 };
    y++;
  });
  // Baris total
  wsR.getCell(y, 1).value = 'TOTAL';
  wsR.getCell(y, 2).value = { formula: `SUM(B${yRekap0}:B${y - 1})`, result: tahapan };
  const totPel = semua.filter(x => pelaksanaUrut.includes(x.nama)).reduce((s, x) => s + (menitDariWaktu(x.b.waktu) || 0), 0);
  wsR.getCell(y, 3).value = { formula: `SUM(C${yRekap0}:C${y - 1})`, result: totPel };
  wsR.getCell(y, 4).value = { formula: `C${y}/60`, result: totPel / 60 };
  wsR.getCell(y, 5).value = { formula: `C${y}/${MENIT_PER_HARI_KERJA}`, result: totPel / MENIT_PER_HARI_KERJA };
  wsR.getCell(y, 6).value = { formula: `SUM(F${yRekap0}:F${y - 1})`, result: totPel ? 1 : 0 };
  for (let yy = yRekap0; yy <= y; yy++) for (let c = 1; c <= 6; c++) {
    const x = wsR.getCell(yy, c);
    x.border = garis;
    x.font = { size: 10, bold: yy === y };
    x.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center', wrapText: true };
    x.numFmt = c === 2 ? '0' : c === 3 ? '#,##0.##' : c === 6 ? '0.0%' : '#,##0.00';
    if (yy === y) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABU } };
  }
  wsR.getCell(yJmlPel, 2).value = { formula: `COUNTA(A${yRekap0}:A${yTotalRekap - 1})`, result: pelaksanaUrut.length };
  y += 2;

  judulBagian('ISI COVER');
  d.cover.forEach(cv => {
    const isi = polos(cv.isi).replace(/^1\.\s*$/, '').trim() || '-';
    isian(cv.judul, isi, { tinggi: tinggiTeks(isi) });
  });
  wsR.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  wsA.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `SOP_${(rapi(d.judul) || 'Draft').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120)}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
