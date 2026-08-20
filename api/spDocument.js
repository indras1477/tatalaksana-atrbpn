'use strict';

/* =============================================================================
   DOKUMEN STANDAR PELAYANAN (SP)
   -----------------------------------------------------------------------------
   Satu sumber kebenaran untuk tiga keluaran dokumen SP:
     1. HTML  → dirender headless Chrome menjadi PDF vektor (buildDocumentHtml)
     2. DOCX  → berkas Word asli lewat pustaka `docx`        (buildDocx)
     3. Impor → berkas Word dibaca `mammoth` jadi JSON SP    (parseDocxToDoc)

   Format kertas mengikuti ketentuan Standar Pelayanan ATR/BPN:
     • F4 potret 210 mm × 330 mm
     • Margin  atas 2,5 cm · kiri 2 cm · bawah 2 cm · kanan 2 cm
     • Huruf   Bookman Old Style 12 pt
   Server memakai URW Bookman (metrik setara) sebagai pengganti Bookman Old Style
   yang hanya ada di Windows — sama seperti render BPMN/SOP.
   ========================================================================== */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, LevelFormat, VerticalAlign, LineRuleType,
  convertMillimetersToTwip,
} = require('docx');
const mammoth = require('mammoth');

// ── Ukuran halaman (mm) ────────────────────────────────────────────────────
const PAGE = { w: 210, h: 330, mTop: 25, mRight: 20, mBottom: 20, mLeft: 20 };
const CONTENT_W = PAGE.w - PAGE.mLeft - PAGE.mRight;   // 170 mm
const CONTENT_H = PAGE.h - PAGE.mTop - PAGE.mBottom;   // 285 mm
// Lebar kolom tabel komponen (mm) — total harus = CONTENT_W. Proporsi mengikuti
// naskah SP ATR/BPN yang sudah ditetapkan (≈6% / 30% / 64%).
const COL = { no: 10, komponen: 52, uraian: CONTENT_W - 10 - 52 }; // 10 / 52 / 108
const FONT_STACK = "'Bookman Old Style','URW Bookman','Bookman',serif";

// =============================================================================
// 1. SANITASI HTML
// =============================================================================
// Isi kolom "Uraian" diketik di editor contentEditable, jadi HTML-nya berasal
// dari peramban (termasuk hasil tempel dari Word). Hanya tag di bawah ini yang
// dipertahankan; SELURUH atribut dibuang sehingga tak ada jalur untuk skrip,
// gaya, atau tautan berbahaya ikut masuk ke PDF/DOCX.
const TAG_DIIZINKAN = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'div']);

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html;
  // Buang blok berbahaya beserta isinya lebih dulu.
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Tag yang lolos ditulis ulang tanpa atribut; sisanya dihapus (isinya tetap).
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (cocok, tag) => {
    const t = String(tag).toLowerCase();
    if (!TAG_DIIZINKAN.has(t)) return '';
    const penutup = /^<\//.test(cocok);
    if (t === 'br') return '<br>';
    return penutup ? `</${t}>` : `<${t}>`;
  });
  return s.trim();
}

// =============================================================================
// 2. HTML → BLOK (paragraf / butir daftar berjenjang)
// =============================================================================
// Hasilnya dipakai buildDocx: DOCX tidak bisa menerima HTML, jadi tiap paragraf
// dan butir daftar harus dibangun ulang sebagai objek.
const ENTITAS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', bull: '•',
};
function decodeEntitas(teks) {
  return String(teks).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (utuh, isi) => {
    if (isi[0] === '#') {
      const kode = isi[1] === 'x' || isi[1] === 'X' ? parseInt(isi.slice(2), 16) : parseInt(isi.slice(1), 10);
      return Number.isFinite(kode) && kode > 0 ? String.fromCodePoint(kode) : utuh;
    }
    const k = isi.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITAS, k) ? ENTITAS[k] : utuh;
  });
}

/**
 * Ubah HTML uraian menjadi daftar blok datar.
 * @returns {{type:'p'|'li', ordered:boolean, level:number, runs:Array}[]}
 *          run = { text, bold, italic, underline } atau { break:true }
 */
