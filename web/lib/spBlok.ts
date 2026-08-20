// =============================================================================
// PEMECAH ISI KOLOM URAIAN — agar satu komponen bisa terbagi antar-lembar
// -----------------------------------------------------------------------------
// Naskah SP kerap memuat komponen yang uraiannya lebih panjang daripada satu
// halaman (mis. "Evaluasi kinerja pelaksana"). Supaya lembar di kanvas berperilaku
// seperti hasil cetak — butir 1–3 di halaman 1, butir 4 dan seterusnya melanjut
// di halaman 2 — isi uraian dipecah menjadi BLOK yang dapat dibagi ke beberapa
// lembar, lalu disusun kembali menjadi satu HTML utuh saat disimpan.
//
// Batas pemecahan sengaja hanya pada tingkat teratas: paragraf, dan butir daftar
// terluar. Sub-daftar (a., 1)) selalu ikut butir induknya supaya penomoran
// bertingkat tidak pernah terputus di tengah.
// =============================================================================

export interface BlokUraian {
  /** 'p' = paragraf lepas · 'li' = butir daftar terluar (berikut sub-daftarnya) */
  tipe: 'p' | 'li';
  /** Hanya untuk 'li': daftar bernomor (ol) atau berbutir (ul). */
  ol: boolean;
  /** Isi HTML blok. Untuk 'li' termasuk sub-daftar di dalamnya. */
  html: string;
}

const KOSONG = /^\s*(<br\s*\/?>)?\s*$/i;

/** Pecah HTML uraian menjadi blok-blok teratas yang boleh dipisah antar-lembar. */
export function pecahUraian(html: string): BlokUraian[] {
  if (typeof document === 'undefined' || !html) return [];
  const wadah = document.createElement('div');
  wadah.innerHTML = html;

  const blok: BlokUraian[] = [];
  Array.from(wadah.childNodes).forEach(simpul => {
    if (simpul.nodeType === Node.TEXT_NODE) {
      const teks = simpul.textContent || '';
      if (teks.trim()) blok.push({ tipe: 'p', ol: false, html: teks });
      return;
    }
    if (simpul.nodeType !== Node.ELEMENT_NODE) return;
    const el = simpul as HTMLElement;
    const tag = el.tagName;

    if (tag === 'OL' || tag === 'UL') {
      // Tiap butir terluar jadi satu blok; sub-daftarnya ikut serta.
      Array.from(el.children).forEach(li => {
        if (li.tagName !== 'LI') return;
        blok.push({ tipe: 'li', ol: tag === 'OL', html: li.innerHTML });
      });
      return;
    }
    if (tag === 'BR') return;                       // pemisah kosong — abaikan
    if (KOSONG.test(el.innerHTML)) return;
    blok.push({ tipe: 'p', ol: false, html: el.innerHTML });
  });

  return blok;
}

/**
 * Susun kembali blok menjadi HTML uraian.
 * Butir daftar yang berurutan dibungkus ulang dalam satu <ol>/<ul>.
 */
export function gabungUraian(blok: BlokUraian[]): string {
  let hasil = '';
  let daftarTerbuka: 'ol' | 'ul' | null = null;
  const tutup = () => { if (daftarTerbuka) { hasil += `</${daftarTerbuka}>`; daftarTerbuka = null; } };

  blok.forEach(b => {
    if (b.tipe === 'li') {
      const perlu = b.ol ? 'ol' : 'ul';
      if (daftarTerbuka !== perlu) { tutup(); hasil += `<${perlu}>`; daftarTerbuka = perlu; }
      hasil += `<li>${b.html}</li>`;
    } else {
      tutup();
      hasil += `<p>${b.html}</p>`;
    }
  });
  tutup();
  return hasil;
}

/** Jumlah butir daftar terluar di dalam sekumpulan blok — dipakai agar
 *  penomoran di lembar lanjutan meneruskan angka (butir ke-4 tetap "4."). */
export const jumlahButir = (blok: BlokUraian[]) => blok.filter(b => b.tipe === 'li').length;
