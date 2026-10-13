// Daftar Klasifikasi Proses (Proses Bisnis & SOP) — SATU sumber untuk semua formulir.
// Perubahan 9 Okt 2026: ditambah "Non Layanan (Teknis)"; "Layanan Pengaduan dan
// Informasi" dihapus (pilihan lama dialihkan ke Administrasi Pemerintah); "Layanan
// Data, Keamanan dan Infrastruktur" dihapus dari pilihan. Server memiliki padanan
// normalisasi yang sama (normalisasiKlasifikasi di api/server.js) — ubah keduanya.
export const KLASIFIKASI_BPMN = [
  'Layanan Administrasi Pemerintah',
  'Layanan Pertanahan',
  'Layanan Tata Ruang',
  'Non Layanan (Teknis)',
] as const;

export const KLASIFIKASI_SOP = [
  'SOP Administrasi Pemerintah',
  'SOP Layanan Pertanahan',
  'SOP Layanan Tata Ruang',
  'SOP Non Layanan (Teknis)',
] as const;

/** Pilihan untuk satu jenis dokumen (SP punya daftar sendiri di spTemplate). */
export const klasifikasiUntuk = (kind: 'bpmn' | 'sop' | 'sp'): readonly string[] =>
  kind === 'sop' ? KLASIFIKASI_SOP : KLASIFIKASI_BPMN;

/** Nilai lama (yang sudah tidak ada di daftar) → padanan baru. Pengaduan dan Informasi
 *  → Administrasi Pemerintah. Nilai lain dibiarkan apa adanya. */
export function normalisasiKlasifikasi(v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  if (/pengaduan\s+dan\s+informasi/i.test(s)) return /^SOP\b/i.test(s) ? 'SOP Administrasi Pemerintah' : 'Layanan Administrasi Pemerintah';
  return s;
}

/** Pilihan untuk <select> + nilai saat ini bila bukan bagian daftar (mis. dokumen lama
 *  berklasifikasi "Data, Keamanan dan Infrastruktur") agar tidak tampak kosong. */
export const denganNilaiSaatIni = (opsi: readonly string[], saatIni?: string | null): string[] =>
  saatIni && !opsi.includes(saatIni) ? [saatIni, ...opsi] : [...opsi];