function htmlToBlocks(html) {
  const bersih = sanitizeHtml(html);
  if (!bersih) return [];

  const blocks = [];
  const tumpukanDaftar = [];        // 'ol' | 'ul' — kedalaman daftar saat ini
  let tebal = 0, miring = 0, garisBawah = 0;
  let bufferRun = [];

  const adaIsi = () => bufferRun.some(r => r.break || (r.text && r.text.trim() !== ''));
  const flush = (tipe) => {
    if (!adaIsi()) { bufferRun = []; return; }
    const dalamDaftar = tumpukanDaftar.length > 0;
    const jenis = tipe || (dalamDaftar ? 'li' : 'p');
    blocks.push({
      type: jenis,
      ordered: jenis === 'li' ? tumpukanDaftar[tumpukanDaftar.length - 1] === 'ol' : false,
      level: jenis === 'li' ? Math.max(0, tumpukanDaftar.length - 1) : 0,
      runs: bufferRun,
    });
    bufferRun = [];
  };

  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(bersih)) !== null) {
    if (m[2] !== undefined) {                       // teks biasa
      const teks = decodeEntitas(m[2]).replace(/\s+/g, ' ');
      if (teks) bufferRun.push({ text: teks, bold: tebal > 0, italic: miring > 0, underline: garisBawah > 0 });
      continue;
    }
    const tag = m[1].toLowerCase();
    const penutup = m[0][1] === '/';
    switch (tag) {
      case 'br': bufferRun.push({ break: true }); break;
      case 'b': case 'strong': penutup ? (tebal = Math.max(0, tebal - 1)) : tebal++; break;
      case 'i': case 'em': penutup ? (miring = Math.max(0, miring - 1)) : miring++; break;
      case 'u': penutup ? (garisBawah = Math.max(0, garisBawah - 1)) : garisBawah++; break;
      case 'p': case 'div': flush(); break;
      case 'li': flush(); break;
      case 'ul': case 'ol':
        flush();
        if (penutup) tumpukanDaftar.pop(); else tumpukanDaftar.push(tag);
        break;
      default: break;
    }
  }
  flush();
  return blocks;
}

// =============================================================================
// 3. NORMALISASI DOKUMEN
// =============================================================================
const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bentuk data SP yang selalu bisa dipakai renderer, seburuk apa pun masukannya. */
function normalizeDoc(raw) {
  let d = raw;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') d = {};
  const sections = Array.isArray(d.sections) ? d.sections : [];
  return {
    judul: String(d.judul || d.namaPelayanan || '').trim(),
    lampiran: String(d.lampiran || '').trim(),
    nomor: String(d.nomor || '').trim(),
    tanggal: String(d.tanggal || '').trim(),
    instansi: String(d.instansi || '').trim(),
    unitKerja: String(d.unitKerja || '').trim(),
    subUnitKerja: String(d.subUnitKerja || '').trim(),
    sections: sections.map((s, i) => ({
      id: String(s?.id || `sec-${i}`),
      judul: String(s?.judul || '').trim(),
      items: (Array.isArray(s?.items) ? s.items : []).map((it, j) => ({
        id: String(it?.id || `it-${i}-${j}`),
        komponen: String(it?.komponen || '').trim(),
        uraian: sanitizeHtml(it?.uraian || ''),
        gabungNo: !!it?.gabungNo,
        gabungKomponen: !!it?.gabungKomponen,
        gabungUraian: !!it?.gabungUraian,
      })),
    })),
  };
}

/**
 * Nomor & rentang gabung (rowspan) tiap baris — kembaran hitungBaris() di
 * web/lib/spTemplate.ts. Baris yang menyatu ke atas tidak merender selnya.
 */
