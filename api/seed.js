const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD || 'AtrBpn!2026',
  database: process.env.DB_NAME || 'e_sop_db',
});

const HIERARKI_UNIT = {
  "SEKRETARIAT JENDERAL": {
    "Biro Perencanaan dan Kerja Sama": ["Bagian Perencanaan Program", "Bagian Penganggaran", "Bagian Pemantauan, Evaluasi, dan Pelaporan Kinerja", "Bagian Kerja Sama dan Tata Usaha"],
    "Biro Sumber Daya Manusia": ["Bagian Pengadaan dan Kesejahteraan", "Bagian Kinerja dan Manajemen Talenta", "Bagian Mutasi"],
    "Biro Organisasi, Tata Laksana, dan Manajemen Risiko": ["Bagian Organisasi", "Bagian Tata Laksana dan Reformasi Birokrasi", "Bagian Analisis Jabatan", "Bagian Manajemen Risiko"],
    "Biro Keuangan dan Barang Milik Negara": ["Bagian Penerimaan Negara Bukan Pajak", "Bagian Perbendaharaan", "Bagian Akuntansi dan Pelaporan", "Bagian Administrasi Pengelolaan BMN"],
    "Biro Hukum": ["Bagian Perundang-undangan I", "Bagian Perundang-undangan II", "Bagian Advokasi dan Dokumentasi Hukum"],
    "Biro Hubungan Masyarakat dan Protokol": ["Bagian Pemberitaan, Media, dan Hubungan Antar Lembaga", "Bagian Informasi Publik dan Pengaduan Masyarakat", "Bagian Tata Usaha Pimpinan dan Protokol"],
    "Biro Umum dan Layanan Pengadaan": ["Bagian Tata Naskah, Kearsipan, dan Tata Usaha", "Bagian Rumah Tangga dan Perlengkapan", "Bagian Layanan Pengadaan Barang/Jasa"],
    "Pusat Data dan Informasi Pertanahan dan Tata Ruang": ["Bidang Tata Kelola dan Infrastruktur TI", "Bidang Inovasi dan Pengembangan Sistem Informasi", "Bidang Pengelolaan Data dan Penyajian Informasi"]
  },
  "DIREKTORAT JENDERAL TATA RUANG": {
    "Sekretariat Direktorat Jenderal Tata Ruang": ["Bagian Program, Keuangan, dan Umum", "Bagian Hukum dan Kepegawaian", "Bagian Manajemen Risiko"],
    "Direktorat Perencanaan Tata Ruang": ["Subdirektorat Perencanaan Tata Ruang Nasional", "Subdirektorat Pedoman Tata Ruang", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional I", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional II", "Subdirektorat Perencanaan Tata Ruang Kawasan Strategis Nasional III"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah I": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah I.C"],
    "Direktorat Bina Perencanaan Tata Ruang Daerah Wilayah II": ["Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.A", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.B", "Subdirektorat Bina Perencanaan Tata Ruang Daerah Wilayah II.C"],
    "Direktorat Sinkronisasi Pemanfaatan Ruang": ["Subdirektorat Wilayah A", "Subdirektorat Wilayah B", "Subdirektorat Wilayah C"]
  },
  "DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG": {
    "Sekretariat Direktorat Jenderal Survei dan Pemetaan": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengukuran dan Pemetaan Kadastral": ["Subdirektorat Pengukuran dan Pemetaan Bidang", "Subdirektorat Pengukuran dan Pemetaan Ruang", "Subdirektorat Penanganan Masalah"],
    "Direktorat Pengukuran dan Pemetaan Dasar": ["Subdirektorat Pemetaan dan Pengelolaan Data Dasar", "Subdirektorat Pengukuran Dasar dan Peralatan", "Subdirektorat Pemetaan dan Pengelolaan Model Dasar dan Ruang"],
    "Direktorat Survei dan Pemetaan Tematik": ["Subdirektorat Tematik Pertanahan dan Ruang", "Subdirektorat Tematik Kawasan", "Subdirektorat Layanan Informasi Geospasial Tematik Multiguna"]
  },
  "DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH": {
    "Sekretariat Direktorat Jenderal PENETAPAN HAK DAN PENDAFTARAN TANAH": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum", "Bagian Manajemen Risiko"],
    "Direktorat Pengaturan dan Penetapan Hak Atas Tanah": [""Subdirektorat Penetapan Hak Guna Usaha", "Subdirektorat Penetapan Hak Guna Bangunan", "Subdirektorat Penetapan Hak Pakai, Ruang Atas Tanah, dan Ruang Bawah Tanah"],
    "Direktorat Hubungan Kelembagaan": ["Subdirektorat Hubungan Kelembagaan", "Subdirektorat Pengembangan Layanan Pertanahan"]
  },
  "DIREKTORAT JENDERAL PENATAAN AGRARIA": {
    "Sekretariat Direktorat Jenderal Penataan Agraria": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Landreform": ["Subdirektorat Pengelolaan Penguasaan Tanah", "Subdirektorat Penetapan Potensi Redistribusi", "Subdirektorat Pengaturan Redistribusi Tanah"],
    "Direktorat Pemberdayaan Tanah Masyarakat": ["Subdirektorat Pengembangan Model Akses RA", "Subdirektorat Fasilitasi Akses RA"]
  },
  "DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN": {
    "Sekretariat Direktorat Jenderal Pengadaan Tanah": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Bina Pengadaan dan Pencadangan Tanah": ["Subdirektorat Bina Pengadaan Tanah Wilayah I", "Subdirektorat Bina Pengadaan Tanah Wilayah II"]
  },
  "DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": {
    "Sekretariat Direktorat Jenderal PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Pengendalian Pemanfaatan Ruang": ["Subdirektorat Wilayah I", "Subdirektorat Wilayah II", "Subdirektorat Wilayah III"]
  },
  "DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHA": {
    "Sekretariat Direktorat Jenderal Penanganan Sengketa": ["Bagian Program dan Hukum", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Direktorat Penanganan Sengketa Pertanahan": ["Subdirektorat Penanganan Sengketa Penetapan Hak", "Subdirektorat Batas Bidang Tanah"]
  },
  "INSPEKTORAT JENDERAL": {
    "Sekretariat Inspektorat Jenderal": ["Bagian Program, Hukum, dan Tata Kelola", "Bagian Kepegawaian, Keuangan, dan Umum"],
    "Inspektur Wilayah I": ["Auditor Wilayah I"],
    "Inspektur Bidang Investigasi": ["Auditor Investigasi"]
  },
  "BADAN PENGEMBANGAN SUMBER DAYA MANUSIA": {
    "Sekretariat Badan Pengembangan SDM": ["Bagian Perencanaan dan Umum"],
    "Pusat Pembinaan Jabatan Fungsional": ["Bidang Jabatan Fungsional"],
    "Pusat Pengembangan Kompetensi SDM": ["Bidang Pengembangan SDM"]
  },
  "SEKOLAH TINGGI PERTANAHAN NASIONAL": {
    "Sekolah Tinggi Pertanahan Nasional": ["Bagian Akademik", "Bagian Administrasi Umum"]
  }
};

async function seed() {
  const client = await pool.connect();
  try {
    for (const l1 of Object.keys(HIERARKI_UNIT)) {
      // Check if L1 exists
      let l1Res = await client.query('SELECT id FROM unit_kerja_l1 WHERE nama = $1', [l1]);
      let l1Id;
      if (l1Res.rows.length === 0) {
        l1Res = await client.query('INSERT INTO unit_kerja_l1 (nama) VALUES ($1) RETURNING id', [l1]);
      }
      l1Id = l1Res.rows[0].id;

      for (const l2 of Object.keys(HIERARKI_UNIT[l1])) {
        let l2Res = await client.query('SELECT id FROM unit_kerja_l2 WHERE nama = $1 AND l1_id = $2', [l2, l1Id]);
        let l2Id;
        if (l2Res.rows.length === 0) {
          l2Res = await client.query('INSERT INTO unit_kerja_l2 (nama, l1_id) VALUES ($1, $2) RETURNING id', [l2, l1Id]);
        }
        l2Id = l2Res.rows[0].id;

        for (const l3 of HIERARKI_UNIT[l1][l2]) {
          let l3Res = await client.query('SELECT id FROM unit_kerja_l3 WHERE nama = $1 AND l2_id = $2', [l3, l2Id]);
          if (l3Res.rows.length === 0) {
            await client.query('INSERT INTO unit_kerja_l3 (nama, l2_id) VALUES ($1, $2)', [l3, l2Id]);
          }
        }
      }
    }
    console.log("Seeding complete.");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