function hitungBaris(items) {
  let nomor = 0;
  return items.map((it, i) => {
    if (!(i > 0 && it.gabungNo)) nomor += 1;
    const rentang = (kunci) => {
      if (i > 0 && it[kunci]) return 0;
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

// =============================================================================
// 4. HTML UNTUK PDF (headless Chrome)
// =============================================================================
/**
 * Halaman HTML lengkap siap dirender puppeteer.
 * Pemenggalan halaman diserahkan ke mesin cetak Chromium (thead diulang tiap
 * halaman) — sama seperti perilaku Word, jadi PDF & DOCX berhenti di tempat
 * yang mirip tanpa perlu perhitungan halaman manual.
 */
function buildDocumentHtml(rawDoc) {
  const doc = normalizeDoc(rawDoc);

  const barisLampiran = doc.lampiran
    ? `<div class="lampiran">${esc(doc.lampiran).replace(/\n/g, '<br>')}</div>` : '';
  const barisNomor = (doc.nomor || doc.tanggal) ? `
    <table class="meta">
      <tr><td>Nomor</td><td>:</td><td>${esc(doc.nomor)}</td></tr>
      <tr><td>Tanggal</td><td>:</td><td>${esc(doc.tanggal)}</td></tr>
    </table>` : '';

  const barisTabel = doc.sections.map((sec) => {
    const kepala = sec.judul
      ? `<tr class="sec"><td colspan="3">${esc(sec.judul)}</td></tr>` : '';
    // Penomoran dimulai ulang tiap kelompok (Service Delivery / Manufacturing).
    const meta = hitungBaris(sec.items);
    const isi = sec.items.map((it, i) => {
      const { nomor, noSpan, kompSpan, uraianSpan } = meta[i];
      const selNo = noSpan ? `<td class="no"${noSpan > 1 ? ` rowspan="${noSpan}"` : ''}>${nomor}.</td>` : '';
      const selKomp = kompSpan ? `<td class="komponen"${kompSpan > 1 ? ` rowspan="${kompSpan}"` : ''}>${esc(it.komponen)}</td>` : '';
      const selUraian = uraianSpan ? `<td class="uraian"${uraianSpan > 1 ? ` rowspan="${uraianSpan}"` : ''}>${it.uraian || ''}</td>` : '';
      return `<tr>${selNo}${selKomp}${selUraian}</tr>`;
    }).join('');
    return kepala + isi;
  }).join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${esc(doc.judul || 'Standar Pelayanan')}</title>
<style>
  @page { size: ${PAGE.w}mm ${PAGE.h}mm; margin: ${PAGE.mTop}mm ${PAGE.mRight}mm ${PAGE.mBottom}mm ${PAGE.mLeft}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  /* Lebar body DIKUNCI ke lebar isi cetak: skrip pemenggal mengukur SEBELUM
     dicetak, pada viewport layar — tanpa kunci ini tabel (width:100%) melebar
     mengikuti viewport dan teks melipat berbeda dari hasil cetak/kanvas.
     line-height ditetapkan 1.2 (bukan 'normal') supaya kanvas, PDF, dan
     pengukuran memakai tinggi baris yang persis sama. */
  body { width: ${CONTENT_W}mm; font-family: ${FONT_STACK}; font-size: 12pt; line-height: 1.2; color: #000; }
  /* Sel uraian kosong tetap setinggi satu baris — sama dengan editor kanvas. */
  .uraian:empty::after { content: '\\00a0'; }
  .lampiran { width: 50%; margin-left: 50%; text-align: left; margin-bottom: 4mm; }
  table.meta { margin-left: 50%; border-collapse: collapse; margin-bottom: 6mm; }
  table.meta td { padding: 0 2mm 0 0; vertical-align: top; }
  /* Naskah SP ATR/BPN yang sudah ditetapkan TIDAK memakai cetak tebal pada
     kepala naskah, judul layanan, kepala tabel, maupun baris kelompok — hanya
     isi uraian yang boleh ditebalkan penyusun. */
  .doc-title { text-align: center; margin: 0 0 6mm; line-height: 1.35; }
  table.nama { border-collapse: collapse; margin-bottom: 4mm; width: 100%; }
  table.nama td { vertical-align: top; padding: 0 2mm 0 0; }
  table.nama td.label { width: 38mm; }
  table.nama td.sep { width: 4mm; }
  table.komp { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.komp th, table.komp td { border: 1px solid #000; padding: 1.5mm 2mm; vertical-align: top; text-align: left; }
  table.komp thead th { text-align: center; font-weight: normal; }
  table.komp thead { display: table-header-group; }
  /* Pemenggalan halaman TIDAK diserahkan ke aturan break CSS: skrip di bawah
     menjalankan algoritma yang sama dengan kanvas studio, lalu membangun
     lembar-lembar eksplisit (.page) — titik potong PDF = titik potong kanvas,
     penomoran melanjut, dan tiap lembar punya tabel utuh (garis bawah tidak
     pernah hilang di batas halaman). */
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  /* flow-root menahan margin bawah anak (mis. margin 4mm tabel "Nama Pelayanan")
     agar TERHITUNG dalam tinggi blok judul — tanpa ini margin itu lolos dari
     pengukuran, lembar tersusun ~4mm lebih tinggi dari area cetak, dan baris
     terakhirnya MELUAP menjadi halaman yatim. */
  [data-kepala-naskah] { display: flow-root; }
  td.no { width: ${COL.no}mm; text-align: center; }
  td.komponen { width: ${COL.komponen}mm; }
  td.uraian { width: ${COL.uraian}mm; }
  /* Isi uraian: spasi antar-paragraf 0 (sesuai naskah SP yang rapat) + daftar
     bernomor bertingkat gaya naskah dinas (1. → a. → 1)) dengan indentasi gantung. */
  .uraian p { margin: 0; text-align: justify; }
  .uraian ol, .uraian ul { margin: 0; padding: 0; list-style: none; counter-reset: butir; }
  .uraian li { position: relative; padding-left: 7mm; margin: 0; text-align: justify; }
  .uraian ol > li::before { counter-increment: butir; content: counter(butir) "."; position: absolute; left: 0; }
  .uraian ol ol > li::before { content: counter(butir, lower-alpha) "."; }
  .uraian ol ol ol > li::before { content: counter(butir) ")"; }
  .uraian ul > li::before { content: "\\2022"; position: absolute; left: 1.5mm; }
  /* Tiap tingkat menjorok ke kanan (1. → a. → 1)) seperti naskah dinas —
     tanpa ini semua tingkat rata kiri dan hierarkinya tak terbaca. */
  .uraian ol ol, .uraian ol ul, .uraian ul ol, .uraian ul ul { padding-left: 7mm; }
</style></head>
<body>
  <div id="alir">
    <div data-kepala-naskah>
      ${barisLampiran}
      ${barisNomor}
      ${doc.instansi ? `<div class="doc-title">${esc(doc.instansi).replace(/\n/g, '<br>')}</div>` : ''}
      <table class="nama"><tr>
        <td class="label">Nama Pelayanan</td><td class="sep">:</td><td>${esc(doc.judul)}</td>
      </tr></table>
    </div>
    <table class="komp">
      <thead><tr>
        <th style="width:${COL.no}mm">NO</th>
        <th style="width:${COL.komponen}mm">KOMPONEN</th>
        <th style="width:${COL.uraian}mm">URAIAN</th>
      </tr></thead>
      <tbody>${barisTabel}</tbody>
    </table>
  </div>
  <script>${SKRIP_PEMENGGAL.replace('__KAPASITAS_MM__', String(CONTENT_H))}</script>
</body></html>`;
}

/* Skrip yang berjalan DI DALAM halaman render: cermin algoritma pemenggalan
   kanvas studio (hitungHalaman + pecahUraian di web/). Ubah keduanya bersama.
   Ditulis tanpa template-literal agar aman disisipkan ke HTML di atas. */
const SKRIP_PEMENGGAL = `(function(){
  function siap(){ window.__siapCetak = true; }
  function ukur(mm){
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;visibility:hidden;height:' + mm + 'mm;width:1mm;';
    document.body.appendChild(d);
    var h = d.getBoundingClientRect().height;
    d.remove();
    return h;
  }
  function blokDari(td){
    var out = [];
    [].slice.call(td.children).forEach(function(el){
      if (el.tagName === 'OL' || el.tagName === 'UL') {
        [].slice.call(el.children).forEach(function(li){
          if (li.tagName === 'LI') out.push({ el: li, ol: el.tagName === 'OL' });
        });
      } else out.push({ el: el, ol: false });
    });
    return out;
  }
  function jalan(){
    try {
      var alir = document.getElementById('alir');
      var tabel = alir.querySelector('table.komp');
      var kepalaNaskah = alir.querySelector('[data-kepala-naskah]');
      var thead = tabel.querySelector('thead');
      // Penyangga 2mm: pembulatan garis tabel antar-baris bisa membuat jumlah
      // tinggi baris sedikit di bawah tinggi nyata — tanpa penyangga, lembar
      // yang pas-pasan meluap ke halaman fisik baru. Kanvas memakai penyangga
      // yang SAMA agar titik pemenggalannya tetap identik.
      var kapasitas = ukur(__KAPASITAS_MM__) - ukur(2);
      var isiSel = ukur(3);                       // padding atas+bawah sel (2 x 1,5mm)
      var tKepala = thead.getBoundingClientRect().height;
      var tJudul = kepalaNaskah ? kepalaNaskah.getBoundingClientRect().height : 0;

      // Kelompok atomik: judul kelompok menempel baris berikutnya; baris yang
      // selnya menyatu (rowspan / sel hilang) menempel baris pemiliknya.
      var rows = [].slice.call(tabel.querySelectorAll('tbody tr'));
      var grup = [];
      rows.forEach(function(tr, idx){
        var isSec = tr.className.indexOf('sec') >= 0;
        var lengkap = tr.querySelector('td.no') && tr.querySelector('td.komponen') && tr.querySelector('td.uraian');
        var nyambung = idx > 0 && !isSec && !lengkap;
        var ikutSec = idx > 0 && rows[idx - 1].className.indexOf('sec') >= 0;
        if (grup.length && (nyambung || ikutSec)) grup[grup.length - 1].push(tr);
        else grup.push([tr]);
      });

      var halaman = [];
      var kini = [];
      var terpakai = tJudul + tKepala;
      function halamanBaru(){ halaman.push(kini); kini = []; terpakai = tKepala; }

      grup.forEach(function(g){
        var adaRowspan = g.some(function(tr){ return !!tr.querySelector('td[rowspan]'); });
        var atomik = g.length > 1 || g[0].className.indexOf('sec') >= 0 || adaRowspan;
        var tGrup = g.reduce(function(n, tr){ return n + tr.getBoundingClientRect().height; }, 0);

        if (atomik) {
          if (kini.length && terpakai + tGrup > kapasitas) halamanBaru();
          g.forEach(function(tr){ kini.push({ tr: tr }); });
          terpakai += tGrup;
          return;
        }
        var tr = g[0];
        var td = tr.querySelector('td.uraian');
        var blok = td ? blokDari(td) : [];
        if (!blok.length) {
          if (kini.length && terpakai + tGrup > kapasitas) halamanBaru();
          kini.push({ tr: tr });
          terpakai += tGrup;
          return;
        }
        var tKomp = tr.querySelector('td.komponen').getBoundingClientRect().height;
        var tinggi = blok.map(function(b){ return b.el.getBoundingClientRect().height; });
        var mulai = 0, lanjutan = false;
        while (mulai < blok.length) {
          var sisa = kapasitas - terpakai - isiSel;
          var minKomp = lanjutan ? 0 : tKomp;
          var akhir = mulai, dipakai = 0;
          while (akhir < blok.length && dipakai + tinggi[akhir] <= sisa) { dipakai += tinggi[akhir]; akhir += 1; }
          if (akhir === mulai) {
            if (kini.length) { halamanBaru(); continue; }
            akhir = mulai + 1;
            dipakai = tinggi[mulai];
          }
          kini.push({ tr: tr, awal: mulai, akhir: akhir, lanjutan: lanjutan, blok: blok });
          terpakai += isiSel + Math.max(dipakai, minKomp);
          mulai = akhir;
          lanjutan = true;
          if (mulai < blok.length) halamanBaru();
        }
      });
      if (kini.length) halaman.push(kini);

      // Bangun ulang: satu .page per lembar, tiap lembar bertabel utuh dengan
      // kepala tabel sendiri (Repeat Header Row) dan garis batas lengkap.
      var wadah = document.createElement('div');
      halaman.forEach(function(isi, hal){
        var pg = document.createElement('div');
        pg.className = 'page';
        if (hal === 0 && kepalaNaskah) pg.appendChild(kepalaNaskah);
        var t = document.createElement('table');
        t.className = 'komp';
        t.appendChild(thead.cloneNode(true));
        var tb = document.createElement('tbody');
        isi.forEach(function(op){
          if (op.awal === undefined) { tb.appendChild(op.tr); return; }
          if (!op.lanjutan) {
            // Potongan pertama: lepaskan blok setelah batas dari sel uraian —
            // simpulnya tetap hidup untuk dipasang di lembar berikutnya.
            for (var j = op.akhir; j < op.blok.length; j += 1) {
              var el = op.blok[j].el;
              if (el.parentNode) el.parentNode.removeChild(el);
            }
            [].slice.call(op.tr.querySelectorAll('td.uraian ol, td.uraian ul')).forEach(function(l){
              if (!l.children.length) l.remove();
            });
            tb.appendChild(op.tr);
            return;
          }
          // Potongan lanjutan: sel NO & KOMPONEN kosong, penomoran melanjut.
          var tr2 = document.createElement('tr');
          var tdNo = document.createElement('td'); tdNo.className = 'no';
          var tdK = document.createElement('td'); tdK.className = 'komponen';
          var tdU = document.createElement('td'); tdU.className = 'uraian';
          var nomorSebelum = 0;
          for (var k = 0; k < op.awal; k += 1) { if (op.blok[k].ol) nomorSebelum += 1; }
          var daftar = null, pertama = true;
          for (var i = op.awal; i < op.akhir; i += 1) {
            var b = op.blok[i];
            if (b.el.tagName === 'LI') {
              if (!daftar) {
                daftar = document.createElement(b.ol ? 'ol' : 'ul');
                if (pertama && b.ol && nomorSebelum) daftar.style.counterReset = 'butir ' + nomorSebelum;
                tdU.appendChild(daftar);
              }
              daftar.appendChild(b.el);
            } else { daftar = null; tdU.appendChild(b.el); }
            pertama = false;
          }
          tr2.appendChild(tdNo); tr2.appendChild(tdK); tr2.appendChild(tdU);
          tb.appendChild(tr2);
        });
        t.appendChild(tb);
        pg.appendChild(t);
        wadah.appendChild(pg);
      });
      alir.parentNode.replaceChild(wadah, alir);
    } catch (e) { /* gagal memenggal — biarkan tata alir asli sebagai cadangan */ }
    siap();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(jalan, jalan);
  else jalan();
})();`;

// =============================================================================
// 5. EKSPOR DOCX
// =============================================================================
const TWIP = convertMillimetersToTwip;
const GARIS = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDER_SEL = { top: GARIS, bottom: GARIS, left: GARIS, right: GARIS };

// Spasi baris "Single (1)" tanpa jarak antar-paragraf — sepadan dengan
// line-height:normal + margin:0 pada renderer PDF.
const SPASI_TUNGGAL = { line: 240, lineRule: LineRuleType.AUTO, before: 0, after: 0 };

const runDocx = (r) => (r.break
  ? new TextRun({ break: 1 })
  : new TextRun({ text: r.text || '', bold: !!r.bold, italics: !!r.italic, underline: r.underline ? {} : undefined }));

/** Blok uraian → paragraf DOCX. `instansi` menjadi nomor instance daftar agar
 *  penomoran tiap sel dimulai lagi dari 1 (bukan melanjutkan sel sebelumnya). */
function blocksToParagraphs(blocks, instanceDaftar) {
  if (!blocks.length) return [new Paragraph({ children: [] })];
  return blocks.map((b) => {
    const children = b.runs.map(runDocx);
    if (b.type === 'li') {
      return new Paragraph({
        children,
        numbering: { reference: b.ordered ? 'sp-angka' : 'sp-bulat', level: Math.min(b.level, 2), instance: instanceDaftar },
        spacing: SPASI_TUNGGAL,
        alignment: AlignmentType.JUSTIFIED,
      });
    }
    return new Paragraph({ children, spacing: SPASI_TUNGGAL, alignment: AlignmentType.JUSTIFIED });
  });
}

const selTeks = (teks, opsi = {}) => new TableCell({
  borders: BORDER_SEL,
  width: opsi.width ? { size: TWIP(opsi.width), type: WidthType.DXA } : undefined,
  columnSpan: opsi.span,
  rowSpan: opsi.rowSpan && opsi.rowSpan > 1 ? opsi.rowSpan : undefined,
  verticalAlign: VerticalAlign.TOP,
  margins: { top: TWIP(1.5), bottom: TWIP(1.5), left: TWIP(2), right: TWIP(2) },
  children: [new Paragraph({
    alignment: opsi.align,
    spacing: SPASI_TUNGGAL,
    children: [new TextRun({ text: String(teks == null ? '' : teks), bold: !!opsi.bold })],
  })],
});

async function buildDocx(rawDoc) {
  const doc = normalizeDoc(rawDoc);
  let instansiDaftar = 1;   // penghitung instance penomoran (unik per sel uraian)

  const barisTabel = [
    new TableRow({
      tableHeader: true,
      children: [
        selTeks('NO', { width: COL.no, align: AlignmentType.CENTER }),
        selTeks('KOMPONEN', { width: COL.komponen, align: AlignmentType.CENTER }),
        selTeks('URAIAN', { width: COL.uraian, align: AlignmentType.CENTER }),
      ],
    }),
  ];

  doc.sections.forEach((sec) => {
    if (sec.judul) {
      barisTabel.push(new TableRow({
        children: [selTeks(sec.judul, { span: 3, width: CONTENT_W })],
      }));
    }
    const metaBaris = hitungBaris(sec.items);
    sec.items.forEach((it, i) => {
      instansiDaftar += 1;
      const { nomor, noSpan, kompSpan, uraianSpan } = metaBaris[i];
      barisTabel.push(new TableRow({
        children: [
          // Sel yang menyatu ke atas tidak dibuat ulang; sel pembukanya
          // direntangkan lewat rowSpan (setara rowspan di HTML).
          ...(noSpan ? [selTeks(`${nomor}.`, { width: COL.no, align: AlignmentType.CENTER, rowSpan: noSpan })] : []),
          ...(kompSpan ? [selTeks(it.komponen, { width: COL.komponen, rowSpan: kompSpan })] : []),
          ...(uraianSpan ? [new TableCell({
            borders: BORDER_SEL,
            width: { size: TWIP(COL.uraian), type: WidthType.DXA },
            rowSpan: uraianSpan > 1 ? uraianSpan : undefined,
            verticalAlign: VerticalAlign.TOP,
            margins: { top: TWIP(1.5), bottom: TWIP(1.5), left: TWIP(2), right: TWIP(2) },
            children: blocksToParagraphs(htmlToBlocks(it.uraian), instansiDaftar),
          })] : []),
        ],
      }));
    });
  });

  const paragrafAtas = [];
  if (doc.lampiran) {
    doc.lampiran.split('\n').forEach((baris) => paragrafAtas.push(new Paragraph({
      indent: { left: TWIP(CONTENT_W / 2) }, spacing: SPASI_TUNGGAL, children: [new TextRun({ text: baris })],
    })));
  }
  if (doc.nomor || doc.tanggal) {
    paragrafAtas.push(new Paragraph({ indent: { left: TWIP(CONTENT_W / 2) }, children: [new TextRun({ text: `Nomor   : ${doc.nomor}` })] }));
    paragrafAtas.push(new Paragraph({ indent: { left: TWIP(CONTENT_W / 2) }, children: [new TextRun({ text: `Tanggal : ${doc.tanggal}` })], spacing: { after: 200 } }));
  }
  if (doc.instansi) {
    doc.instansi.split('\n').forEach((baris) => paragrafAtas.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: SPASI_TUNGGAL, children: [new TextRun({ text: baris })],
    })));
    paragrafAtas.push(new Paragraph({ children: [] }));
  }
  paragrafAtas.push(new Paragraph({
    children: [new TextRun({ text: `Nama Pelayanan : ${doc.judul}` })],
    spacing: { after: 160 },
  }));

  const berkas = new Document({
    styles: { default: { document: { run: { font: 'Bookman Old Style', size: 24 }, paragraph: { spacing: SPASI_TUNGGAL } } } },
    numbering: {
      config: [
        {
          reference: 'sp-angka',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(7), hanging: TWIP(7) } } } },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(14), hanging: TWIP(7) } } } },
            { level: 2, format: LevelFormat.DECIMAL, text: '%3)', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(21), hanging: TWIP(7) } } } },
          ],
        },
        {
          reference: 'sp-bulat',
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(7), hanging: TWIP(7) } } } },
            { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(14), hanging: TWIP(7) } } } },
            { level: 2, format: LevelFormat.BULLET, text: '▪', alignment: AlignmentType.START, style: { paragraph: { indent: { left: TWIP(21), hanging: TWIP(7) } } } },
          ],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: TWIP(PAGE.w), height: TWIP(PAGE.h) },
          margin: { top: TWIP(PAGE.mTop), right: TWIP(PAGE.mRight), bottom: TWIP(PAGE.mBottom), left: TWIP(PAGE.mLeft) },
        },
      },
      children: [
        ...paragrafAtas,
        new Table({ width: { size: TWIP(CONTENT_W), type: WidthType.DXA }, columnWidths: [TWIP(COL.no), TWIP(COL.komponen), TWIP(COL.uraian)], rows: barisTabel }),
      ],
    }],
  });

  return Packer.toBuffer(berkas);
}

// =============================================================================
// 6. IMPOR DARI WORD
// =============================================================================
const teksPolos = (html) => decodeEntitas(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Potong isi elemen berulang, mis. seluruh <tr>…</tr> dalam sebuah tabel. */
function ambilSemua(html, tag) {
  const hasil = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) hasil.push(m[1]);
  return hasil;
}

const RE_SECTION = /KOMPONEN\s+(SERVICE\s*DELIVERY|MANUFACTURING)/i;

/**
 * Baca .docx (Buffer) menjadi struktur dokumen SP.
 * Mengandalkan bentuk baku naskah SP: satu tabel 2–3 kolom
 * (NO | KOMPONEN | URAIAN) dengan baris pemisah "KOMPONEN SERVICE DELIVERY"
 * dan "KOMPONEN MANUFACTURING".
 */
async function parseDocxToDoc(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });

  // Ambil tabel dengan baris terbanyak — itulah tabel komponen.
  const tabel = ambilSemua(html, 'table');
  let terpilih = '', jumlahTerbanyak = 0;
  tabel.forEach((t) => {
    const n = ambilSemua(t, 'tr').length;
    if (n > jumlahTerbanyak) { jumlahTerbanyak = n; terpilih = t; }
  });

  const sections = [];
  let aktif = null;
  const mulaiSection = (judul) => { aktif = { id: `sec-${sections.length + 1}`, judul, items: [] }; sections.push(aktif); };

  ambilSemua(terpilih, 'tr').forEach((tr, idx) => {
    const sel = [...ambilSemua(tr, 'td'), ...ambilSemua(tr, 'th')];
    if (!sel.length) return;
    const gabungan = teksPolos(sel.join(' '));
    if (!gabungan) return;

    // Baris judul kelompok (kadang tersebar di 1–2 sel: "A" + "KOMPONEN SERVICE DELIVERY").
    const cocokSection = gabungan.match(RE_SECTION);
    if (cocokSection && gabungan.length < 80) {
      mulaiSection(/SERVICE/i.test(cocokSection[1]) ? 'KOMPONEN SERVICE DELIVERY' : 'KOMPONEN MANUFACTURING');
      return;
    }
    // Baris bergabung penuh (satu sel melintang) = judul kelompok lain, mis.
    // "KOMPONEN TAMBAHAN". Tanpa ini, komponen di bawahnya nyasar ke kelompok
    // sebelumnya saat naskah diimpor ulang.
    if (sel.length === 1 && gabungan.length < 80) { mulaiSection(gabungan); return; }
    // Baris kepala tabel.
    if (idx < 3 && /^\s*NO\b/i.test(gabungan) && /KOMPONEN/i.test(gabungan) && /URAIAN/i.test(gabungan)) return;

    // Baris komponen: sel terakhir = uraian, sel sebelum-terakhir = nama komponen.
    if (sel.length < 2) return;
    const uraian = sanitizeHtml(sel[sel.length - 1]);
    const komponen = teksPolos(sel[sel.length - 2]);
    if (!komponen && !uraian) return;
    if (!aktif) mulaiSection('KOMPONEN SERVICE DELIVERY');
    aktif.items.push({ id: `it-${sections.length}-${aktif.items.length + 1}`, komponen, uraian });
  });

  // Judul layanan: cari "Nama Pelayanan : …" di seluruh naskah.
  let judul = '';
  const seluruh = teksPolos(html);
  const cocokNama = seluruh.match(/Nama\s*Pelayanan\s*:?\s*(.{3,200}?)(?:\s+NO\s+KOMPONEN|\s+KOMPONEN\s+SERVICE|$)/i);
  if (cocokNama) judul = cocokNama[1].trim();

  let instansi = '';
  const cocokInstansi = seluruh.match(/(STANDAR PELAYANAN[^:]{0,160}?)(?=\s*Nama\s*Pelayanan)/i);
  if (cocokInstansi) instansi = cocokInstansi[1].replace(/\s+/g, ' ').trim();

  return normalizeDoc({ judul, instansi, sections });
}

module.exports = {
  PAGE, CONTENT_W, CONTENT_H, COL, FONT_STACK,
  sanitizeHtml, htmlToBlocks, normalizeDoc,
  buildDocumentHtml, buildDocx, parseDocxToDoc,
};
