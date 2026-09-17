const express = require('express');
const cors = require('cors');
const pg = require('pg');
const { Pool } = pg;
// Kembalikan kolom DATE (OID 1082) apa adanya sebagai string 'YYYY-MM-DD' — cegah pergeseran
// 1 hari akibat konversi zona waktu saat pg mem-parse DATE menjadi objek Date.
pg.types.setTypeParser(1082, (v) => v);
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const spDocument = require('./spDocument'); // naskah Standar Pelayanan: HTML/PDF, DOCX, impor Word
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 5001;

// Cloudflare Tunnel meneruskan request dari localhost — percayai 1 level proxy
// agar req.ip berisi CF-Connecting-IP (IP asli pengguna), bukan 127.0.0.1
app.set('trust proxy', 1);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET belum dikonfigurasi di .env — server tidak dapat dijalankan.');
  process.exit(1);
}

// Bisa lebih dari satu origin (pisahkan koma). Produksi memakai HTTPS via Cloudflare.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || 'https://tlrb.ortalamr.id,http://tlrb.ortalamr.id')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// JARING PENGAMAN PAYLOAD: kolom cache besar (PDF base64, ratusan KB–MB per baris)
// hanya dipakai server. Tanpa ini, endpoint yang memakai `RETURNING *` / `SELECT *`
// ikut mengirimkannya ke browser — mis. simpan SOP dari studio pernah mengembalikan
// ~2 MB. Dibuang dari SEMUA respons JSON, satu titik agar tidak terlewat.
const KOLOM_INTERNAL = ['pdf_cache', 'pdf_cache_key', 'share_pdf', 'preview_png'];
app.use((req, res, next) => {
  const kirimAsli = res.json.bind(res);
  res.json = (data) => {
    const bersihkan = (v) => {
      if (Array.isArray(v)) return v.map(bersihkan);
      if (v && typeof v === 'object' && v.constructor === Object) {
        let adaYangDibuang = false;
        const hasil = {};
        for (const k of Object.keys(v)) {
          if (KOLOM_INTERNAL.includes(k)) { adaYangDibuang = true; continue; }
          hasil[k] = v[k];
        }
        return adaYangDibuang ? hasil : v;
      }
      return v;
    };
    // catch hanya membungkus bersihkan() — bila kirimAsli sendiri yang gagal
    // (mis. headers sudah terkirim), JANGAN kirim ulang (respons ganda).
    let hasilBersih = data;
    try { hasilBersih = bersihkan(data); } catch { /* pakai data asli */ }
    return kirimAsli(hasilBersih);
  };
  next();
});

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'e_sop_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// ============ RATE LIMITING ============
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ VALIDATION & SANITIZE ============
const validateInput = (data, schema) => {
  const errors = [];
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    if (rules.required && (!value || value === '')) {
      errors.push(`${field} wajib diisi`);
      continue;
    }
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push(`${field} harus teks`);
    }
    if (rules.minLength && value && value.length < rules.minLength) {
      errors.push(`${field} minimal ${rules.minLength} karakter`);
    }
  }
  return errors;
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'";&]/g, '').substring(0, 1000);
};

// ============ DATABASE INIT & MIGRATION ============
const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        nama_lengkap VARCHAR(255),
        email VARCHAR(255),
        role_id INTEGER REFERENCES roles(id),
        unit_l1 VARCHAR(255),
        unit_l2 VARCHAR(255),
        active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS unit_kerja_l1 (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(255) NOT NULL UNIQUE,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS unit_kerja_l2 (
        id SERIAL PRIMARY KEY,
        l1_id INTEGER REFERENCES unit_kerja_l1(id) ON DELETE CASCADE,
        nama VARCHAR(255) NOT NULL,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true,
        UNIQUE(l1_id, nama)
      );

      CREATE TABLE IF NOT EXISTS unit_kerja_l3 (
        id SERIAL PRIMARY KEY,
        l2_id INTEGER REFERENCES unit_kerja_l2(id) ON DELETE CASCADE,
        nama VARCHAR(255) NOT NULL,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true,
        UNIQUE(l2_id, nama)
      );
      
      CREATE TABLE IF NOT EXISTS dokumen (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(500) NOT NULL,
        jenis VARCHAR(100),
        tahun VARCHAR(4),
        l1_id INTEGER REFERENCES unit_kerja_l1(id),
        l2_id INTEGER REFERENCES unit_kerja_l2(id),
        l3_id INTEGER REFERENCES unit_kerja_l3(id),
        link TEXT,
        sumber TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        catatan TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(50),
        user_agent TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username VARCHAR(100),
        action VARCHAR(50) NOT NULL,
        resource VARCHAR(100),
        resource_id INTEGER,
        detail TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bpmn_models (
        id SERIAL PRIMARY KEY,
        process_title VARCHAR(500) NOT NULL,
        process_key VARCHAR(255) UNIQUE NOT NULL,
        l1_id INTEGER REFERENCES unit_kerja_l1(id),
        l2_id INTEGER REFERENCES unit_kerja_l2(id),
        description TEXT,
        bpmn_xml TEXT,
        svg_xml TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        catatan TEXT,
        version INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bpmn_model_config (
        id SERIAL PRIMARY KEY,
        model_id INTEGER REFERENCES bpmn_models(id) ON DELETE CASCADE,
        config_key VARCHAR(100) NOT NULL,
        config_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      /* ========================================================= */
      /* PETA PROSES BISNIS BERJENJANG (Level 0–2) — superadmin    */
      /* L0 = value chain (Inti/Pendukung/Lainnya), L1 = per unit, */
      /* L2 = subproses/relasi/lintas fungsi. Memakai mesin BPMN.  */
      /* parent_id menautkan L1 ke sub-process L0, L2 ke L1.       */
      /* ========================================================= */
      CREATE TABLE IF NOT EXISTS process_map_models (
        id SERIAL PRIMARY KEY,
        process_title VARCHAR(500) NOT NULL,
        level SMALLINT NOT NULL DEFAULT 0,
        kode VARCHAR(100),
        tahun VARCHAR(4),
        parent_id INTEGER REFERENCES process_map_models(id) ON DELETE SET NULL,
        parent_element_id VARCHAR(100),
        kelompok VARCHAR(50),
        unit_l1 VARCHAR(255),
        unit_l2 VARCHAR(255),
        bpmn_xml TEXT,
        svg_xml TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        catatan TEXT,
        version INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      /* Aktivitas terakhir sesi — sesi idle > batas idle-timeout dibersihkan otomatis
         agar tidak memblokir slot login akun shared (maks 4 perangkat). */
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

      /* Tautan sub-process → peta turunan (untuk DB yang sudah ada). */
      ALTER TABLE process_map_models ADD COLUMN IF NOT EXISTS parent_element_id VARCHAR(100);
      /* auto_layout: TRUE = kanvas hasil generate sinkronisasi (boleh di-regenerate);
         FALSE = sudah diedit manual via studio (jangan ditimpa); NULL = legacy. */
      ALTER TABLE process_map_models ADD COLUMN IF NOT EXISTS auto_layout BOOLEAN;
      /* Peta Relasi per kegiatan (baris level-3, sub-process di kanvas L2):
         daftar lembaga internal & eksternal (JSON array of string). */
      ALTER TABLE process_map_models ADD COLUMN IF NOT EXISTS relasi_internal TEXT;
      ALTER TABLE process_map_models ADD COLUMN IF NOT EXISTS relasi_eksternal TEXT;
      /* Tautan Daftar Proses L3 → usulan BPMN: usulan lahir dari kegiatan probis L2. */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS peta_kegiatan_id INTEGER;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS probis_kode VARCHAR(100);
      /* Tautan usulan ↔ kotak bersarang di dalam kotak kegiatan pada kanvas L2. */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS probis_element_id VARCHAR(100);
      /* DOKUMEN MANUAL (masa transisi dari Visual Paradigm/Visio):
         dokumen jadi berbentuk PDF unggahan atau tautan eksternal.
         Isi file PDF disimpan TERPISAH (manual_files) agar SELECT daftar ringan. */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS is_manual BOOLEAN;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS manual_nomor VARCHAR(150);
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS manual_link TEXT;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS manual_file_name VARCHAR(255);
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS manual_tanggal DATE;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS is_manual BOOLEAN;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS manual_nomor VARCHAR(150);
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS manual_link TEXT;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS manual_file_name VARCHAR(255);
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS manual_tanggal DATE;
      /* Tautan file SUMBER penyusunan (Visio/Visual Paradigm) — pelengkap PDF. */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS manual_link_visio TEXT;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS manual_link_visio TEXT;
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS manual_link_visio TEXT;
      /* BAGIKAN mode-view tanpa login: token publik per dokumen. SOP studio juga
         menyimpan PDF hasil render saat dibagikan (share_pdf, base64) agar publik
         tak perlu auth. */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS share_token VARCHAR(48);
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS share_token VARCHAR(48);
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS share_pdf TEXT;
      -- Cache PDF hasil render puppeteer (±9 detik) + kunci versinya. Selama dokumen
      -- tidak berubah, permintaan PDF/pratinjau dilayani dari cache = instan.
      -- KOTAK SAMPAH: dokumen yang dihapus disimpan 30 hari (soft delete) agar
      -- penghapusan tak sengaja dapat dipulihkan admin/superadmin.
      ALTER TABLE sop_models  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
      ALTER TABLE sop_models  ADD COLUMN IF NOT EXISTS deleted_by INTEGER;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS deleted_by INTEGER;
      ALTER TABLE sp_models   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
      ALTER TABLE sp_models   ADD COLUMN IF NOT EXISTS deleted_by INTEGER;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS pdf_cache TEXT;
      -- Gambar halaman pertama (PNG base64) — ponsel/tablet tidak bisa menampilkan
      -- PDF di dalam bingkai halaman, jadi pratinjaunya memakai gambar ini.
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS preview_png TEXT;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS pdf_cache_key TEXT;
      /* Revisi: tanggal catatan revisi admin terakhir + utas tanggapan penyusun (terpisah dari catatan). */
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS catatan_at TIMESTAMP;
      ALTER TABLE bpmn_models ADD COLUMN IF NOT EXISTS tanggapan TEXT;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS catatan_at TIMESTAMP;
      ALTER TABLE sop_models ADD COLUMN IF NOT EXISTS tanggapan TEXT;
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS catatan_at TIMESTAMP;
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS tanggapan TEXT;
      /* Studio Standar Pelayanan: naskah SP (komponen Service Delivery &
         Manufacturing) disimpan sebagai JSON — setara sop_data pada SOP. */
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS sp_data TEXT;
      /* Bagikan tautan publik SP: token + PDF hasil render (base64) agar
         pembaca tanpa login tidak perlu memicu render ulang. */
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS share_token VARCHAR(48);
      ALTER TABLE sp_models ADD COLUMN IF NOT EXISTS share_pdf TEXT;

      /* Notifikasi header: for_role 'admin' (admin+superadmin) atau 'user'
         (dibatasi unit_l1 bila terisi). Terbaca dilacak via users.notif_seen_at. */
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(10) NOT NULL,
        model_id INTEGER,
        judul TEXT,
        event VARCHAR(30) NOT NULL,
        pesan TEXT NOT NULL,
        for_role VARCHAR(10) NOT NULL,
        unit_l1 TEXT,
        actor VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_seen_at TIMESTAMP;

      CREATE TABLE IF NOT EXISTS manual_files (
        id SERIAL PRIMARY KEY,
        model_type VARCHAR(10) NOT NULL,
        model_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        mime VARCHAR(100),
        file_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      /* STANDAR PELAYANAN (SP) — modul baru; saat ini diisi lewat usulan &
         dokumen manual (belum ada studio penyusun). Struktur meniru sop_models. */
      CREATE TABLE IF NOT EXISTS sp_models (
        id SERIAL PRIMARY KEY,
        process_title VARCHAR(500) NOT NULL,
        l1_id INTEGER REFERENCES unit_kerja_l1(id),
        l2_id INTEGER REFERENCES unit_kerja_l2(id),
        description TEXT,
        status VARCHAR(20) DEFAULT 'usulan',
        catatan TEXT,
        version INTEGER DEFAULT 1,
        jenis_proses VARCHAR(100),
        klasifikasi_proses VARCHAR(200),
        is_manual BOOLEAN,
        manual_nomor VARCHAR(150),
        manual_link TEXT,
        manual_file_name VARCHAR(255),
        manual_tanggal DATE,
        penetapan_dasar VARCHAR(500),
        penetapan_tanggal DATE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      /* ========================================= */
      /* TABEL BARU KHUSUS UNTUK SOP BUILDER       */
      /* ========================================= */
      CREATE TABLE IF NOT EXISTS sop_models (
        id SERIAL PRIMARY KEY,
        process_title VARCHAR(500) NOT NULL,
        process_key VARCHAR(255) UNIQUE NOT NULL,
        l1_id INTEGER REFERENCES unit_kerja_l1(id),
        l2_id INTEGER REFERENCES unit_kerja_l2(id),
        description TEXT,
        sop_data TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        catatan TEXT,
        version INTEGER DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS peraturan_menteri (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(500) NOT NULL,
        jenis VARCHAR(50) DEFAULT 'Peraturan Menteri',
        tahun VARCHAR(4),
        tanggal_ditetapkan DATE,
        nomor VARCHAR(200),
        tentang TEXT,
        link_drive TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS juknis_dokumen (
        id SERIAL PRIMARY KEY,
        judul VARCHAR(500) NOT NULL,
        jenis VARCHAR(20) DEFAULT 'Juknis',
        nomor VARCHAR(200),
        tahun VARCHAR(4),
        tanggal_terbit DATE,
        tentang TEXT,
        link TEXT,
        unit_l1 VARCHAR(255),
        unit_l2 VARCHAR(255),
        unit_l3 VARCHAR(255),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // MIGRASI KOLOM UNIT KERJA & PLAIN_PASSWORD KE TABEL USER
    await client.query(`
      DO $$
      BEGIN
        BEGIN
            ALTER TABLE users ADD COLUMN unit_l1 VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
            ALTER TABLE users ADD COLUMN unit_l2 VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
            ALTER TABLE users ADD COLUMN plain_password TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);

    // MIGRASI KOLOM TANGGAL_TERBIT KE JUKNIS_DOKUMEN
    await client.query(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE juknis_dokumen ADD COLUMN tanggal_terbit DATE;
        EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);

    // MIGRASI: hapus UNIQUE constraint sessions.user_id (izinkan multi-sesi untuk role 'user', maks 4)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_key'
        ) THEN
          ALTER TABLE sessions DROP CONSTRAINT sessions_user_id_key;
        END IF;
      END $$;
    `);

    // MIGRASI KOLOM BARU KE SOP_MODELS (jenis_proses, klasifikasi_proses, process_key nullable)
    await client.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE sop_models ADD COLUMN jenis_proses VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE sop_models ADD COLUMN klasifikasi_proses VARCHAR(200); EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE sop_models ALTER COLUMN process_key DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END;
      END $$;
    `);

    // MIGRASI: bpmn_models.process_key nullable (field opsional, agar save tidak gagal 500)
    await client.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE bpmn_models ALTER COLUMN process_key DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END;
      END $$;
    `);

    // MIGRASI: tabel cover SOP bertanda tangan (dipisah dari sop_models agar list tetap ringan).
    // Cover diunggah setelah SOP 'approved' (disetujui Biro Ortala MR); saat cover masuk,
    // status SOP menjadi 'terbit' dan dokumen pindah ke Daftar SOP.
    await client.query(`
      CREATE TABLE IF NOT EXISTS sop_covers (
        sop_id INTEGER PRIMARY KEY REFERENCES sop_models(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        filename VARCHAR(255),
        mime VARCHAR(100),
        uploaded_by INTEGER REFERENCES users(id),
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      -- Berapa halaman cover yang benar-benar discan. Unit kerja umumnya hanya
      -- memindai halaman pertama (yang bertanda tangan); halaman cover LANJUTAN
      -- tetap harus dipakai dari sistem, bukan ikut hilang.
      ALTER TABLE sop_covers ADD COLUMN IF NOT EXISTS pages INTEGER;
    `);

    // Riwayat/log aktivitas dokumen BPMN & SOP: tercatat di tiap transisi status.
    // Catatan review Ortala TERSIMPAN PERMANEN di sini (kolom catatan di model
    // dibersihkan saat kirim ulang — riwayat inilah pengingatnya).
    await client.query(`
      CREATE TABLE IF NOT EXISTS doc_history (
        id SERIAL PRIMARY KEY,
        model_type VARCHAR(10) NOT NULL,
        model_id INTEGER NOT NULL,
        user_id INTEGER,
        user_role VARCHAR(30),
        unit VARCHAR(255),
        action VARCHAR(30) NOT NULL,
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS doc_history_model_idx ON doc_history (model_type, model_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS editing_sessions (
        model_type VARCHAR(10) NOT NULL,
        model_id   INTEGER NOT NULL,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id  TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_ping  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (model_type, model_id, client_id)
      );
    `);

    // MIGRASI: presence per-PERANGKAT (client_id), bukan per-user — akun shared (1 akun
    // dipakai ≤4 orang) harus tetap saling melihat "sedang diedit". Tabel lama (tanpa
    // client_id) di-drop dan dibuat ulang; isinya ephemeral (heartbeat), aman dibuang.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'editing_sessions' AND column_name = 'client_id'
        ) THEN
          DROP TABLE editing_sessions;
          CREATE TABLE editing_sessions (
            model_type VARCHAR(10) NOT NULL,
            model_id   INTEGER NOT NULL,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id  TEXT NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_ping  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (model_type, model_id, client_id)
          );
        END IF;
      END $$;
    `);

    // MIGRASI: tautkan entri registry `dokumen` ke model sumbernya (bpmn/sop) agar sinkronisasi
    // idempoten (1 entri per model, tanpa duplikat saat approve berulang). Index unik parsial —
    // baris impor lama (source_type NULL) tidak terpengaruh.
    await client.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE dokumen ADD COLUMN source_type VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE dokumen ADD COLUMN source_id INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS dokumen_source_uniq ON dokumen(source_type, source_id) WHERE source_type IS NOT NULL;`);

    // MIGRASI: informasi penetapan SOP & BPMN (diisi admin saat menekan "Ditetapkan").
    await client.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE sop_models ADD COLUMN penetapan_dasar VARCHAR(500); EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE sop_models ADD COLUMN penetapan_tanggal DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE bpmn_models ADD COLUMN penetapan_dasar VARCHAR(500); EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN ALTER TABLE bpmn_models ADD COLUMN penetapan_tanggal DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
      END $$;
    `);

    // MIGRASI: perpanjang kolom judul/nama (255 → 500) — judul proses ATR/BPN bisa sangat panjang
    await client.query(`
      DO $$
      BEGIN
        BEGIN ALTER TABLE dokumen ALTER COLUMN nama TYPE VARCHAR(500); EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TABLE sop_models ALTER COLUMN process_title TYPE VARCHAR(500); EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TABLE bpmn_models ALTER COLUMN process_title TYPE VARCHAR(500); EXCEPTION WHEN others THEN NULL; END;
      END $$;
    `);

    const roles = await client.query("SELECT COUNT(*) FROM roles");
    if (parseInt(roles.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO roles (name, description) VALUES
        ('superadmin', 'Super Admin - akses penuh + Peta Proses Bisnis'),
        ('admin', 'Administrator - akses penuh'),
        ('user', 'User - akses terbatas unit'),
        ('viewer', 'Viewer - hanya lihat data');
      `);
    }

    const usersCount = await client.query("SELECT COUNT(*) FROM users WHERE username = 'admin'");
    if (parseInt(usersCount.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (username, password, nama_lengkap, role_id, unit_l1, unit_l2) VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name='admin'), 'PUSAT', 'SELURUH UNIT')",
        ['admin', hashedPassword, 'Administrator']
      );
    }

    // Superadmin role + akun — idempoten (aman untuk DB yang sudah terisi sebelumnya).
    await client.query(
      "INSERT INTO roles (name, description) VALUES ('superadmin', 'Super Admin - akses penuh + Peta Proses Bisnis') ON CONFLICT (name) DO NOTHING"
    );
    const superCount = await client.query("SELECT COUNT(*) FROM users WHERE username = 'superadmin'");
    if (parseInt(superCount.rows[0].count) === 0) {
      const superHash = await bcrypt.hash('superadmin123', 10);
      await client.query(
        "INSERT INTO users (username, password, nama_lengkap, role_id, unit_l1, unit_l2) VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name='superadmin'), 'PUSAT', 'SELURUH UNIT')",
        ['superadmin', superHash, 'Super Administrator']
      );
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database Init Error:', err.message);
  } finally {
    client.release();
  }
};

// ============ AUTH MIDDLEWARE ============
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await pool.query(
      "SELECT * FROM sessions WHERE user_id = $1 AND token = $2 AND expires_at > NOW()",
      [decoded.id, token]
    );
    if (session.rows.length === 0) return res.status(401).json({ error: 'Session expired' });
    // Catat aktivitas terakhir (throttle 1 menit agar tidak menulis tiap request)
    pool.query(
      "UPDATE sessions SET last_activity = NOW() WHERE token = $1 AND last_activity < NOW() - INTERVAL '1 minute'",
      [token]
    ).catch(() => {});
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

// ==== Kontrol akses TULIS per-dokumen (anti-IDOR) ====
// Semantik sama dengan filter daftar: admin/superadmin bebas; viewer selalu ditolak;
// role 'user' hanya dokumen buatannya sendiri, dokumen unit kerjanya, atau dokumen
// tanpa unit (l1_id NULL). Mengembalikan row model (dengan nama unit) atau null
// (respons error sudah dikirim di sini).
const WRITE_TABLES = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' };
// Kolom default RINGAN (sop_models punya kolom besar: share_pdf/pdf_cache/preview_png —
// jangan ikut terangkut). Caller yang butuh kolom lain menyebutkannya lewat opsi `cols`.
const ACCESS_COLS_RINGAN = 'm.id, m.status, m.created_by, m.l1_id, m.l2_id, m.deleted_at';
// Status yang masih boleh dihapus oleh pengguna unit (role 'user'): dokumen yang
// BELUM disetujui Ortala MR — termasuk yang masih menunggu review ('pending').
// Dokumen approved/verifikasi/penetapan/terbit hanya boleh dihapus admin/superadmin.
const STATUS_BOLEH_HAPUS_USER = ['draft', 'usulan', 'rejected', 'pending'];
async function assertDeleteAccess(req, res, kind, id, cols = ACCESS_COLS_RINGAN) {
  const row = await assertModelAccess(req, res, kind, id, { cols });
  if (!row) return null;
  if (req.user.role === 'admin' || req.user.role === 'superadmin') return row;
  const st = row.status || 'draft';
  if (!STATUS_BOLEH_HAPUS_USER.includes(st)) {
    res.status(403).json({ error: 'Dokumen yang sudah masuk proses persetujuan hanya dapat dihapus oleh admin.' });
    return null;
  }
  return row;
}

async function assertModelAccess(req, res, kind, id, { write = true, cols = ACCESS_COLS_RINGAN } = {}) {
  const table = WRITE_TABLES[kind];
  if (!table) { res.status(400).json({ error: 'Jenis dokumen tidak dikenal' }); return null; }
  const r = await pool.query(
    `SELECT ${cols}, u1.nama AS _unit_l1_nama, u2.nama AS _unit_l2_nama
     FROM ${table} m
     LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
     LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
     WHERE m.id = $1`, [id]);
  if (r.rows.length === 0) { res.status(404).json({ error: 'Dokumen tidak ditemukan' }); return null; }
  const row = r.rows[0];
  // Dokumen di Kotak Sampah tidak boleh diubah (pulihkan dulu lewat /api/trash).
  if (write && row.deleted_at) { res.status(404).json({ error: 'Dokumen sudah dihapus (ada di Kotak Sampah).' }); return null; }
  const role = req.user.role;
  if (role === 'admin' || role === 'superadmin') return row;
  if (write && role !== 'user') { res.status(403).json({ error: 'Akses hanya-baca — tidak boleh mengubah dokumen.' }); return null; }
  const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sameL1 = norm(row._unit_l1_nama) === norm(req.user.unit_l1);
  const l2ok = !req.user.unit_l2 || norm(req.user.unit_l2) === 'seluruh unit' ||
               !row._unit_l2_nama || norm(row._unit_l2_nama) === norm(req.user.unit_l2);
  const boleh = row.created_by === req.user.id || row.l1_id === null || (sameL1 && l2ok);
  if (!boleh) {
    res.status(403).json({ error: write ? 'Dokumen milik unit kerja lain — Anda tidak berhak mengubahnya.' : 'Dokumen milik unit kerja lain.' });
    return null;
  }
  return row;
}
const assertWriteAccess = (req, res, kind, id, cols) => assertModelAccess(req, res, kind, id, { write: true, ...(cols ? { cols } : {}) });

const logAudit = async (userId, username, action, resource, resourceId, detail, ip) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, username, action, resource, resourceId || null, detail || null, ip || null]
    );
  } catch (err) { console.error('Audit log error:', err.message); }
};

// ============ USER MANAGEMENT ROUTES ============
app.get('/api/users', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const selectPlain = req.user.role === 'superadmin' ? ', u.plain_password' : '';
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama_lengkap, u.email, u.active, u.unit_l1, u.unit_l2, u.last_login, r.name as role${selectPlain},
             (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > NOW() AND s.last_activity > NOW() - INTERVAL '2 hours 15 minutes') AS active_sessions
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.id ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { username, password, nama_lengkap, email, role, unit_l1, unit_l2 } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    const roleId = roleResult.rows[0]?.id || 2;

    const result = await pool.query(
      `INSERT INTO users (username, password, plain_password, nama_lengkap, email, role_id, unit_l1, unit_l2)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username`,
      [username, hashedPassword, password, nama_lengkap, email, roleId, unit_l1, unit_l2]
    );
    
    await logAudit(req.user.id, req.user.username, 'CREATE_USER', 'users', result.rows[0].id, `User ${username} created`, req.ip);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { username, password, nama_lengkap, email, role, unit_l1, unit_l2, active } = req.body;
  
  try {
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    const roleId = roleResult.rows[0]?.id || 2;

    let result;
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE users SET username=$1, password=$2, plain_password=$3, nama_lengkap=$4, email=$5, role_id=$6, unit_l1=$7, unit_l2=$8, active=$9
         WHERE id=$10 RETURNING id`,
        [username, hashedPassword, password, nama_lengkap, email, roleId, unit_l1, unit_l2, active, id]
      );
    } else {
      result = await pool.query(
        `UPDATE users SET username=$1, nama_lengkap=$2, email=$3, role_id=$4, unit_l1=$5, unit_l2=$6, active=$7
         WHERE id=$8 RETURNING id`,
        [username, nama_lengkap, email, roleId, unit_l1, unit_l2, active, id]
      );
    }

    if (result.rowCount === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    await logAudit(req.user.id, req.user.username, 'UPDATE_USER', 'users', id, `User ${username} updated`, req.ip);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Self-service: any authenticated user can update their own profile (except role)
app.put('/api/users/me', authenticate, async (req, res) => {
  const { username, password, nama_lengkap, unit_l1, unit_l2 } = req.body;
  const userId = req.user.id;
  try {
    let result;
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE users SET username=$1, password=$2, nama_lengkap=$3, unit_l1=$4, unit_l2=$5
         WHERE id=$6 RETURNING id`,
        [username, hashedPassword, nama_lengkap, unit_l1, unit_l2, userId]
      );
    } else {
      result = await pool.query(
        `UPDATE users SET username=$1, nama_lengkap=$2, unit_l1=$3, unit_l2=$4
         WHERE id=$5 RETURNING id`,
        [username, nama_lengkap, unit_l1, unit_l2, userId]
      );
    }
    if (result.rowCount === 0) return res.status(404).json({ error: 'User tidak ditemukan' });
    const updated = await pool.query(
      `SELECT u.id, u.username, u.nama_lengkap, u.unit_l1, u.unit_l2, r.name as role
       FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
      [userId]
    );
    res.json(updated.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await client.query("DELETE FROM users WHERE id = $1", [id]);
    await client.query('COMMIT');
    await logAudit(req.user.id, req.user.username, 'DELETE_USER', 'users', id, null, req.ip);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============ EDITING PRESENCE ============

// Migration editing_sessions table — dipanggil sekali saat startup via initDB
// (ditambahkan ke block DO $$ di atas; route ini hanya dokumentasi posisi)

// Mulai / perpanjang sesi editing (dipanggil saat studio mount + heartbeat 60 detik).
// client_id = ID unik per browser/perangkat, agar akun shared tetap saling terdeteksi.
app.post('/api/editing-sessions', authenticate, async (req, res) => {
  const { model_type, model_id, client_id } = req.body;
  if (!['bpmn', 'sop'].includes(model_type) || !model_id || !client_id) return res.status(400).json({ error: 'Invalid' });
  try {
    await pool.query(`
      INSERT INTO editing_sessions (model_type, model_id, user_id, client_id, last_ping)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (model_type, model_id, client_id) DO UPDATE SET last_ping = NOW(), user_id = $3
    `, [model_type, Number(model_id), req.user.id, String(client_id)]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Akhiri sesi editing (dipanggil saat studio unmount / beforeunload)
app.delete('/api/editing-sessions', authenticate, async (req, res) => {
  const { model_type, model_id, client_id } = req.body;
  try {
    await pool.query(
      "DELETE FROM editing_sessions WHERE model_type=$1 AND model_id=$2 AND client_id=$3",
      [model_type, Number(model_id), String(client_id || '')]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ambil semua editor aktif (last_ping < 3 menit) untuk satu jenis dokumen
app.get('/api/editing-sessions/:type', authenticate, async (req, res) => {
  const { type } = req.params;
  if (!['bpmn', 'sop'].includes(type)) return res.status(400).json({ error: 'Invalid' });
  try {
    const result = await pool.query(`
      SELECT es.model_id, es.user_id, es.client_id, u.username, u.nama_lengkap, es.started_at
      FROM editing_sessions es
      JOIN users u ON es.user_id = u.id
      WHERE es.model_type = $1 AND es.last_ping > NOW() - INTERVAL '3 minutes'
    `, [type]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sesi aktif saat ini (superadmin only)
app.get('/api/sessions/active', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.created_at AS login_time, s.expires_at, s.last_activity, s.ip_address, s.user_agent,
             u.id AS user_id, u.username, u.nama_lengkap, r.name AS role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE s.expires_at > NOW() AND s.last_activity > NOW() - INTERVAL '2 hours 15 minutes'
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Riwayat login 3 hari terakhir, maks 200 entri (superadmin only)
app.get('/api/login-activity', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.created_at, al.username, al.ip_address, u.nama_lengkap, r.name AS role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE al.action = 'LOGIN' AND al.created_at > NOW() - INTERVAL '3 days'
      ORDER BY al.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AUTH ROUTES ============
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    const errors = validateInput({ username, password }, {
      username: { required: true, minLength: 3 },
      password: { required: true, minLength: 4 }
    });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    // Username TIDAK disanitasi: query sudah parameterized, dan sanitasi justru membuat
    // akun yang mengandung karakter khusus (dibuat apa adanya oleh admin) mustahil login.
    const result = await pool.query(
      `SELECT u.id, u.username, u.password, u.nama_lengkap, u.unit_l1, u.unit_l2, r.name as role
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1 AND u.active = true`,
      [String(username).trim()]
    );

    // Pesan tunggal — jangan bocorkan apakah username terdaftar (anti-enumerasi).
    if (result.rows.length === 0) return res.status(401).json({ error: 'Username atau password salah' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Username atau password salah' });
    
    const userRole = user.role || 'viewer';
    // Masa berlaku token diperpanjang agar tidak logout di tengah hari kerja:
    // login biasa 12 jam (cukup 1 hari kerja penuh + lembur), "Ingat saya" 30 hari.
    const token = jwt.sign(
      { id: user.id, username: user.username, role: userRole, unit_l1: user.unit_l1, unit_l2: user.unit_l2 },
      JWT_SECRET,
      { expiresIn: remember ? '720h' : '12h' }
    );

    const expiresAt = new Date(Date.now() + (remember ? 720 * 3600000 : 12 * 3600000));
    const sessionId = crypto.randomUUID();

    const MAX_USER_SESSIONS = 4;
    const loginClient = await pool.connect();
    try {
      await loginClient.query('BEGIN');
      // Bersihkan: sesi kedaluwarsa + sesi "hantu" yang idle melebihi batas idle-timeout
      // (klien auto-logout setelah 2 jam idle; perangkat yang menutup browser tanpa logout
      // tidak boleh terus memblokir slot login akun shared).
      await loginClient.query(
        "DELETE FROM sessions WHERE expires_at < NOW() OR last_activity < NOW() - INTERVAL '2 hours 15 minutes'"
      );
      // Riwayat login (audit_logs LOGIN) hanya disimpan 3 hari
      await loginClient.query(
        "DELETE FROM audit_logs WHERE action = 'LOGIN' AND created_at < NOW() - INTERVAL '3 days'"
      );

      if (userRole === 'user') {
        // Role 'user': izinkan hingga MAX_USER_SESSIONS sesi bersamaan
        let { rows: [{ count }] } = await loginClient.query(
          "SELECT COUNT(*) FROM sessions WHERE user_id = $1 AND expires_at > NOW()",
          [user.id]
        );
        count = parseInt(count);
        if (count >= MAX_USER_SESSIONS) {
          // Slot penuh — gusur sesi yang tampak mati (idle > 10 menit, kemungkinan
          // browser ditutup tanpa logout) mulai dari yang paling lama tidak aktif.
          const evicted = await loginClient.query(
            `DELETE FROM sessions WHERE id IN (
               SELECT id FROM sessions
               WHERE user_id = $1 AND last_activity < NOW() - INTERVAL '10 minutes'
               ORDER BY last_activity ASC LIMIT $2
             ) RETURNING id`,
            [user.id, count - MAX_USER_SESSIONS + 1]
          );
          count -= evicted.rowCount;
        }
        if (count >= MAX_USER_SESSIONS) {
          await loginClient.query('ROLLBACK');
          // JANGAN release di sini — blok finally di bawah yang melakukannya.
          // Release ganda memicu "Release called on client already released" lalu
          // respons ganda "Cannot set headers after they are sent" (error produksi).
          return res.status(429).json({
            error: `Akun ini sudah digunakan oleh ${MAX_USER_SESSIONS} perangkat aktif. Minta salah satu pengguna logout terlebih dahulu, atau hubungi admin.`
          });
        }
        await loginClient.query(
          `INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
          [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]
        );
      } else {
        // Role lain (admin, superadmin, viewer): satu sesi per akun
        await loginClient.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
        await loginClient.query(
          `INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
          [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]
        );
      }

      await loginClient.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
      await loginClient.query('COMMIT');
    } catch (txErr) {
      await loginClient.query('ROLLBACK');
      throw txErr;
    } finally {
      loginClient.release();
    }
    await logAudit(user.id, user.username, 'LOGIN', 'auth', null, null, req.ip);
    
    res.json({
      token,
      user: { id: user.id, username: user.username, nama_lengkap: user.nama_lengkap, role: userRole, unit_l1: user.unit_l1, unit_l2: user.unit_l2 }
    });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    // Hapus hanya sesi perangkat ini — sesi perangkat lain (shared account) tetap aktif
    const token = (req.headers.authorization || '').split(' ')[1];
    await pool.query("DELETE FROM sessions WHERE token = $1 AND user_id = $2", [token, req.user.id]);
    res.json({ success: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/auth/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============ UNIT KERJA ROUTES ============
app.get('/api/unit-kerja/l1', authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM unit_kerja_l1 WHERE aktif = true ORDER BY nama");
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/unit-kerja/l2', authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM unit_kerja_l2 WHERE aktif = true ORDER BY nama");
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/unit-kerja/l3', authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM unit_kerja_l3 WHERE aktif = true ORDER BY nama");
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// ============ UNIT KERJA TREE (proxy ke kehadiran.ortalamr.id) ============
const _kehadiranCache = { token: null, tokenExpiry: 0, tree: null, treeExpiry: 0 };
let _tokenPromise = null;
let _treePromise = null;

async function _getKehadiranToken() {
  if (_kehadiranCache.token && Date.now() < _kehadiranCache.tokenExpiry) return _kehadiranCache.token;
  if (_tokenPromise) return _tokenPromise;
  _tokenPromise = (async () => {
    const r = await fetch('https://kehadiran.ortalamr.id/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.KEHADIRAN_CLIENT_ID || 'simpel-esop', client_secret: process.env.KEHADIRAN_CLIENT_SECRET || '' })
    });
    if (!r.ok) throw new Error('Gagal ambil token kehadiran');
    const d = await r.json();
    _kehadiranCache.token = d.access_token;
    _kehadiranCache.tokenExpiry = Date.now() + ((d.expires_in ?? 3600) - 60) * 1000;
    return _kehadiranCache.token;
  })().finally(() => { _tokenPromise = null; });
  return _tokenPromise;
}

app.get('/api/unit-kerja/tree', authenticate, async (req, res) => {
  try {
    if (_kehadiranCache.tree && Date.now() < _kehadiranCache.treeExpiry) return res.json(_kehadiranCache.tree);
    if (_treePromise) return res.json(await _treePromise);
    _treePromise = (async () => {
      const token = await _getKehadiranToken();
      const r = await fetch('https://kehadiran.ortalamr.id/api/master-data/unit-kerja/external', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!r.ok) throw new Error('Gagal ambil data unit kerja dari kehadiran');
      const data = await r.json();
      _kehadiranCache.tree = data;
      _kehadiranCache.treeExpiry = Date.now() + 3600000;
      return data;
    })().finally(() => { _treePromise = null; });
    res.json(await _treePromise);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Sinkronisasi data kehadiran ke tabel unit_kerja lokal (admin only)
app.post('/api/unit-kerja/sync', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const token = await _getKehadiranToken();
    const r = await fetch('https://kehadiran.ortalamr.id/api/master-data/unit-kerja/external', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error('Gagal ambil tree dari kehadiran');
    const tree = await r.json();

    let countL1 = 0, countL2 = 0, countL3 = 0;

    for (const n1 of tree) {
      const r1 = await pool.query(
        `INSERT INTO unit_kerja_l1 (nama, kode, aktif) VALUES ($1, $2, true)
         ON CONFLICT (nama) DO UPDATE SET aktif = true RETURNING id`,
        [n1.nama, n1.id.substring(0, 8)]
      ).catch(() => null);
      const l1id = r1?.rows[0]?.id;
      if (l1id) countL1++;
      if (!l1id || !n1.children?.length) continue;

      for (const n2 of n1.children) {
        const r2 = await pool.query(
          `INSERT INTO unit_kerja_l2 (l1_id, nama, kode, aktif) VALUES ($1, $2, $3, true)
           ON CONFLICT (l1_id, nama) DO UPDATE SET aktif = true RETURNING id`,
          [l1id, n2.nama, n2.id.substring(0, 8)]
        ).catch(() => null);
        const l2id = r2?.rows[0]?.id;
        if (l2id) countL2++;
        if (!l2id || !n2.children?.length) continue;

        for (const n3 of n2.children) {
          const r3 = await pool.query(
            `INSERT INTO unit_kerja_l3 (l2_id, nama, kode, aktif) VALUES ($1, $2, $3, true)
             ON CONFLICT (l2_id, nama) DO UPDATE SET aktif = true RETURNING id`,
            [l2id, n3.nama, n3.id.substring(0, 8)]
          ).catch(() => null);
          if (r3?.rows[0]?.id) countL3++;
        }
      }
    }

    // Invalidate tree cache agar fetch ulang
    _kehadiranCache.tree = null; _kehadiranCache.treeExpiry = 0;
    res.json({ ok: true, synced: { l1: countL1, l2: countL2, l3: countL3 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DOKUMEN ROUTES ============
app.get('/api/dokumen', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT d.*, u1.nama as unit_l1, u2.nama as unit_l2, u3.nama as unit_l3
      FROM dokumen d
      LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON d.l2_id = u2.id
      LEFT JOIN unit_kerja_l3 u3 ON d.l3_id = u3.id
      ORDER BY d.created_at DESC`);
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/dokumen', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    const result = await pool.query(
      "INSERT INTO dokumen (nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [nama, jenis, tahun, l1_id, l2_id || null, l3_id || null, link, sumber, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Resolusi id unit kerja dari NAMA (dropdown HIERARKI_UNIT frontend). Pencocokan
// dinormalisasi (case-insensitive + spasi dirapikan) karena nama di konstanta
// frontend tidak selalu identik dengan isi tabel. Dengan createIfMissing, unit
// yang belum ada DIBUAT — sebelumnya lookup gagal diam-diam dan tersimpan NULL
// (muncul sebagai "(Tanpa Unit)/(Tanpa Sub-Unit)" padahal pengguna sudah memilih).
const NORM_NAMA_SQL = "LOWER(regexp_replace(TRIM(nama), '\\s+', ' ', 'g'))";
async function resolveUnitIds(unitL1, unitL2, createIfMissing = false) {
  const norm = v => String(v || '').replace(/\s+/g, ' ').trim();
  let l1Id = null, l2Id = null;
  const n1 = norm(unitL1);
  if (n1) {
    let r1 = await pool.query(`SELECT id FROM unit_kerja_l1 WHERE ${NORM_NAMA_SQL} = LOWER($1) ORDER BY id LIMIT 1`, [n1]);
    if (!r1.rows[0] && createIfMissing) {
      r1 = await pool.query('INSERT INTO unit_kerja_l1 (nama) VALUES ($1) RETURNING id', [n1]);
    }
    if (r1.rows[0]) {
      l1Id = r1.rows[0].id;
      const n2 = norm(unitL2);
      if (n2 && n2 !== 'SELURUH UNIT') {
        let r2 = await pool.query(`SELECT id FROM unit_kerja_l2 WHERE ${NORM_NAMA_SQL} = LOWER($1) AND l1_id = $2 ORDER BY id LIMIT 1`, [n2, l1Id]);
        if (!r2.rows[0] && createIfMissing) {
          r2 = await pool.query('INSERT INTO unit_kerja_l2 (nama, l1_id) VALUES ($1, $2) RETURNING id', [n2, l1Id]);
        }
        if (r2.rows[0]) l2Id = r2.rows[0].id;
      }
    }
  }
  return { l1Id, l2Id };
}

// Sinkronisasi entri registry `dokumen` dari model aplikasi (idempoten, 1 baris per model).
// Dipanggil saat BPMN 'approved' & SOP 'terbit'. `row` = baris model (id, process_title, l1_id, l2_id, created_by).
async function syncDokumenFromModel({ type, jenis, row, status }) {
  // Pastikan unit tertaut agar masuk Rekapitulasi per Unit/Sub-Unit di Dashboard.
  // Bila l1_id/l2_id model kosong (mis. lookup gagal karena beda kapitalisasi saat simpan),
  // resolusi ulang dari nama unit di sop_data secara case-insensitive (ILIKE).
  let l1 = row.l1_id, l2 = row.l2_id;
  if (!l1 && type === 'sop' && row.sop_data) {
    try {
      const j = JSON.parse(row.sop_data);
      if (j && j.unitKerja) {
        const r1 = await pool.query('SELECT id FROM unit_kerja_l1 WHERE nama ILIKE $1 LIMIT 1', [String(j.unitKerja).trim()]);
        if (r1.rows[0]) {
          l1 = r1.rows[0].id;
          if (j.subUnitKerja) {
            const r2 = await pool.query('SELECT id FROM unit_kerja_l2 WHERE nama ILIKE $1 AND l1_id = $2 LIMIT 1', [String(j.subUnitKerja).trim(), l1]);
            if (r2.rows[0]) l2 = r2.rows[0].id;
          }
        }
      }
    } catch (e) { /* abaikan parse error */ }
  }
  // Tautan "buka dokumen" dari Dashboard:
  //  • Dokumen MANUAL (unggahan PDF / tautan Drive) TIDAK punya kanvas — studio akan
  //    terbuka KOSONG. Arahkan ke halaman modul dgn ?doc=<id> supaya popup Detail
  //    Dokumen (viewer PDF/tautan) yang muncul.
  //  • Dokumen studio → studio mode baca. CATATAN: BPMN dulu keliru diarahkan ke
  //    `/bpmn?...` (halaman DAFTAR, bukan kanvas) sehingga diagram tak pernah tampil;
  //    yang benar `/bpmn/studio?...`.
  const link = row.is_manual
    ? `/${type}?doc=${row.id}`
    : `/${type}/studio?id=${row.id}&mode=view`;
  const tahun = String(new Date().getFullYear());
  await pool.query(`
    INSERT INTO dokumen (nama, jenis, tahun, l1_id, l2_id, link, sumber, status, source_type, source_id, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL DO UPDATE
      SET nama = EXCLUDED.nama, jenis = EXCLUDED.jenis, tahun = EXCLUDED.tahun,
          l1_id = EXCLUDED.l1_id, l2_id = EXCLUDED.l2_id, link = EXCLUDED.link,
          status = EXCLUDED.status, updated_at = NOW()
  `, [row.process_title, jenis, tahun, l1, l2, link, 'Aplikasi', status, type, row.id, row.created_by || null]);
}
async function removeDokumenForModel(type, id) {
  await pool.query('DELETE FROM dokumen WHERE source_type = $1 AND source_id = $2', [type, id]);
}

app.put('/api/dokumen/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    await pool.query(
      "UPDATE dokumen SET nama=$1, jenis=$2, tahun=$3, l1_id=$4, l2_id=$5, l3_id=$6, link=$7, sumber=$8, updated_at=NOW() WHERE id=$9",
      [nama, jenis, tahun, l1_id, l2_id || null, l3_id || null, link, sumber, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/dokumen/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    // Bila baris registry ini bersumber dari model (bpmn/sop/sp yang telah ditetapkan),
    // kembalikan model tsb ke status 'penetapan' (Proses Penetapan Menteri) agar tak lagi
    // tampil di kartu "Telah Ditetapkan" — jadi Dashboard & menu penyusunan tetap sinkron.
    const src = await pool.query('SELECT source_type, source_id FROM dokumen WHERE id = $1', [req.params.id]);
    const row = src.rows[0];
    if (!row) return res.status(404).json({ error: 'Dokumen registry tidak ditemukan' });
    await pool.query("DELETE FROM dokumen WHERE id = $1", [req.params.id]);
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[row.source_type];
    let reverted = null;
    if (table && row.source_id) {
      // Mundurkan HANYA dokumen yang memang berstatus final (approved/terbit) — jangan
      // menyeret dokumen berstatus lain ke 'penetapan' tanpa sebab, dan catat riwayatnya.
      const upd = await pool.query(
        `UPDATE ${table} SET status = 'penetapan', updated_at = NOW()
         WHERE id = $1 AND status IN ('approved', 'terbit') RETURNING id, status`, [row.source_id]);
      if (upd.rowCount > 0) {
        reverted = { type: row.source_type, id: row.source_id };
        if (row.source_type !== 'sp') logDocHistory(row.source_type, row.source_id, req, 'penetapan', 'Entri registry Dashboard dihapus admin — status dikembalikan ke Proses Penetapan');
      }
    }
    res.json({ success: true, reverted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/dokumen/:id/status', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });

  try {
    const result = await pool.query(
      'UPDATE dokumen SET status = $1, catatan = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, catatan || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// ==========================================================
// ============ BPMN PROCESS MODELS (STUDIO LAMA) =========== 
// ==========================================================
// Kolom bpmn_models untuk endpoint DAFTAR — SENGAJA TANPA `bpmn_xml` & `svg_xml`
// (diagram bisa jutaan karakter; halaman daftar tidak memakainya — diagram diambil
// lewat GET /bpmn/models/:id saat studio/preview dibuka).
const BPMN_LIST_COLS = ['id','process_title','process_key','l1_id','l2_id','description','status','version','created_by',
  'created_at','updated_at','catatan','jenis_proses','klasifikasi_proses','penetapan_dasar','penetapan_tanggal',
  'peta_kegiatan_id','probis_kode','probis_element_id','is_manual','manual_nomor','manual_link','manual_file_name',
  'manual_tanggal','manual_link_visio','share_token','catatan_at','tanggapan'].map(c => `m.${c}`).join(', ');

app.get('/api/bpmn/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    let query = `
      SELECT ${BPMN_LIST_COLS}, u1.nama as unit_l1, u2.nama as unit_l2
      FROM bpmn_models m
      LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
      WHERE m.deleted_at IS NULL
    `;
    const params = [];
    if (role !== 'admin' && role !== 'superadmin') {
      query += ` AND (m.created_by = $1`;
      params.push(id);
      if (unit_l1 && unit_l1 !== '') {
        query += ` OR (u1.nama ILIKE $2`;
        params.push(unit_l1);
        if (unit_l2 && unit_l2 !== '' && unit_l2 !== 'SELURUH UNIT') {
          query += ` AND (u2.nama ILIKE $3 OR u2.nama IS NULL))`;
          params.push(unit_l2);
        } else {
          query += `)`;
        }
      }
      query += ` OR m.l1_id IS NULL)`;
    }
    query += ` ORDER BY m.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Pratinjau diagram: hanya SVG (tanpa bpmn_xml yang tak dipakai untuk pratinjau).
app.get('/api/bpmn/models/:id/svg', authenticate, async (req, res) => {
  try {
    // Batasi sesuai visibilitas unit (anti-enumerasi ID lintas unit) + dokumen di sampah 404.
    const acc = await assertModelAccess(req, res, 'bpmn', req.params.id, { write: false, cols: `${ACCESS_COLS_RINGAN}, m.svg_xml` });
    if (!acc) return;
    if (acc.deleted_at) return res.status(404).json({ error: 'Model tidak ditemukan' });
    res.json({ svg_xml: acc.svg_xml || null });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    const acc = await assertModelAccess(req, res, 'bpmn', req.params.id, { write: false, cols: 'm.*' });
    if (!acc) return;
    if (acc.deleted_at) return res.status(404).json({ error: 'Model not found' });
    const { _unit_l1_nama, _unit_l2_nama, ...row } = acc;
    res.json({ ...row, unit_l1: _unit_l1_nama, unit_l2: _unit_l2_nama });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.post('/api/bpmn/models', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, l1_id, l2_id, unit_l1, unit_l2, description, jenis_proses, klasifikasi_proses, bpmn_xml, svg_xml, status } = req.body;
    // Bila l1_id tidak dikirim tapi nama unit ada (mis. buat Usulan), resolve dari nama (ILIKE).
    let finalL1 = l1_id || null, finalL2 = l2_id || null;
    if (!finalL1 && unit_l1) {
      const u = await resolveUnitIds(unit_l1, unit_l2, true);
      finalL1 = u.l1Id; finalL2 = u.l2Id;
    }
    const modelResult = await pool.query(
      `INSERT INTO bpmn_models (process_title, process_key, l1_id, l2_id, description, jenis_proses, klasifikasi_proses, status, created_by, bpmn_xml, svg_xml)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [process_title, process_key || null, finalL1, finalL2, description || null,
       jenis_proses || null, klasifikasi_proses || null, status || 'draft', req.user.id, bpmn_xml || null, svg_xml || null]
    );
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`,
      [modelResult.rows[0].id]
    );
    if ((status || 'draft') === 'pending') pushNotif({ kind: 'bpmn', row: full.rows[0], event: 'pending', req });
    logDocHistory('bpmn', modelResult.rows[0].id, req, (status || 'draft') === 'usulan' ? 'usulan' : 'create', null);
    if ((status || 'draft') === 'pending') logDocHistory('bpmn', modelResult.rows[0].id, req, 'pending', null);
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.put('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    const lockChk = await assertWriteAccess(req, res, 'bpmn', req.params.id);
    if (!lockChk) return;
    if (['penetapan', 'approved'].includes(lockChk.status)) {
      return res.status(403).json({ error: 'Proses Bisnis terkunci (penetapan/ditetapkan). Buat salinan untuk merevisi.' });
    }
    const prevStatus = lockChk.status;
    const { process_title, process_key, l1_id, l2_id, description, bpmn_xml, svg_xml, status, jenis_proses, klasifikasi_proses } = req.body;
    // VERSI (aturan sama dgn SOP): penyusunan pertama tetap v1; naik +1 hanya saat
    // dokumen hasil catatan review Ortala ('rejected') disimpan/dikirim lagi.
    const versionBump = (prevStatus === 'rejected' && ['draft', 'pending'].includes(status || 'draft')) ? 1 : 0;
    const result = await pool.query(
      `UPDATE bpmn_models
       SET process_title = $1, process_key = $2, l1_id = $3, l2_id = $4, description = $5,
           bpmn_xml = $6, svg_xml = $7, status = $8::varchar,
           jenis_proses = $9, klasifikasi_proses = $10,
           updated_at = NOW(), version = version + $12,
           catatan = CASE WHEN $8::varchar IN ('draft', 'pending') THEN NULL ELSE catatan END
       WHERE id = $11
       RETURNING *`,
      [process_title, process_key || null, l1_id || null, l2_id || null, description || null,
       bpmn_xml, svg_xml, status || 'draft',
       jenis_proses || null, klasifikasi_proses || null, req.params.id, versionBump]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`,
      [result.rows[0].id]
    );
    if ((status || 'draft') === 'pending' && prevStatus !== 'pending') pushNotif({ kind: 'bpmn', row: full.rows[0], event: 'pending', req });
    if (status && status !== prevStatus) {
      logDocHistory('bpmn', req.params.id, req, status,
        prevStatus === 'rejected' && status === 'pending' ? 'Mengirim ulang hasil perbaikan setelah catatan review' : null);
    }
    res.json(full.rows[0]);
  } catch (err) { console.error('PUT /bpmn/models/:id error:', err.message, err.detail || ''); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.put('/api/bpmn/models/:id/save', authenticate, async (req, res) => {
  try {
    const cur = await assertWriteAccess(req, res, 'bpmn', req.params.id);
    if (!cur) return;
    if (['penetapan', 'approved'].includes(cur.status)) {
      return res.status(403).json({ error: 'Proses Bisnis terkunci (penetapan/ditetapkan). Buat salinan untuk merevisi.' });
    }
    const lockChk = { rows: [cur] };
    const { bpmn_xml, svg_xml, status } = req.body;
    // Versi naik hanya saat revisi atas catatan review Ortala (sama dgn SOP).
    const versionBump = (lockChk.rows[0]?.status === 'rejected' && ['draft', 'pending'].includes(status || 'draft')) ? 1 : 0;
    const result = await pool.query(
      `UPDATE bpmn_models
       SET bpmn_xml = $1, svg_xml = $2, status = $3::varchar, updated_at = NOW(),
           version = version + $5,
           -- $3 dipakai dua kali → WAJIB di-cast, kalau tidak PostgreSQL menolak
           -- dengan "inconsistent types deduced for parameter $3" (error 42P08)
           -- dan SETIAP penyimpanan BPMN yang mengubah status gagal 500.
           catatan = CASE WHEN $3::varchar IN ('draft', 'pending') THEN NULL ELSE catatan END,
           catatan_at = CASE WHEN $3::varchar IN ('draft', 'pending') THEN NULL ELSE catatan_at END
       WHERE id = $4 RETURNING *`,
      [bpmn_xml, svg_xml, status || 'draft', req.params.id, versionBump]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    if (status && status !== lockChk.rows[0]?.status) {
      logDocHistory('bpmn', req.params.id, req, status,
        lockChk.rows[0]?.status === 'rejected' && status === 'pending' ? 'Mengirim ulang hasil perbaikan setelah catatan review' : null);
    }
    res.json(result.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// AUTO-SAVE BPMN: simpan diagram diam-diam (tanpa naikkan versi, tanpa ubah status).
// Dipakai timer auto-save di studio agar pekerjaan tak hilang bila sesi/koneksi putus.
app.put('/api/bpmn/models/:id/autosave', authenticate, async (req, res) => {
  try {
    const chk = await assertWriteAccess(req, res, 'bpmn', req.params.id);
    if (!chk) return;
    if (['penetapan', 'approved'].includes(chk.status)) {
      return res.status(403).json({ error: 'Dokumen terkunci.' });
    }
    const { bpmn_xml, svg_xml } = req.body;
    if (!bpmn_xml) return res.status(400).json({ error: 'Data diagram kosong.' });
    await pool.query(
      `UPDATE bpmn_models SET bpmn_xml = $1, svg_xml = $2, updated_at = NOW() WHERE id = $3`,
      [bpmn_xml, svg_xml || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.delete('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    const acc = await assertDeleteAccess(req, res, 'bpmn', req.params.id, `${ACCESS_COLS_RINGAN}, m.peta_kegiatan_id, m.probis_element_id`);
    if (!acc) return;
    // Usulan yang tertaut kegiatan probis (kotak L3 pada kanvas L2): kotaknya
    // ikut dibersihkan dari kanvas agar tidak dibuat ulang oleh sinkronisasi.
    const doc = { peta_kegiatan_id: acc.peta_kegiatan_id, probis_element_id: acc.probis_element_id };
    if (doc && doc.peta_kegiatan_id && doc.probis_element_id) {
      try {
        const kegQ = await pool.query('SELECT parent_id FROM process_map_models WHERE id = $1', [doc.peta_kegiatan_id]);
        if (kegQ.rows[0] && kegQ.rows[0].parent_id) {
          const mapQ = await pool.query('SELECT id, bpmn_xml FROM process_map_models WHERE id = $1', [kegQ.rows[0].parent_id]);
          if (mapQ.rows[0]) {
            const stripped = stripElementFromBpmnXml(mapQ.rows[0].bpmn_xml, doc.probis_element_id);
            if (stripped !== null) {
              await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW() WHERE id = $2', [stripped, mapQ.rows[0].id]);
            }
          }
        }
      } catch (e) { console.error('Bersihkan kotak L3 gagal:', e.message); }
    }
    await pool.query('UPDATE bpmn_models SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1', [req.params.id, req.user.id]);
    await removeDokumenForModel('bpmn', req.params.id);
    logDocHistory('bpmn', req.params.id, req, 'dihapus', 'Dipindahkan ke Kotak Sampah');
    res.json({ success: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.patch('/api/bpmn/models/status/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan, penetapan_dasar, penetapan_tanggal } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });
  try {
    const result = await pool.query(
      `UPDATE bpmn_models SET status = $1::varchar, catatan = $2, updated_at = NOW(),
         catatan_at = CASE WHEN $1::varchar = 'rejected' THEN NOW() ELSE catatan_at END,
         penetapan_dasar = COALESCE($4, penetapan_dasar),
         penetapan_tanggal = COALESCE($5, penetapan_tanggal)
       WHERE id = $3 RETURNING *`,
      [status, catatan || null, id, penetapan_dasar || null, penetapan_tanggal || null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'BPMN Model tidak ditemukan' });
    // Sinkronkan ke registry Dashboard: masuk saat approved, keluar bila tidak.
    try {
      if (status === 'approved') await syncDokumenFromModel({ type: 'bpmn', jenis: 'Proses Bisnis', row: result.rows[0], status: 'approved' });
      else await removeDokumenForModel('bpmn', id);
    } catch (e) { console.error('Sync dokumen BPMN gagal:', e.message); }
    pushNotif({ kind: 'bpmn', row: result.rows[0], event: status, req });
    logDocHistory('bpmn', id, req, status, catatan || null);
    res.json(result.rows[0]);
  } catch (err) { console.error('Error update status BPMN:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.patch('/api/bpmn/models/:id/meta', authenticate, async (req, res) => {
  const { id } = req.params;
  const { process_title, jenis_proses, klasifikasi_proses } = req.body;
  if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Judul tidak boleh kosong' });
  try {
    // Terkunci setelah masuk penetapan/ditetapkan.
    const curRow = await assertWriteAccess(req, res, 'bpmn', id);
    if (!curRow) return;
    if (['penetapan', 'approved'].includes(curRow.status)) {
      return res.status(403).json({ error: 'Proses Bisnis sudah dalam penetapan/ditetapkan dan terkunci. Buat salinan untuk merevisi.' });
    }
    const result = await pool.query(
      `UPDATE bpmn_models SET process_title = $1, jenis_proses = $2, klasifikasi_proses = $3, updated_at = NOW()
       WHERE id = $4 RETURNING id, process_title, jenis_proses, klasifikasi_proses, updated_at`,
      [process_title.trim(), jenis_proses || null, klasifikasi_proses || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Model tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) { console.error('PATCH bpmn meta:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/bpmn/models/:id/copy', authenticate, async (req, res) => {
  const { id } = req.params;
  const { process_title, jenis_proses, klasifikasi_proses } = req.body;
  try {
    // Salin = membaca isi dokumen sumber; batasi sesuai visibilitas unit (viewer ditolak).
    const s = await assertWriteAccess(req, res, 'bpmn', id, 'm.*');
    if (!s) return;
    const newTitle = (process_title && process_title.trim()) ? process_title.trim() : `Salinan - ${s.process_title}`;
    const result = await pool.query(
      `INSERT INTO bpmn_models (process_title, process_key, l1_id, l2_id, description, bpmn_xml, svg_xml, status, jenis_proses, klasifikasi_proses, created_by)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, 'draft', $7, $8, $9) RETURNING *`,
      [newTitle, s.l1_id, s.l2_id, s.description, s.bpmn_xml, s.svg_xml,
       (jenis_proses !== undefined ? jenis_proses : s.jenis_proses) || null,
       (klasifikasi_proses !== undefined ? klasifikasi_proses : s.klasifikasi_proses) || null,
       req.user.id]
    );
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`,
      [result.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error('POST bpmn copy:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});


// ==========================================================
// ====== PETA PROSES BISNIS (Level 0–2) — superadmin =======
// Untuk saat ini hanya superadmin yang boleh mengakses (uji coba).
// ==========================================================
const requireSuperadmin = requireRole('superadmin');

app.get('/api/process-map/models', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM process_map_models ORDER BY level ASC, created_at DESC');
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.get('/api/process-map/models/:id', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM process_map_models WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Peta tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.post('/api/process-map/models', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { process_title, level, kode, tahun, parent_id, parent_element_id, kelompok, unit_l1, unit_l2, bpmn_xml, svg_xml, status } = req.body;
    const r = await pool.query(
      `INSERT INTO process_map_models (process_title, level, kode, tahun, parent_id, parent_element_id, kelompok, unit_l1, unit_l2, status, created_by, bpmn_xml, svg_xml)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [process_title, Number.isInteger(level) ? level : 0, kode || null, tahun || null, parent_id || null, parent_element_id || null, kelompok || null,
       unit_l1 || null, unit_l2 || null, status || 'draft', req.user.id, bpmn_xml || null, svg_xml || null]
    );
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.put('/api/process-map/models/:id', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { process_title, level, kode, tahun, parent_id, parent_element_id, kelompok, unit_l1, unit_l2, bpmn_xml, svg_xml, status } = req.body;
    const r = await pool.query(
      `UPDATE process_map_models
       SET process_title=$1, level=COALESCE($2,level), kode=$3, tahun=$4, parent_id=$5, parent_element_id=$6, kelompok=$7,
           unit_l1=$8, unit_l2=$9,
           bpmn_xml=COALESCE($10, bpmn_xml), svg_xml=COALESCE($11, svg_xml),
           status=COALESCE($12,status),
           auto_layout=CASE WHEN $10 IS NOT NULL THEN FALSE ELSE auto_layout END,
           updated_at=NOW(), version=version+1
       WHERE id=$13 RETURNING *`,
      [process_title, Number.isInteger(level) ? level : null, kode || null, tahun || null, parent_id || null, parent_element_id || null, kelompok || null,
       unit_l1 || null, unit_l2 || null, bpmn_xml || null, svg_xml || null, status || null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Peta tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Integrasi antar level: tautan sub-process → peta turunan.
// GET  → cari peta anak untuk elemen tertentu di peta induk.
// POST → upsert peta anak (dibuat bila belum ada, diperbarui bila sudah):
//        properti sub-process (kode, unit pengampu) DISIMPAN pada baris peta anak,
//        sehingga judul peta L1/L2 otomatis = nama sub-process induknya.
app.get('/api/process-map/models/:id/element-link/:elementId', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT * FROM process_map_models WHERE parent_id = $1 AND parent_element_id = $2 LIMIT 1',
      [req.params.id, req.params.elementId]
    );
    res.json(r.rows[0] || null);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.post('/api/process-map/models/:id/element-link', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { element_id, element_name, kode, unit_l1, unit_l2 } = req.body;
    if (!element_id) return res.status(400).json({ error: 'element_id wajib diisi' });
    const parentQ = await pool.query('SELECT * FROM process_map_models WHERE id = $1', [req.params.id]);
    if (parentQ.rows.length === 0) return res.status(404).json({ error: 'Peta induk tidak ditemukan' });
    const parent = parentQ.rows[0];
    if (parent.level >= 2) return res.status(400).json({ error: 'Level 2 tidak memiliki peta turunan (lanjut ke SOP Level 3)' });

    const childLevel = parent.level + 1;
    const title = (element_name && element_name.trim()) || 'Proses Tanpa Nama';
    // L1 turunan L0: unit_l1 = pilihan; L2 turunan L1: unit_l1 ikut induk, unit_l2 = pilihan.
    const childUnitL1 = childLevel === 1 ? (unit_l1 || null) : (parent.unit_l1 || null);
    const childUnitL2 = childLevel === 2 ? (unit_l2 || null) : null;

    const existing = await pool.query(
      'SELECT id FROM process_map_models WHERE parent_id = $1 AND parent_element_id = $2 LIMIT 1',
      [parent.id, element_id]
    );
    let r;
    if (existing.rows.length > 0) {
      r = await pool.query(
        `UPDATE process_map_models
         SET process_title=$1, kode=$2, unit_l1=$3, unit_l2=$4, updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [title, kode || null, childUnitL1, childUnitL2, existing.rows[0].id]
      );
    } else {
      r = await pool.query(
        `INSERT INTO process_map_models (process_title, level, kode, tahun, parent_id, parent_element_id, unit_l1, unit_l2, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING *`,
        [title, childLevel, kode || null, parent.tahun || null, parent.id, element_id, childUnitL1, childUnitL2, req.user.id]
      );
    }
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Daftar seluruh turunan sebuah peta (untuk peringatan sebelum hapus).
app.get('/api/process-map/models/:id/descendants', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      WITH RECURSIVE tree AS (
        SELECT id, level, kode, process_title, parent_id, 0 AS depth
        FROM process_map_models WHERE id = $1
        UNION ALL
        SELECT c.id, c.level, c.kode, c.process_title, c.parent_id, t.depth + 1
        FROM process_map_models c JOIN tree t ON c.parent_id = t.id
      )
      SELECT id, level, kode, process_title FROM tree WHERE depth > 0
      ORDER BY level ASC, kode ASC NULLS LAST, id ASC`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Hapus satu elemen (beserta seluruh isinya yang bersarang) dari string XML BPMN,
// termasuk shape/edge DI-nya, sequence flow yang menyambungkannya, dan referensi
// incoming/outgoing yang menggantung. Pemindaian tag seimbang (bukan regex nested).
function stripElementFromBpmnXml(xml, elementId) {
  if (!xml || !elementId || xml.indexOf(`id="${elementId}"`) === -1) return null;

  const removeBalanced = (src, id) => {
    const idIdx = src.indexOf(`id="${id}"`);
    if (idIdx === -1) return { src, removedIds: [] };
    const start = src.lastIndexOf('<', idIdx);
    const tagM = src.slice(start + 1).match(/^[\w:.-]+/);
    if (!tagM) return { src, removedIds: [] };
    const tag = tagM[0];
    const startTagEnd = src.indexOf('>', idIdx);
    let end;
    if (src[startTagEnd - 1] === '/') {
      end = startTagEnd + 1; // self-closing
    } else {
      let depth = 1, cursor = startTagEnd + 1;
      while (depth > 0) {
        const nextOpen = src.indexOf('<' + tag, cursor);
        const nextClose = src.indexOf('</' + tag + '>', cursor);
        if (nextClose === -1) { end = src.length; break; }
        if (nextOpen !== -1 && nextOpen < nextClose) {
          const b = src[nextOpen + 1 + tag.length];
          if (b === ' ' || b === '>' || b === '\t' || b === '\n' || b === '\r' || b === '/') {
            const gt = src.indexOf('>', nextOpen);
            if (src[gt - 1] !== '/') depth++;
            cursor = gt + 1;
          } else { cursor = nextOpen + 1; }
        } else {
          depth--;
          cursor = nextClose + tag.length + 3;
          if (depth === 0) end = cursor;
        }
      }
    }
    const block = src.slice(start, end);
    const removedIds = [...block.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    return { src: src.slice(0, start) + src.slice(end), removedIds };
  };

  let { src: out, removedIds } = removeBalanced(xml, elementId);
  if (removedIds.length === 0) return null;

  // Sequence flow yang menyambung elemen terhapus (di level yang sama).
  const flowIds = [];
  out = out.replace(/<bpmn:sequenceFlow\b[^>]*?(?:\/>|>[\s\S]*?<\/bpmn:sequenceFlow>)/g, (m) => {
    const touches = removedIds.some(id => m.includes(`sourceRef="${id}"`) || m.includes(`targetRef="${id}"`));
    if (!touches) return m;
    const fid = m.match(/id="([^"]+)"/);
    if (fid) flowIds.push(fid[1]);
    return '';
  });
  const allGone = [...removedIds, ...flowIds];

  // Bersihkan DI (shape & edge), diagram plane drill-down milik sub-process
  // terhapus, dan referensi incoming/outgoing yang menggantung.
  for (const id of allGone) {
    out = out
      .replace(new RegExp(`<bpmndi:BPMNShape\\b[^>]*bpmnElement="${id}"[^>]*(?:/>|>[\\s\\S]*?</bpmndi:BPMNShape>)\\s*`, 'g'), '')
      .replace(new RegExp(`<bpmndi:BPMNEdge\\b[^>]*bpmnElement="${id}"[^>]*(?:/>|>[\\s\\S]*?</bpmndi:BPMNEdge>)\\s*`, 'g'), '')
      .replace(new RegExp(`<bpmndi:BPMNDiagram\\b[^>]*>\\s*<bpmndi:BPMNPlane\\b[^>]*bpmnElement="${id}"[^>]*(?:/>|>[\\s\\S]*?</bpmndi:BPMNPlane>)\\s*</bpmndi:BPMNDiagram>\\s*`, 'g'), '');
  }
  for (const fid of flowIds) {
    out = out
      .replace(new RegExp(`<bpmn:incoming>\\s*${fid}\\s*</bpmn:incoming>\\s*`, 'g'), '')
      .replace(new RegExp(`<bpmn:outgoing>\\s*${fid}\\s*</bpmn:outgoing>\\s*`, 'g'), '');
  }
  return out;
}

// Tambahkan elemen sub-process yang belum ada ke XML kanvas yang SUDAH diedit
// manual (merge-append) — diletakkan di kanan shape terjauh agar tidak menimpa.
function appendElementsToBpmnXml(xml, items) {
  if (!xml || !items || items.length === 0) return null;
  let maxX = 100;
  for (const m of xml.matchAll(/<dc:Bounds x="(-?[0-9.]+)"[^>]*width="([0-9.]+)"/g)) {
    const right = parseFloat(m[1]) + parseFloat(m[2]);
    if (right > maxX) maxX = right;
  }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const shapes = items.map(n => `<bpmn:subProcess id="${esc(n.element_id)}" name="${esc(n.name)}" />`).join('\n    ');
  const di = items.map((n, i) =>
    `<bpmndi:BPMNShape id="${esc(n.element_id)}_di" bpmnElement="${esc(n.element_id)}" isExpanded="true"><dc:Bounds x="${Math.round(maxX + 60 + i * 300)}" y="140" width="240" height="150" /></bpmndi:BPMNShape>`
  ).join('\n      ');
  let out = xml;
  if (/<bpmn:process\b[^>]*\/>/.test(out)) {
    out = out.replace(/<bpmn:process\b([^>]*?)\/>/, `<bpmn:process$1>\n    ${shapes}\n  </bpmn:process>`);
  } else if (out.includes('</bpmn:process>')) {
    out = out.replace('</bpmn:process>', `  ${shapes}\n  </bpmn:process>`);
  } else return null;
  if (/<bpmndi:BPMNPlane\b[^>]*\/>/.test(out)) {
    out = out.replace(/<bpmndi:BPMNPlane\b([^>]*?)\/>/, `<bpmndi:BPMNPlane$1>\n      ${di}\n    </bpmndi:BPMNPlane>`);
  } else if (out.includes('</bpmndi:BPMNPlane>')) {
    out = out.replace('</bpmndi:BPMNPlane>', `  ${di}\n    </bpmndi:BPMNPlane>`);
  } else return null;
  return out;
}

// Sisipkan sub-process COLLAPSED bersarang ke dalam blok elemen induk pada XML
// (dipakai untuk menggambar otomatis proses L3 di dalam kotak kegiatannya).
function injectNestedElementIntoBpmnXml(xml, parentElementId, elementId, name, index) {
  if (!xml || xml.indexOf(`id="${parentElementId}"`) === -1) return null;
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const childTag = `<bpmn:subProcess id="${esc(elementId)}" name="${esc(name)}" />`;
  let out = xml;
  // Sisipkan elemen semantik ke dalam induk (buka tag self-closing bila perlu).
  const selfClose = new RegExp(`<bpmn:subProcess([^>]*id="${parentElementId}"[^>]*?)/>`);
  const openTag = new RegExp(`(<bpmn:subProcess[^>]*id="${parentElementId}"[^>]*[^/]>)`);
  if (selfClose.test(out)) {
    out = out.replace(selfClose, `<bpmn:subProcess$1>\n      ${childTag}\n    </bpmn:subProcess>`);
  } else if (openTag.test(out)) {
    out = out.replace(openTag, `$1\n      ${childTag}`);
  } else return null;
  // DI: letakkan di dalam bounds induk, berjajar.
  const bounds = out.match(new RegExp(`bpmnElement="${parentElementId}"[^>]*>\\s*<dc:Bounds x="(-?[0-9.]+)" y="(-?[0-9.]+)"`));
  const px = bounds ? parseFloat(bounds[1]) : 100;
  const py = bounds ? parseFloat(bounds[2]) : 100;
  const di = `<bpmndi:BPMNShape id="${esc(elementId)}_di" bpmnElement="${esc(elementId)}" isExpanded="false"><dc:Bounds x="${Math.round(px + 20 + index * 120)}" y="${Math.round(py + 45)}" width="100" height="80" /></bpmndi:BPMNShape>`;
  if (out.includes('</bpmndi:BPMNPlane>')) {
    out = out.replace('</bpmndi:BPMNPlane>', `  ${di}\n    </bpmndi:BPMNPlane>`);
  } else return null;
  return out;
}

// Buat baris USULAN BPMN (Daftar Proses L3) milik sebuah kegiatan — dipakai oleh
// endpoint tambah-proses DAN sinkronisasi kanvas L2 (kotak bersarang → usulan).
async function createL3Usulan(keg, title, elementId, userId) {
  let l1Id = null, l2Id = null;
  if (keg.unit_l1) {
    const r1 = await pool.query('SELECT id FROM unit_kerja_l1 WHERE nama ILIKE $1 LIMIT 1', [String(keg.unit_l1).trim()]);
    if (r1.rows[0]) {
      l1Id = r1.rows[0].id;
      if (keg.unit_l2) {
        const r2 = await pool.query('SELECT id FROM unit_kerja_l2 WHERE nama ILIKE $1 AND l1_id = $2 LIMIT 1', [String(keg.unit_l2).trim(), l1Id]);
        if (r2.rows[0]) l2Id = r2.rows[0].id;
      }
    }
  }
  let probisKode = null;
  if (keg.kode) {
    const ex = await pool.query('SELECT probis_kode FROM bpmn_models WHERE peta_kegiatan_id = $1', [keg.id]);
    let mx = 0;
    for (const k of ex.rows) {
      if (k.probis_kode && k.probis_kode.startsWith(keg.kode + '.')) {
        const sfx = parseInt(k.probis_kode.slice(keg.kode.length + 1), 10);
        if (!isNaN(sfx) && sfx > mx) mx = sfx;
      }
    }
    probisKode = `${keg.kode}.${String(mx + 1).padStart(2, '0')}`;
  }
  const ins = await pool.query(
    `INSERT INTO bpmn_models (process_title, l1_id, l2_id, status, created_by, peta_kegiatan_id, probis_kode, probis_element_id, jenis_proses)
     VALUES ($1,$2,$3,'usulan',$4,$5,$6,$7,'Peta Lintas Fungsi') RETURNING *`,
    [String(title).trim(), l1Id, l2Id, userId, keg.id, probisKode, elementId || null]
  );
  return ins.rows[0];
}

// Hapus peta + seluruh turunannya (rekursif). Mengembalikan id yang terhapus.
async function cascadeDeleteProcessMap(id) {
  const r = await pool.query(`
    WITH RECURSIVE tree AS (
      SELECT id FROM process_map_models WHERE id = $1
      UNION ALL
      SELECT c.id FROM process_map_models c JOIN tree t ON c.parent_id = t.id
    )
    DELETE FROM process_map_models WHERE id IN (SELECT id FROM tree) RETURNING id`, [id]);
  const ids = r.rows.map(x => x.id);
  // Usulan BPMN milik kegiatan yang terhapus ikut terhapus — hanya yang masih
  // berstatus 'usulan'; dokumen yang sudah dalam penyusunan dibiarkan.
  if (ids.length > 0) {
    await pool.query("DELETE FROM bpmn_models WHERE peta_kegiatan_id = ANY($1) AND status = 'usulan'", [ids]);
  }
  return ids;
}

// Ganti NAMA sebuah elemen sub-process di XML (atribut name). Mengembalikan
// XML baru, atau null bila elemen tidak ada / nama sudah sama.
function renameElementInBpmnXml(xml, elementId, newName) {
  if (!xml || !elementId) return null;
  const m = xml.match(new RegExp(`<bpmn:subProcess id="${elementId}"(?: name="([^"]*)")?`));
  if (!m) return null;
  const esc = String(newName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if ((m[1] || '') === esc) return null; // sudah sama
  return xml.replace(
    new RegExp(`(<bpmn:subProcess id="${elementId}")(?: name="[^"]*")?`),
    `$1 name="${esc}"`
  );
}

// Rambatkan nama elemen ke kanvas induk & leluhur yang memuat id yang sama
// (salinan bersarang lintas level selalu memakai id elemen yang sama).
async function renameElementInAncestors(startParentId, elementId, newName) {
  let pid = startParentId;
  while (pid && elementId) {
    const pQ = await pool.query('SELECT id, parent_id, bpmn_xml FROM process_map_models WHERE id = $1', [pid]);
    if (pQ.rows.length === 0) break;
    const p = pQ.rows[0];
    const renamed = renameElementInBpmnXml(p.bpmn_xml, elementId, newName);
    if (renamed !== null) {
      await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW() WHERE id = $2', [renamed, p.id]);
    }
    pid = p.parent_id;
  }
}

// Hapus kotak elemen dari kanvas induk & seluruh leluhurnya (id elemen dipakai
// ulang lintas level). Mengembalikan id peta yang kanvasnya dibersihkan.
async function stripElementFromAncestors(startParentId, elementId) {
  const cleaned = [];
  let pid = startParentId;
  while (pid && elementId) {
    const pQ = await pool.query('SELECT id, parent_id, bpmn_xml FROM process_map_models WHERE id = $1', [pid]);
    if (pQ.rows.length === 0) break;
    const p = pQ.rows[0];
    const stripped = stripElementFromBpmnXml(p.bpmn_xml, elementId);
    if (stripped !== null) {
      await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW(), version = version + 1 WHERE id = $2', [stripped, p.id]);
      cleaned.push(p.id);
    }
    pid = p.parent_id;
  }
  return cleaned;
}

// Hapus BERANTAI dua arah:
//  • ke bawah — peta beserta seluruh peta turunannya (L0 → L1 → L2) ikut terhapus;
//  • ke atas — kotak sub-process yang mewakili peta ini DIHAPUS dari kanvas peta
//    induknya, dan (karena id elemen dipakai ulang lintas level) juga dari salinan
//    bersarangnya di kanvas leluhur (mis. hapus L2 → kotak di L1 hilang + kotak
//    bersarang di dalam kotak L1 pada kanvas L0 ikut hilang).
app.delete('/api/process-map/models/:id', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const targetQ = await pool.query('SELECT parent_id, parent_element_id FROM process_map_models WHERE id = $1', [req.params.id]);
    if (targetQ.rows.length === 0) return res.status(404).json({ error: 'Peta tidak ditemukan' });
    const { parent_id, parent_element_id } = targetQ.rows[0];

    const deleted = await cascadeDeleteProcessMap(req.params.id);
    const cleanedMaps = (parent_id && parent_element_id)
      ? await stripElementFromAncestors(parent_id, parent_element_id)
      : [];

    res.json({ success: true, deleted, cleaned_maps: cleanedMaps });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// ── Sinkronisasi berjenjang otomatis (dipanggil studio setiap "Simpan Alur") ──
// Klien mengirim struktur kanvas: children = sub-process level-atas, masing-
// masing dengan nested = sub-process yang digambar DI DALAM kotaknya.
//
// Peta L0: kotak level-atas yang sudah ber-properti (punya peta L1 tertaut) →
//   • judul peta L1 mengikuti nama kotak;
//   • tiap sub-process bersarang otomatis menjadi peta L2 dengan NOMOR OTOMATIS
//     turunan kode L1 (01.03 → 01.03.01, 01.03.02, … urut posisi kiri→kanan);
//   • kanvas peta L1 di-generate otomatis berisi kotak-kotak sub-process itu —
//     hanya bila belum pernah diedit manual (auto_layout ≠ FALSE).
// Peta L1: kotak level-atas tanpa tautan → otomatis dibuat peta L2 bernomor
//   turunan kode peta; yang sudah tertaut → judul disinkronkan.
app.post('/api/process-map/models/:id/sync-children', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { children } = req.body;
    if (!Array.isArray(children)) return res.status(400).json({ error: 'children wajib berupa array' });
    const mapQ = await pool.query('SELECT * FROM process_map_models WHERE id = $1', [req.params.id]);
    if (mapQ.rows.length === 0) return res.status(404).json({ error: 'Peta tidak ditemukan' });
    const map = mapQ.rows[0];
    if (map.level >= 3) return res.json({ created: [], updated: [], removed: [] });

    const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pad2 = (n) => String(n).padStart(2, '0');
    const created = [], updated = [];

    // Nomor berikutnya untuk anak baru: max suffix numerik yang ada + 1
    // (kode anak lama TIDAK diubah agar penomoran stabil).
    const nextSuffix = async (parentMapId, parentKode) => {
      const kids = await pool.query('SELECT kode FROM process_map_models WHERE parent_id = $1', [parentMapId]);
      let mx = 0;
      for (const k of kids.rows) {
        if (k.kode && parentKode && k.kode.startsWith(parentKode + '.')) {
          const sfx = parseInt(k.kode.slice(parentKode.length + 1), 10);
          if (!isNaN(sfx) && sfx > mx) mx = sfx;
        }
      }
      return mx + 1;
    };

    const upsertChild = async (parentMap, el) => {
      const ex = await pool.query(
        'SELECT * FROM process_map_models WHERE parent_id = $1 AND parent_element_id = $2 LIMIT 1',
        [parentMap.id, el.element_id]
      );
      if (ex.rows.length > 0) {
        if (el.name && el.name !== ex.rows[0].process_title) {
          await pool.query('UPDATE process_map_models SET process_title = $1, updated_at = NOW() WHERE id = $2', [el.name, ex.rows[0].id]);
          updated.push(ex.rows[0].id);
        }
        return { ...ex.rows[0], process_title: el.name || ex.rows[0].process_title };
      }
      const kodeAuto = parentMap.kode ? `${parentMap.kode}.${pad2(await nextSuffix(parentMap.id, parentMap.kode))}` : null;
      const ins = await pool.query(
        `INSERT INTO process_map_models (process_title, level, kode, tahun, parent_id, parent_element_id, unit_l1, unit_l2, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING *`,
        [el.name || 'Proses Tanpa Nama', parentMap.level + 1, kodeAuto, parentMap.tahun || null,
         parentMap.id, el.element_id, parentMap.unit_l1 || null, parentMap.unit_l2 || null, req.user.id]
      );
      created.push(ins.rows[0].id);
      return ins.rows[0];
    };

    // Kanvas L1 hasil generate: satu baris kotak sub-process, id elemen SAMA
    // dengan id bersarang di L0 → tautan L2 langsung berlaku di studio L1.
    const genRowXml = (mapId, items) => {
      const shapes = items.map(n => `<bpmn:subProcess id="${escXml(n.element_id)}" name="${escXml(n.name)}" />`).join('\n    ');
      const di = items.map((n, i) =>
        `<bpmndi:BPMNShape id="${escXml(n.element_id)}_di" bpmnElement="${escXml(n.element_id)}" isExpanded="true"><dc:Bounds x="${160 + i * 300}" y="140" width="240" height="150" /></bpmndi:BPMNShape>`
      ).join('\n      ');
      return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Def_PM${mapId}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_PM${mapId}" isExecutable="false">
    ${shapes}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diag_PM${mapId}">
    <bpmndi:BPMNPlane id="Plane_PM${mapId}" bpmnElement="Process_PM${mapId}">
      ${di}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    };

    const sortByX = (a, b) => (a.x || 0) - (b.x || 0);

    const removed = [];
    const tops = children.filter(c => c && c.element_id).sort(sortByX);
    const topIds = tops.map(t => t.element_id);
    // XML kanvas peta ini bisa dimutasi oleh backfill kotak L3 (lihat di bawah).
    let mapXml = map.bpmn_xml;
    let mapXmlDirty = false;

    // REKONSILIASI level-atas: kotak yang sudah DIHAPUS dari kanvas ini →
    // turunannya terhapus (berantai) + salinan bersarang di leluhur dibersihkan.
    const childRows = await pool.query(
      'SELECT id, parent_element_id FROM process_map_models WHERE parent_id = $1 AND parent_element_id IS NOT NULL',
      [map.id]
    );
    for (const c of childRows.rows) {
      if (!topIds.includes(c.parent_element_id)) {
        removed.push(...await cascadeDeleteProcessMap(c.id));
        if (map.parent_id) await stripElementFromAncestors(map.parent_id, c.parent_element_id);
      }
    }

    for (const top of tops) {
      // Peta anak untuk kotak level-atas ini.
      // L0: hanya kotak ber-properti (punya tautan) — properti diisi manual dulu.
      // L1/L2: otomatis dibuat (L2 map / kegiatan) dengan nomor otomatis.
      const linkQ = await pool.query(
        'SELECT * FROM process_map_models WHERE parent_id = $1 AND parent_element_id = $2 LIMIT 1',
        [map.id, top.element_id]
      );
      let child = linkQ.rows[0] || null;
      const isNewChild = !child;
      if (!child) {
        if (map.level === 0) continue; // belum ber-properti → lewati
        child = await upsertChild(map, top);
      } else if (top.name && top.name !== child.process_title) {
        await pool.query('UPDATE process_map_models SET process_title = $1, updated_at = NOW() WHERE id = $2', [top.name, child.id]);
        updated.push(child.id);
        // Rambatkan nama baru ke salinan bersarang di kanvas leluhur (id sama).
        await renameElementInAncestors(map.parent_id, top.element_id, top.name);
      }

      if (child.level >= 3) {
        // KEGIATAN (kotak di kanvas L2). Dua arah dgn Daftar Proses L3:
        // • kotak BERSARANG di dalamnya → otomatis jadi usulan L3 bernomor;
        // • entri daftar TANPA kotak (mis. diinput sebelum fitur tautan) →
        //   kotaknya digambar otomatis (collapsed) di dalam kotak kegiatan.
        // TIDAK ada seed otomatis: daftar = persis isi kotak.
        const nestedProc = (top.nested || []).filter(n => n && n.element_id).sort(sortByX);
        for (const n of nestedProc) {
          const exQ = await pool.query(
            'SELECT id, process_title FROM bpmn_models WHERE peta_kegiatan_id = $1 AND probis_element_id = $2 LIMIT 1',
            [child.id, n.element_id]
          );
          if (exQ.rows.length === 0) {
            await createL3Usulan(child, n.name || 'Proses Tanpa Nama', n.element_id, req.user.id);
          } else if (n.name && n.name !== exQ.rows[0].process_title) {
            await pool.query('UPDATE bpmn_models SET process_title = $1, updated_at = NOW() WHERE id = $2', [n.name, exQ.rows[0].id]);
          }
        }
        // REKONSILIASI: kotak L3 yang sudah DIHAPUS dari kanvas → usulannya
        // ikut terhapus (hanya status 'usulan'; dokumen dalam penyusunan aman).
        const nestedIds3 = nestedProc.map(n => n.element_id);
        const linked = await pool.query(
          `SELECT id, status, probis_element_id FROM bpmn_models
           WHERE peta_kegiatan_id = $1 AND probis_element_id IS NOT NULL AND probis_element_id <> ''`, [child.id]);
        for (const u of linked.rows) {
          if (nestedIds3.includes(u.probis_element_id)) continue;
          if (u.status === 'usulan') {
            await pool.query('DELETE FROM bpmn_models WHERE id = $1', [u.id]);
          }
          // status lain: biarkan dokumennya (tautan elemen menggantung, tak apa).
        }

        // Backfill: entri daftar yang belum punya kotak → suntikkan kotak collapsed.
        const unlinked = await pool.query(
          `SELECT id, process_title FROM bpmn_models
           WHERE peta_kegiatan_id = $1 AND (probis_element_id IS NULL OR probis_element_id = '')
           ORDER BY probis_kode ASC NULLS LAST, id ASC`, [child.id]);
        let injectIdx = nestedProc.length;
        for (const u of unlinked.rows) {
          const elId = `Activity_pm${u.id}`;
          const injected = injectNestedElementIntoBpmnXml(mapXml, top.element_id, elId, u.process_title, injectIdx);
          if (injected) {
            mapXml = injected;
            mapXmlDirty = true;
            injectIdx++;
            await pool.query('UPDATE bpmn_models SET probis_element_id = $1, updated_at = NOW() WHERE id = $2', [elId, u.id]);
          }
        }
        continue; // kegiatan: tanpa kanvas/turunan peta
      }

      // Kotak BERSARANG di dalam kotak ini → turunan peta anak (cucu):
      // L0: nested → peta L2; L1: nested → KEGIATAN level-3. Kanvas peta anak
      // di-generate (bila auto) atau DITAMBAHKAN yang kurang (bila manual).
      const nested = (top.nested || []).filter(n => n && n.element_id).sort(sortByX);
      const nestedIds = nested.map(n => n.element_id);
      for (const n of nested) await upsertChild(child, n);

      if (nested.length > 0) {
        const fresh = (await pool.query('SELECT bpmn_xml, auto_layout FROM process_map_models WHERE id = $1', [child.id])).rows[0];
        const canRegen = fresh.auto_layout === true || (fresh.auto_layout == null && !fresh.bpmn_xml);
        if (canRegen) {
          await pool.query(
            'UPDATE process_map_models SET bpmn_xml = $1, auto_layout = TRUE, updated_at = NOW() WHERE id = $2',
            [genRowXml(child.id, nested), child.id]
          );
        } else if (fresh.bpmn_xml) {
          // Kanvas anak sudah diedit manual → merge: tambahkan kotak yang belum
          // ada + SELARASKAN NAMA elemen ber-id sama (rename di kanvas induk
          // harus ikut terlihat di kanvas anak).
          let cxml = fresh.bpmn_xml;
          let cDirty = false;
          for (const n of nested) {
            const rn = renameElementInBpmnXml(cxml, n.element_id, n.name);
            if (rn !== null) { cxml = rn; cDirty = true; }
          }
          const missing = nested.filter(n => !cxml.includes(`id="${n.element_id}"`));
          if (missing.length > 0) {
            const merged = appendElementsToBpmnXml(cxml, missing);
            if (merged) { cxml = merged; cDirty = true; }
          }
          if (cDirty) await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW() WHERE id = $2', [cxml, child.id]);
        }
      }

      // REKONSILIASI cucu: hilang dari kotak ini → turunannya terhapus + kotak
      // dibersihkan dari kanvas anak. Pengecualian: elemen yang digambar manual
      // langsung di kanvas anak (auto_layout=false) dibiarkan.
      const cur = (await pool.query('SELECT bpmn_xml, auto_layout FROM process_map_models WHERE id = $1', [child.id])).rows[0];
      let childXml = cur.bpmn_xml;
      const grandkids = await pool.query(
        'SELECT id, parent_element_id FROM process_map_models WHERE parent_id = $1 AND parent_element_id IS NOT NULL',
        [child.id]
      );
      for (const g of grandkids.rows) {
        if (nestedIds.includes(g.parent_element_id)) continue;
        const inChildCanvas = childXml && childXml.includes(`id="${g.parent_element_id}"`);
        if (inChildCanvas && cur.auto_layout === false) continue; // milik kanvas anak manual
        removed.push(...await cascadeDeleteProcessMap(g.id));
        if (inChildCanvas) {
          const stripped = stripElementFromBpmnXml(childXml, g.parent_element_id);
          if (stripped !== null) {
            childXml = stripped;
            await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW() WHERE id = $2', [stripped, child.id]);
          }
        }
      }
    }

    // Simpan mutasi backfill kotak L3 ke kanvas peta ini (tanpa mengubah auto_layout).
    if (mapXmlDirty) {
      await pool.query('UPDATE process_map_models SET bpmn_xml = $1, updated_at = NOW() WHERE id = $2', [mapXml, map.id]);
    }

    res.json({ created, updated, removed, canvas_updated: mapXmlDirty });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// ====== EXPORT PDF VEKTOR (F4 330x215mm) via headless Chrome ======
// Semaphore: batasi max 2 render Puppeteer berjalan bersamaan agar RAM tidak habis.
const _pdfSemaphore = (() => {
  let running = 0;
  const MAX = 2;
  const queue = [];
  return {
    acquire: () => new Promise((resolve) => {
      if (running < MAX) { running++; resolve(); }
      else queue.push(resolve);
    }),
    release: () => {
      running--;
      if (queue.length) { running++; queue.shift()(); }
    }
  };
})();

// Batas laju PDF: dulu max 5/menit per IP → SEMUA pengguna lewat nginx tampak dari
// 127.0.0.1 sehingga berbagi satu kuota global (mudah kena "Terlalu banyak").
// Sekarang kunci PER-PENGGUNA (req.user.id) — WAJIB dipasang SETELAH authenticate —
// dengan kuota lebih longgar (satu unduhan BPMN = 1 permintaan, walau multi-halaman).
const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req.user && req.user.id ? `u${req.user.id}` : (req.ip || 'anon')),
  message: { error: 'Terlalu banyak permintaan PDF. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});


// ── Unduh PDF Peta Proses Bisnis (L0/L1/L2) — F4 (330×215mm) landscape, vektor ──
// Halaman 1: diagram (SVG tersimpan) + kepala dokumen. Khusus L2: halaman 2 =
// PETA RELASI formal (kolom per kegiatan berisi lembaga internal & eksternal).
app.get('/api/process-map/models/:id/pdf', authenticate, requireSuperadmin, pdfLimiter, async (req, res) => {
  let browser;
  let semaphoreAcquired = false;
  try {
    const q = await pool.query('SELECT * FROM process_map_models WHERE id = $1', [req.params.id]);
    if (q.rows.length === 0) return res.status(404).json({ error: 'Peta tidak ditemukan' });
    const m = q.rows[0];
    if (!m.svg_xml) return res.status(400).json({ error: 'Diagram belum tersimpan — buka peta lalu tekan Simpan Alur terlebih dahulu.' });

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const levelLabel = ['PETA PROSES BISNIS — LEVEL 0', 'PETA PROSES — LEVEL 1', 'PETA SUBPROSES — LEVEL 2'][m.level] || 'PETA PROSES BISNIS';
    const unitLine = [m.unit_l1, m.unit_l2].filter(Boolean).join(' › ');

    // SVG bpmn-js punya width/height + viewBox → paksa 100% agar pas-halaman
    // dengan rasio terjaga (preserveAspectRatio bawaan: xMidYMid meet).
    const svg = String(m.svg_xml)
      .replace(/(<svg[^>]*?)\swidth="[^"]*"/, '$1')
      .replace(/(<svg[^>]*?)\sheight="[^"]*"/, '$1')
      .replace(/<svg/, '<svg width="100%" height="100%"');

    // Halaman 2 (L2): PETA RELASI formal.
    let relasiPage = '';
    if (m.level === 2) {
      const kegs = await pool.query(
        'SELECT * FROM process_map_models WHERE parent_id = $1 AND level >= 3 ORDER BY kode ASC NULLS LAST, id ASC', [m.id]);
      if (kegs.rows.length > 0) {
        const cols = kegs.rows.map(k => {
          let ri = [], re = [];
          try { ri = JSON.parse(k.relasi_internal || '[]'); } catch (e) { /* abaikan */ }
          try { re = JSON.parse(k.relasi_eksternal || '[]'); } catch (e) { /* abaikan */ }
          const boxes = [...ri, ...re];
          const cells = boxes.length === 0
            ? '<p class="empty">belum diisi</p>'
            : `<div class="cells">${boxes.map(b => `<div class="cell">${esc(b)}</div>`).join('')}</div>`;
          return `<div class="kcol"><div class="khead"><b>ATR/BPN ${esc(k.kode || '')}</b><br/>${esc(k.process_title)}</div>${cells}</div>`;
        }).join('');
        relasiPage = `
      <div class="page"><div class="frame">
        <div class="head"><h1>PETA RELASI</h1><p>ATR/BPN ${esc(m.kode || '')}</p><p class="upper">${esc(m.process_title)}</p></div>
        <div class="relasi" style="grid-template-columns: repeat(${Math.min(kegs.rows.length, 3)}, 1fr);">${cols}</div>
      </div></div>`;
      }
    }

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: 330mm 215mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'URW Bookman', 'Bookman Old Style', Bookman, Georgia, serif; color: #000; }
      .page { width: 330mm; height: 215mm; padding: 9mm; page-break-after: always; display: flex; flex-direction: column; }
      .page:last-child { page-break-after: auto; }
      .frame { border: 2px solid #000; flex: 1; display: flex; flex-direction: column; min-height: 0; }
      .head { border-bottom: 2px solid #000; text-align: center; padding: 3.5mm 4mm; }
      .head h1 { font-size: 13pt; letter-spacing: .6px; }
      .head p { font-size: 11.5pt; font-weight: bold; }
      .head p.upper { text-transform: uppercase; }
      .head p.sub { font-size: 9pt; font-weight: normal; font-style: italic; }
      .diagram { flex: 1; min-height: 0; padding: 5mm; display: flex; align-items: center; justify-content: center; }
      .relasi { flex: 1; min-height: 0; display: grid; gap: 5mm; padding: 5mm; align-content: start; }
      .kcol { border: 1.5px solid #000; display: flex; flex-direction: column; }
      .khead { border-bottom: 1.5px solid #000; text-align: center; padding: 2.5mm 2mm; font-size: 9.5pt; line-height: 1.35; }
      .cells { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; padding: 3mm; }
      .cell { border: 1.2px solid #000; min-height: 11mm; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 8pt; line-height: 1.25; padding: 1.5mm; }
      .empty { padding: 8mm 2mm; text-align: center; font-size: 8.5pt; font-style: italic; color: #777; }
    </style></head><body>
      <div class="page"><div class="frame">
        <div class="head"><h1>${esc(levelLabel)}</h1><p>${esc(m.kode || '')} ${m.kode ? '·' : ''} ${esc(m.process_title)}</p>${unitLine ? `<p class="sub">${esc(unitLine)}${m.tahun ? ' · Tahun ' + esc(m.tahun) : ''}</p>` : (m.tahun ? `<p class="sub">Tahun ${esc(m.tahun)}</p>` : '')}</div>
        <div class="diagram">${svg}</div>
      </div></div>${relasiPage}
    </body></html>`;

    await _pdfSemaphore.acquire();
    semaphoreAcquired = true;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const judul = String(m.process_title || 'Peta Proses Bisnis')
      .replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    const fname = `Peta Proses Bisnis L${m.level} - ${judul}`;
    await page.evaluate((t) => { document.title = t; }, fname);

    const pdf = await page.pdf({
      width: '330mm', height: '215mm', printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    // filename= wajib ASCII (karakter non-latin membuat setHeader melempar ERR_INVALID_CHAR);
    // nama asli (UTF-8) lewat filename*.
    res.setHeader('Content-Disposition', `attachment; filename="${fname.replace(/[^\x20-\x7E]/g, '_')}.pdf"; filename*=UTF-8''${encodeURIComponent(fname + '.pdf')}`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Gagal membuat PDF' });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* abaikan */ } }
    if (semaphoreAcquired) _pdfSemaphore.release();
  }
});

// PDF VEKTOR untuk BPMN studio — teks tetap BISA DISELEKSI karena dirender
// Chrome headless langsung dari SVG (bukan raster PNG seperti sebelumnya).
// Stateless: klien mengirim SVG halaman utama + sub-proses tercentang + metadata.
app.post('/api/bpmn/pdf', authenticate, pdfLimiter, async (req, res) => {
  let browser;
  let semaphoreAcquired = false;
  try {
    const { title, unit1, unit2, filename, pages } = req.body;
    if (!Array.isArray(pages) || pages.length === 0 || !pages[0] || !pages[0].svg) {
      return res.status(400).json({ error: 'Tidak ada diagram untuk diekspor' });
    }
    if (pages.length > 40) return res.status(400).json({ error: 'Terlalu banyak halaman' });
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Orientasi F4 (215×330) ditentukan PER HALAMAN dari viewBox diagramnya —
    // pilih yang memberi skala pas-halaman terbesar (melebar → landscape,
    // memanjang → portrait). Dulu dihitung sekali dari halaman utama sehingga
    // halaman sub-proses ikut orientasi halaman pertama walau bentuknya beda.
    const MARGIN = 14, HEADER_EST = 42;
    const isPortrait = (svg) => {
      const vb = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)"/.exec(String(svg || ''));
      const dw = vb ? parseFloat(vb[1]) || 1 : 1;
      const dh = vb ? parseFloat(vb[2]) || 1 : 1;
      const fit = (pw, ph) => Math.min((pw - MARGIN * 2) / dw, (ph - HEADER_EST - 14) / dh);
      return fit(215, 330) >= fit(330, 215);
    };

    // Buang atribut width/height agar SVG mengikuti kotak CSS (viewBox tetap →
    // preserveAspectRatio "meet" menjaga rasio; diagram menempel di atas header).
    const prepSvg = (svg) => String(svg)
      .replace(/(<svg[^>]*?)\swidth="[^"]*"/, '$1')
      .replace(/(<svg[^>]*?)\sheight="[^"]*"/, '$1');

    const total = pages.length;
    const pagesHtml = pages.map((p, i) => `
      <div class="page ${isPortrait(p.svg) ? 'pt' : 'ls'}">
        <div class="head">
          <div class="label">${esc(p.label || 'PROSES BISNIS')}</div>
          <div class="judul">${esc(p.judul || title || '')}</div>
          ${unit1 ? `<div class="unit">${esc(unit1)}</div>` : ''}
          ${unit2 ? `<div class="unit">${esc(unit2)}</div>` : ''}
        </div>
        <div class="sep"></div>
        <div class="diagram">${prepSvg(p.svg)}</div>
        <div class="foot"><span>Sistem Informasi Manajemen Prosedur dan Pelayanan (SIMPEL) ATR/BPN</span><span>Halaman ${i + 1} dari ${total}</span></div>
      </div>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      /* Named pages: tiap halaman memilih ukuran F4 potret/lanskap sendiri. */
      @page { size: 215mm 330mm; margin: 0; }
      @page f4pt { size: 215mm 330mm; margin: 0; }
      @page f4ls { size: 330mm 215mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'URW Bookman', 'Bookman Old Style', Bookman, Georgia, serif; color: #000; }
      .page { padding: 12mm 14mm 8mm; display: flex; flex-direction: column; page-break-after: always; }
      .page.pt { page: f4pt; width: 215mm; height: 330mm; }
      .page.ls { page: f4ls; width: 330mm; height: 215mm; }
      .page:last-child { page-break-after: auto; }
      .head { text-align: center; }
      /* Header hitam semua (permintaan user) — bukan abu/navy. */
      .label { font-size: 9pt; font-weight: bold; letter-spacing: 1.4px; color: #000; }
      .judul { font-size: 16pt; font-weight: bold; color: #000; margin-top: 2mm; line-height: 1.2; }
      .unit { font-size: 10.5pt; color: #000; margin-top: 1.5mm; }
      .sep { border-bottom: .3mm solid #cbd5e1; margin-top: 3.5mm; }
      .diagram { flex: 1; min-height: 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 5mm; }
      .diagram svg { width: 100%; height: auto; max-width: 100%; max-height: 100%; }
      .foot { display: flex; justify-content: space-between; font-size: 8pt; color: #94a3b8; padding-top: 3mm; }
    </style></head><body>${pagesHtml}</body></html>`;

    await _pdfSemaphore.acquire();
    semaphoreAcquired = true;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const safe = String(filename || title || 'BPMN')
      .replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
    await page.evaluate((t) => { document.title = t; }, safe);
    const pdf = await page.pdf({
      preferCSSPageSize: true, printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safe.replace(/[^\x20-\x7E]/g, '_')}.pdf"; filename*=UTF-8''${encodeURIComponent(safe + '.pdf')}`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Gagal membuat PDF' });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* abaikan */ } }
    if (semaphoreAcquired) _pdfSemaphore.release();
  }
});

// ── Kegiatan (baris level-3 = sub-process pada kanvas L2) ──
// Peta Relasi: daftar lembaga internal & eksternal per kegiatan.
app.patch('/api/process-map/models/:id/relasi', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { internal, eksternal } = req.body;
    const clean = (v) => JSON.stringify(Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean) : []);
    const r = await pool.query(
      'UPDATE process_map_models SET relasi_internal = $1, relasi_eksternal = $2, updated_at = NOW() WHERE id = $3 RETURNING id, relasi_internal, relasi_eksternal',
      [clean(internal), clean(eksternal), req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Daftar Proses L3 milik sebuah kegiatan — deretan usulan di modul BPMN.
app.get('/api/process-map/models/:id/l3-processes', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT m.id, m.process_title, m.probis_kode, m.probis_element_id, m.status, u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.peta_kegiatan_id = $1
       ORDER BY m.probis_kode ASC NULLS LAST, m.id ASC`, [req.params.id]);
    res.json(r.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// Tambah proses L3 → langsung menjadi USULAN di menu Buat Proses Bisnis (BPMN),
// dengan unit kerja mengikuti kegiatan (turunan L1/L2 peta) dan nomor otomatis.
app.post('/api/process-map/models/:id/l3-processes', authenticate, requireSuperadmin, async (req, res) => {
  try {
    const { process_title, element_id } = req.body;
    if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Nama proses wajib diisi' });
    const kegQ = await pool.query('SELECT * FROM process_map_models WHERE id = $1', [req.params.id]);
    if (kegQ.rows.length === 0) return res.status(404).json({ error: 'Kegiatan tidak ditemukan' });
    const ins = await createL3Usulan(kegQ.rows[0], process_title, element_id || null, req.user.id);
    const full = await pool.query(
      `SELECT m.id, m.process_title, m.probis_kode, m.probis_element_id, m.status, u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`, [ins.id]);
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});


// ==========================================================
// ====== DOKUMEN MANUAL (transisi Visual Paradigm/Visio) ====
// Dokumen jadi (PDF unggahan ≤7MB atau tautan eksternal) masuk langsung ke
// daftar terbit modul BPMN ('approved') / SOP ('terbit') + registry Dashboard.
// ==========================================================
async function createManualDocument(kind, req, res) {
  try {
    const { judul, nomor, jenis, klasifikasi, unit_l1, unit_l2, tanggal, link, link_visio, file_data, file_name } = req.body;
    if (!judul || !judul.trim()) return res.status(400).json({ error: 'Judul wajib diisi' });
    if (!link && !file_data) return res.status(400).json({ error: 'Unggah PDF atau isi tautan dokumen' });
    if (file_data && String(file_data).length > 9.5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran PDF melebihi batas (±7MB)' });
    }

    // Resolusi unit dari nama — dinormalisasi + auto-create agar pilihan tidak hilang.
    const { l1Id, l2Id } = await resolveUnitIds(unit_l1, unit_l2, true);

    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    // Masuk sebagai PROSES (review Ortala MR dulu), bukan langsung terbit:
    // pending → (setujui admin) penetapan → (unggah ulang TTD) verifikasi → (penetapan admin) terbit/approved.
    const status = 'pending';
    const ins = await pool.query(
      `INSERT INTO ${table} (process_title, l1_id, l2_id, jenis_proses, klasifikasi_proses, status, created_by,
                             is_manual, manual_nomor, manual_link, manual_link_visio, manual_file_name, manual_tanggal)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11,$12) RETURNING *`,
      [judul.trim(), l1Id, l2Id, jenis || null, klasifikasi || null, status, req.user.id,
       (nomor || '').trim() || null, (link || '').trim() || null, (link_visio || '').trim() || null, file_name || null, tanggal || null]
    );
    const row = ins.rows[0];
    if (file_data) {
      await pool.query(
        'INSERT INTO manual_files (model_type, model_id, data, mime, file_name) VALUES ($1,$2,$3,$4,$5)',
        [kind, row.id, file_data, 'application/pdf', file_name || 'dokumen.pdf']
      );
    }
    // Registry Dashboard TIDAK diisi di sini — baru saat admin menetapkan
    // (PATCH status → approved/terbit) seperti alur dokumen aplikasi biasa.
    res.json(row);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/manual', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createManualDocument('bpmn', req, res));
app.post('/api/sop/manual', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createManualDocument('sop', req, res));
app.post('/api/sp/manual', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createManualDocument('sp', req, res));

async function serveManualFile(kind, req, res) {
  try {
    const r = await pool.query(
      'SELECT data, mime, file_name FROM manual_files WHERE model_type = $1 AND model_id = $2 ORDER BY id DESC LIMIT 1',
      [kind, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'File tidak ditemukan' });
    const { data, mime, file_name } = r.rows[0];
    const parsed = /^data:[^;]+;base64,(.+)$/s.exec(data);
    const buf = Buffer.from(parsed ? parsed[1] : data, 'base64');
    res.setHeader('Content-Type', mime || 'application/pdf');
    const fnSafe = (file_name || 'dokumen.pdf').replace(/["\\]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${fnSafe.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fnSafe)}`);
    res.send(buf);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); if (!res.headersSent) res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.get('/api/bpmn/models/:id/manual-file', authenticate, (req, res) => serveManualFile('bpmn', req, res));
app.get('/api/sop/models/:id/manual-file', authenticate, (req, res) => serveManualFile('sop', req, res));
app.get('/api/sp/models/:id/manual-file', authenticate, (req, res) => serveManualFile('sp', req, res));

// UNGGAH ULANG PDF dokumen manual — dipakai penyusun untuk menyerahkan versi
// yang SUDAH ditandatangani pimpinan (status penetapan → verifikasi), atau
// memperbaiki dokumen yang ditolak (rejected → pending). Boleh: admin/superadmin,
// penyusun (created_by), atau user pada Unit Kerja Level 1 yang sama.
async function reuploadManualFile(kind, req, res) {
  try {
    const { id } = req.params;
    const { file_data, file_name } = req.body;
    if (!file_data) return res.status(400).json({ error: 'File PDF wajib diunggah' });
    if (String(file_data).length > 9.5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran PDF melebihi batas (±7MB)' });
    }
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const chk = await pool.query(
      `SELECT m.*, u1.nama AS unit_l1_nama FROM ${table} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id WHERE m.id = $1`, [id]);
    if (chk.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const row = chk.rows[0];
    if (!row.is_manual) return res.status(400).json({ error: 'Bukan dokumen manual' });
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isOwner = row.created_by === req.user.id;
    const sameUnit = req.user.unit_l1 && row.unit_l1_nama &&
      String(row.unit_l1_nama).toLowerCase() === String(req.user.unit_l1).toLowerCase();
    if (!isAdmin && !isOwner && !sameUnit) {
      return res.status(403).json({ error: 'Tidak berwenang mengunggah dokumen ini' });
    }
    // Transisi status: setelah disetujui (penetapan) unggahan berikutnya = versi TTD
    // → verifikasi; setelah ditolak → kembali antre review (pending).
    // 'approved' = Pengesahan Pimpinan (unggahan berikutnya = versi ber-TTD → verifikasi);
    // 'penetapan' ikut diterima demi data lama. Setelah ditolak → antre review lagi.
    const newStatus = ['approved', 'penetapan'].includes(row.status) ? 'verifikasi'
      : row.status === 'rejected' ? 'pending' : row.status;
    await pool.query('DELETE FROM manual_files WHERE model_type = $1 AND model_id = $2', [kind, id]);
    await pool.query(
      'INSERT INTO manual_files (model_type, model_id, data, mime, file_name) VALUES ($1,$2,$3,$4,$5)',
      [kind, id, file_data, 'application/pdf', file_name || 'dokumen.pdf']);
    const upd = await pool.query(
      `UPDATE ${table} SET manual_file_name = $1, manual_link = NULL, status = $2,
         catatan = NULL, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [file_name || 'dokumen.pdf', newStatus, id]);
    if (newStatus !== row.status) pushNotif({ kind, row: upd.rows[0], event: newStatus, req });
    if (kind !== 'sp' && newStatus !== row.status) logDocHistory(kind, id, req, newStatus, 'Mengunggah ulang PDF' + (row.status === 'penetapan' ? ' bertanda tangan' : ' perbaikan'));
    res.json(upd.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/models/:id/manual-file', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => reuploadManualFile('bpmn', req, res));
app.post('/api/sop/models/:id/manual-file', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => reuploadManualFile('sop', req, res));
app.post('/api/sp/models/:id/manual-file', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => reuploadManualFile('sp', req, res));

// GANTI TAUTAN dokumen manual — alternatif dari unggah ulang PDF: saat revisi
// (rejected) atau pengesahan (penetapan), penyusun boleh mengganti tautan dokumen
// (PDF/Drive) dan/atau tautan Visio. Transisi status sama dgn unggah ulang:
// penetapan → verifikasi, rejected → pending (antre ulang review admin).
async function relinkManualDoc(kind, req, res) {
  try {
    const { id } = req.params;
    const link = (req.body.link || '').trim();
    const linkVisio = (req.body.link_visio || '').trim();
    if (!link && !linkVisio) return res.status(400).json({ error: 'Isi minimal satu tautan (dokumen atau Visio)' });
    const isHttp = (u) => /^https?:\/\//i.test(u);
    if ((link && !isHttp(link)) || (linkVisio && !isHttp(linkVisio))) {
      return res.status(400).json({ error: 'Tautan harus diawali http:// atau https://' });
    }
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const chk = await pool.query(
      `SELECT m.*, u1.nama AS unit_l1_nama FROM ${table} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id WHERE m.id = $1`, [id]);
    if (chk.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const row = chk.rows[0];
    if (!row.is_manual) return res.status(400).json({ error: 'Bukan dokumen manual' });
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isOwner = row.created_by === req.user.id;
    const sameUnit = req.user.unit_l1 && row.unit_l1_nama &&
      String(row.unit_l1_nama).toLowerCase() === String(req.user.unit_l1).toLowerCase();
    if (!isAdmin && !isOwner && !sameUnit) {
      return res.status(403).json({ error: 'Tidak berwenang mengubah dokumen ini' });
    }
    if (!isAdmin && !['approved', 'penetapan', 'rejected'].includes(row.status)) {
      return res.status(400).json({ error: 'Penggantian tautan hanya saat dokumen dikembalikan (revisi) atau menunggu pengesahan pimpinan' });
    }
    const newStatus = ['approved', 'penetapan'].includes(row.status) ? 'verifikasi'
      : row.status === 'rejected' ? 'pending' : row.status;
    // Tautan dokumen baru menggantikan file PDF yang pernah diunggah (satu sumber).
    if (link) await pool.query('DELETE FROM manual_files WHERE model_type = $1 AND model_id = $2', [kind, id]);
    const upd = await pool.query(
      `UPDATE ${table} SET
         manual_link = COALESCE($1, manual_link),
         manual_file_name = CASE WHEN $1 IS NOT NULL THEN NULL ELSE manual_file_name END,
         manual_link_visio = COALESCE($2, manual_link_visio),
         status = $3, catatan = NULL, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [link || null, linkVisio || null, newStatus, id]);
    if (newStatus !== row.status) pushNotif({ kind, row: upd.rows[0], event: newStatus, req });
    if (kind !== 'sp') logDocHistory(kind, id, req, newStatus !== row.status ? newStatus : 'relink', link ? 'Mengganti tautan dokumen' + (linkVisio ? ' & tautan Visio' : '') : 'Mengganti tautan Visio');
    res.json(upd.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/models/:id/manual-relink', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => relinkManualDoc('bpmn', req, res));
app.post('/api/sop/models/:id/manual-relink', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => relinkManualDoc('sop', req, res));
app.post('/api/sp/models/:id/manual-relink', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => relinkManualDoc('sp', req, res));

// EDIT METADATA dokumen manual (judul s.d. Unit Kerja L2, tautan PDF/Drive & Visio).
// Boleh: admin/superadmin kapan pun; penyusun/unit L1 yang sama selama BELUM final
// (bpmn 'approved' / sop & sp 'terbit'). Bila status 'rejected', simpan perbaikan
// otomatis mengantre ulang ke review admin (status kembali 'pending').
async function updateManualMeta(kind, req, res) {
  try {
    const { id } = req.params;
    const { judul, nomor, jenis, klasifikasi, unit_l1, unit_l2, tanggal, link, link_visio } = req.body;
    if (!judul || !String(judul).trim()) return res.status(400).json({ error: 'Judul wajib diisi' });
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const chk = await pool.query(
      `SELECT m.*, u1.nama AS unit_l1_nama FROM ${table} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id WHERE m.id = $1`, [id]);
    if (chk.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const row = chk.rows[0];
    if (!row.is_manual) return res.status(400).json({ error: 'Bukan dokumen manual' });
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isOwner = row.created_by === req.user.id;
    const sameUnit = req.user.unit_l1 && row.unit_l1_nama &&
      String(row.unit_l1_nama).toLowerCase() === String(req.user.unit_l1).toLowerCase();
    if (!isAdmin && !isOwner && !sameUnit) {
      return res.status(403).json({ error: 'Tidak berwenang mengubah dokumen ini' });
    }
    const finalStatus = kind === 'bpmn' ? 'approved' : 'terbit';
    if (!isAdmin && row.status === finalStatus) {
      return res.status(403).json({ error: 'Dokumen sudah terbit/ditetapkan — hubungi admin untuk koreksi.' });
    }
    const { l1Id, l2Id } = await resolveUnitIds(unit_l1, unit_l2, true);
    // Perbaikan atas penolakan → antre ulang ke review admin.
    const newStatus = row.status === 'rejected' ? 'pending' : row.status;
    const upd = await pool.query(
      `UPDATE ${table} SET process_title = $1, manual_nomor = $2, jenis_proses = $3, klasifikasi_proses = $4,
         l1_id = $5, l2_id = $6, manual_tanggal = $7, manual_link = $8, manual_link_visio = $9,
         status = $10::varchar, catatan = CASE WHEN $10::varchar <> status THEN NULL ELSE catatan END, updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [String(judul).trim(), (nomor || '').trim() || null, jenis || null, klasifikasi || null,
       l1Id, l2Id, tanggal || null, (link || '').trim() || null, (link_visio || '').trim() || null,
       newStatus, id]);
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2 FROM ${table} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id WHERE m.id = $1`, [upd.rows[0].id]);
    if (kind !== 'sp' && newStatus !== row.status) {
      logDocHistory(kind, id, req, newStatus, 'Memperbaiki informasi dokumen');
      // Kabari admin bahwa dokumen hasil perbaikan mengantre ulang — tanpa ini,
      // perbaikan lewat "Edit Informasi" tersangkut diam-diam tanpa notifikasi.
      pushNotif({ kind, row: full.rows[0], event: newStatus, req });
    }
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
// IMPOR MASSAL dokumen manual dari Excel (khusus SUPERADMIN, seperti Import Data
// Dashboard) — baris berbasis TAUTAN (Drive dll.), bukan unggahan PDF. `masuk`:
// 'pending' (ikut alur review) atau 'final' (dokumen lama yang sudah sah →
// langsung approved/terbit + registry Dashboard).
async function importManualDocuments(kind, req, res) {
  try {
    const { rows, masuk } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Tidak ada baris untuk diimpor' });
    if (rows.length > 500) return res.status(400).json({ error: 'Maksimal 500 baris per impor' });
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const finalStatus = kind === 'bpmn' ? 'approved' : 'terbit';
    const status = masuk === 'final' ? finalStatus : 'pending';
    const jenisRegistry = { bpmn: 'Proses Bisnis', sop: 'SOP', sp: 'Standar Pelayanan' }[kind];
    const inserted = [];
    const failed = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const judul = String(r.judul || '').trim();
      const link = String(r.link || '').trim();
      try {
        if (!judul) { failed.push({ baris: i + 1, judul, error: 'Judul kosong' }); continue; }
        if (!link) { failed.push({ baris: i + 1, judul, error: 'Link Dokumen kosong' }); continue; }
        const { l1Id, l2Id } = await resolveUnitIds(r.unit_l1, r.unit_l2, true);
        const ins = await pool.query(
          `INSERT INTO ${table} (process_title, l1_id, l2_id, jenis_proses, klasifikasi_proses, status, created_by,
                                 is_manual, manual_nomor, manual_link, manual_link_visio, manual_tanggal)
           VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11) RETURNING *`,
          [judul, l1Id, l2Id, String(r.jenis || '').trim() || null, String(r.klasifikasi || '').trim() || null,
           status, req.user.id, String(r.nomor || '').trim() || null, link,
           String(r.link_visio || '').trim() || null, r.tanggal || null]);
        const row = ins.rows[0];
        if (status === finalStatus) {
          try { await syncDokumenFromModel({ type: kind, jenis: jenisRegistry, row, status }); }
          catch (e) { console.error('Sync registry impor gagal:', e.message); }
        }
        // Kembalikan NAMA unit versi database (bukan teks mentah Excel) agar
        // daftar di frontend langsung rapi tanpa perlu muat ulang.
        const full = await pool.query(
          `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2 FROM ${table} m
           LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
           LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id WHERE m.id = $1`, [row.id]);
        inserted.push(full.rows[0]);
      } catch (e) { failed.push({ baris: i + 1, judul, error: e.message }); }
    }
    res.json({ inserted, failed, status });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/manual/import', authenticate, requireRole('superadmin'), (req, res) => importManualDocuments('bpmn', req, res));
app.post('/api/sop/manual/import', authenticate, requireRole('superadmin'), (req, res) => importManualDocuments('sop', req, res));
app.post('/api/sp/manual/import', authenticate, requireRole('superadmin'), (req, res) => importManualDocuments('sp', req, res));

app.patch('/api/bpmn/models/:id/manual-meta', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => updateManualMeta('bpmn', req, res));
app.patch('/api/sop/models/:id/manual-meta', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => updateManualMeta('sop', req, res));
app.patch('/api/sp/models/:id/manual-meta', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => updateManualMeta('sp', req, res));

// TANGGAPAN penyusun atas catatan revisi — APPEND ke kolom `tanggapan` (TERPISAH
// dari `catatan` admin, agar tak terhapus saat admin meng-edit catatan revisi).
// User (penyusun/unit sama) hanya saat status 'rejected'; admin boleh kapan pun.
// Server yang meng-append (user tak bisa menimpa/menghapus).
// ============ NOTIFIKASI HEADER ============
// Aksi admin (revisi/setujui/tetapkan) → notifikasi utk 'user' (dibatasi unit_l1 dokumen);
// aksi user (kirim ke Ortala/unggah cover/tanggapan) → notifikasi utk 'admin'.
// Fire-and-forget: kegagalan notifikasi tidak boleh menggagalkan aksi utamanya.
const JENIS_NOTIF = { bpmn: 'Proses Bisnis', sop: 'SOP', sp: 'Standar Pelayanan' };
// Catat satu entri riwayat dokumen (best-effort — kegagalan tidak mengganggu aksi utama).
async function logDocHistory(kind, modelId, req, action, detail) {
  try {
    await pool.query(
      'INSERT INTO doc_history (model_type, model_id, user_id, user_role, unit, action, detail) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [kind, modelId, req.user?.id || null, req.user?.role || null, req.user?.unit_l1 || null, action, detail || null]
    );
  } catch (e) { console.error('logDocHistory:', e.message); }
}

// Baca riwayat dokumen. Bila belum ada entri 'create' (dokumen lama sebelum fitur
// ini), sintesis entri pembuatan dari created_at/created_by model.
async function getDocHistory(kind, req, res) {
  try {
    const { id } = req.params;
    // Dulu ternary bpmn/sop — dokumen SP ikut dibaca dari sop_models sehingga
    // entri "dibuat" hasil sintesis menunjuk dokumen yang salah.
    const table = WRITE_TABLES[kind];
    if (!table) return res.status(400).json({ error: 'Jenis dokumen tidak dikenal' });
    const r = await pool.query(
      `SELECT h.id, h.action, h.detail, h.created_at, h.user_role, h.unit, u.nama_lengkap, u.username
       FROM doc_history h LEFT JOIN users u ON h.user_id = u.id
       WHERE h.model_type = $1 AND h.model_id = $2 ORDER BY h.id ASC`, [kind, id]);
    let rows = r.rows;
    if (!rows.some(x => x.action === 'create' || x.action === 'usulan')) {
      const m = await pool.query(
        `SELECT m.created_at, u.nama_lengkap, u.username, r2.name AS role, u.unit_l1
         FROM ${table} m LEFT JOIN users u ON m.created_by = u.id LEFT JOIN roles r2 ON u.role_id = r2.id
         WHERE m.id = $1`, [id]);
      if (m.rows[0]) {
        rows = [{ id: 0, action: 'create', detail: null, created_at: m.rows[0].created_at,
          user_role: m.rows[0].role, unit: m.rows[0].unit_l1, nama_lengkap: m.rows[0].nama_lengkap, username: m.rows[0].username }, ...rows];
      }
    }
    res.json(rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
// BATALKAN PROSES PENETAPAN (admin/superadmin) — untuk salah klik/terlewat.
// Dokumen berstatus 'penetapan' dikembalikan ke STATUS SEBELUMNYA, diambil dari
// riwayat (akurat untuk semua alur: BPMN pending→penetapan; SOP studio
// verifikasi→penetapan; SOP/SP manual pending→penetapan). Bila riwayat belum ada,
// pakai perkiraan aman sesuai jenis dokumen.
async function batalPenetapan(kind, req, res) {
  try {
    const { id } = req.params;
    const alasan = (req.body?.alasan || '').trim();
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const cur = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (cur.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const row = cur.rows[0];
    // Yang boleh dibatalkan: proses penetapan menteri, DAN (SOP/SP) persetujuan
    // "lanjut pengesahan pimpinan" (status 'approved') yang belum final.
    // BPMN 'approved' = sudah DITETAPKAN (final) → tidak termasuk.
    const BOLEH = kind === 'bpmn' ? ['penetapan'] : ['penetapan', 'approved'];
    if (!BOLEH.includes(row.status)) {
      return res.status(400).json({ error: 'Hanya dokumen dalam proses penetapan atau menunggu pengesahan pimpinan yang dapat dibatalkan' });
    }
    // Status sebelum entri status-sekarang terakhir pada riwayat.
    const VALID = ['draft', 'pending', 'rejected', 'approved', 'verifikasi'];
    const h = await pool.query(
      `SELECT action FROM doc_history
       WHERE model_type = $1::varchar AND model_id = $2
         AND id < COALESCE((SELECT MAX(id) FROM doc_history WHERE model_type = $1::varchar AND model_id = $2 AND action = $4::varchar), 2147483647)
         AND action = ANY($3) ORDER BY id DESC LIMIT 1`, [kind, id, VALID, row.status]);
    let prev = h.rows[0]?.action;
    if (!prev) {
      if (row.status === 'approved') prev = 'pending';          // pengesahan pimpinan → kembali direview
      else if (kind === 'bpmn' || row.is_manual) prev = 'pending';
      else {
        const cov = await pool.query('SELECT 1 FROM sop_covers WHERE sop_id = $1', [id]);
        prev = cov.rowCount > 0 ? 'verifikasi' : 'approved';
      }
    }
    if (prev === row.status) prev = 'pending'; // jaga-jaga agar status benar-benar mundur
    const upd = await pool.query(
      `UPDATE ${table} SET status = $1::varchar, penetapan_dasar = NULL, penetapan_tanggal = NULL,
         updated_at = NOW() WHERE id = $2 RETURNING *`, [prev, id]);
    try { await removeDokumenForModel(kind, id); } catch (e) { console.error('removeDokumen batal:', e.message); }
    const tahap = row.status === 'approved' ? 'persetujuan pengesahan pimpinan' : 'proses penetapan';
    logDocHistory(kind, id, req, 'batal_penetapan', `Membatalkan ${tahap} — status dikembalikan ke ${prev}${alasan ? `. Alasan: ${alasan}` : ''}`);
    pushNotif({ kind, row: upd.rows[0], event: 'batal_penetapan', req,
      pesan: `${tahap.charAt(0).toUpperCase() + tahap.slice(1)} ${JENIS_NOTIF[kind] || kind} “${upd.rows[0].process_title}” dibatalkan admin${alasan ? ` — ${alasan}` : ''}. Dokumen kembali ke tahap sebelumnya.` });
    res.json(upd.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/models/:id/batal-penetapan', authenticate, requireRole('admin', 'superadmin'), (req, res) => batalPenetapan('bpmn', req, res));
app.post('/api/sop/models/:id/batal-penetapan', authenticate, requireRole('admin', 'superadmin'), (req, res) => batalPenetapan('sop', req, res));
app.post('/api/sp/models/:id/batal-penetapan', authenticate, requireRole('admin', 'superadmin'), (req, res) => batalPenetapan('sp', req, res));

// ============ DOKUMEN TERBIT DARI REGISTRI (Dashboard) ============
// Dokumen yang sudah DITETAPKAN lewat Keputusan Menteri dicatat di tabel `dokumen`
// (dipakai Dashboard) dan TIDAK punya baris di sop_models/bpmn_models — dokumennya
// tidak disusun lewat studio. Endpoint ini menyediakannya agar ikut tampil pada
// kartu & tab "Telah Ditetapkan (Terbit)" di menu Buat SOP / Buat Proses Bisnis.
const JENIS_REGISTRI = { sop: 'SOP', bpmn: 'Proses Bisnis' };
app.get('/api/:kind(sop|bpmn)/terbit-registry', authenticate, async (req, res) => {
  try {
    const jenis = JENIS_REGISTRI[req.params.kind];
    if (!jenis) return res.status(400).json({ error: 'Jenis dokumen tidak dikenal' });
    // Default: tahun berjalan (arsip tahun sebelumnya tetap dilihat lewat Dashboard).
    const tahun = String(req.query.tahun || new Date().getFullYear());

    const params = [jenis, tahun];
    let filterUnit = '';
    const { role, unit_l1 } = req.user;
    if (role !== 'admin' && role !== 'superadmin' && unit_l1) {
      params.push(unit_l1);
      filterUnit = ` AND LOWER(TRIM(u1.nama)) = LOWER(TRIM($${params.length}))`;
    }

    const r = await pool.query(
      `SELECT d.id, d.nama, d.jenis, d.tahun, d.link, d.sumber, d.created_at,
              u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM dokumen d
       LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON d.l2_id = u2.id
       WHERE d.jenis = $1 AND d.tahun = $2 AND d.source_id IS NULL${filterUnit}
       ORDER BY d.nama`, params);
    res.json({ tahun, items: r.rows });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Jumlah halaman berkas cover: PDF dibaca isinya, gambar selalu 1 halaman.
async function hitungHalamanCover(dataBase64, mime) {
  try {
    if (!(mime || '').includes('pdf')) return 1;
    const m = /^data:[^;]+;base64,(.+)$/s.exec(dataBase64);
    const buf = Buffer.from(m ? m[1] : dataBase64, 'base64');
    const doc = await PDFDocument.load(buf);
    return doc.getPageCount() || 1;
  } catch { return 1; }
}

// ============ KOTAK SAMPAH (soft delete, retensi 30 hari) ============
// Dokumen yang dihapus tidak langsung lenyap — admin/superadmin dapat memulihkannya
// dalam 30 hari. Lewat itu, dibersihkan permanen secara otomatis.
const TRASH_TABEL = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' };
const TRASH_HARI = 30;

// Buang permanen yang sudah lewat masa simpan (dipanggil sebelum membaca daftar).
let _lastTrashPurge = 0;
async function bersihkanSampahKedaluwarsa() {
  if (Date.now() - _lastTrashPurge < 60 * 60 * 1000) return; // maks 1×/jam
  _lastTrashPurge = Date.now();
  for (const [kind, tabel] of Object.entries(TRASH_TABEL)) {
    try {
      const q = await pool.query(
        `SELECT id FROM ${tabel} WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '${TRASH_HARI} days'`);
      for (const r of q.rows) {
        await pool.query('DELETE FROM manual_files WHERE model_type = $1 AND model_id = $2', [kind, r.id]);
        await pool.query(`DELETE FROM ${tabel} WHERE id = $1`, [r.id]);
      }
      if (q.rowCount) console.log(`Kotak sampah: ${q.rowCount} dokumen ${kind} dibuang permanen (>${TRASH_HARI} hari).`);
    } catch (e) { console.error('Bersihkan kotak sampah gagal:', e.message); }
  }
}

// Daftar isi kotak sampah — gabungan BPMN + SOP + SP.
app.get('/api/trash', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    await bersihkanSampahKedaluwarsa();
    // User unit hanya melihat sampah unit kerjanya — aturan yang sama dengan
    // daftar dokumen (GET /api/{kind}/models): milik sendiri, unit L1 (+L2)
    // sama, atau dokumen tanpa unit.
    const { id: uid, role, unit_l1, unit_l2 } = req.user;
    let filterUnit = '';
    const params = [];
    if (role === 'user') {
      params.push(uid);
      filterUnit = ' AND (m.created_by = $1';
      if (unit_l1) {
        params.push(unit_l1);
        filterUnit += ' OR (u1.nama ILIKE $2';
        if (unit_l2 && unit_l2.trim().toLowerCase() !== 'seluruh unit') {
          params.push(unit_l2);
          filterUnit += ' AND (u2.nama ILIKE $3 OR u2.nama IS NULL))';
        } else filterUnit += ')';
      }
      filterUnit += ' OR m.l1_id IS NULL)';
    }
    const hasil = [];
    for (const [kind, tabel] of Object.entries(TRASH_TABEL)) {
      const q = await pool.query(
        `SELECT m.id, m.process_title, m.status, m.is_manual, m.deleted_at, m.updated_at,
                u1.nama AS unit_l1, u2.nama AS unit_l2,
                u.nama_lengkap AS penghapus_nama, u.username AS penghapus_user,
                CEIL(EXTRACT(EPOCH FROM (m.deleted_at + INTERVAL '${TRASH_HARI} days' - NOW())) / 86400)::int AS sisa_hari
         FROM ${tabel} m
         LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
         LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
         LEFT JOIN users u ON m.deleted_by = u.id
         WHERE m.deleted_at IS NOT NULL${filterUnit}
         ORDER BY m.deleted_at DESC`, params);
      q.rows.forEach(r => hasil.push({ ...r, kind }));
    }
    hasil.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    res.json({ items: hasil, retensi_hari: TRASH_HARI });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Pulihkan dokumen dari kotak sampah.
app.post('/api/trash/:kind/:id/restore', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const tabel = TRASH_TABEL[req.params.kind];
    if (!tabel) return res.status(400).json({ error: 'Jenis dokumen tidak dikenal' });
    if (req.user.role === 'user') {
      // Batas unit = akses dokumen; batas status = hak hapus user (dokumen yang
      // sudah disetujui/ditetapkan hanya dipulihkan admin).
      const acc = await assertModelAccess(req, res, req.params.kind, req.params.id, { write: false });
      if (!acc) return;
      if (!STATUS_BOLEH_HAPUS_USER.includes(acc.status || 'draft')) {
        return res.status(403).json({ error: 'Dokumen yang sudah masuk proses persetujuan hanya dapat dipulihkan oleh admin.' });
      }
    }
    const r = await pool.query(
      `UPDATE ${tabel} SET deleted_at = NULL, deleted_by = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, process_title, status`,
      [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ada di kotak sampah' });
    logDocHistory(req.params.kind, req.params.id, req, 'dipulihkan', 'Dipulihkan dari Kotak Sampah');
    res.json({ success: true, ...r.rows[0] });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Hapus permanen (khusus superadmin) — tidak dapat dibatalkan.
app.delete('/api/trash/:kind/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { kind, id } = req.params;
    const tabel = TRASH_TABEL[kind];
    if (!tabel) return res.status(400).json({ error: 'Jenis dokumen tidak dikenal' });
    const cek = await pool.query(`SELECT id FROM ${tabel} WHERE id = $1 AND deleted_at IS NOT NULL`, [id]);
    if (cek.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ada di kotak sampah' });
    await pool.query('DELETE FROM manual_files WHERE model_type = $1 AND model_id = $2', [kind, id]);
    await pool.query(`DELETE FROM ${tabel} WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/bpmn/models/:id/history', authenticate, (req, res) => getDocHistory('bpmn', req, res));
app.get('/api/sop/models/:id/history', authenticate, (req, res) => getDocHistory('sop', req, res));
app.get('/api/sp/models/:id/history', authenticate, (req, res) => getDocHistory('sp', req, res));

async function pushNotif({ kind, row, event, req, pesan }) {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user?.role);
    const jenis = JENIS_NOTIF[kind] || kind;
    const judul = row.process_title || row.judul || '(tanpa judul)';
    let unitNama = null;
    if (row.l1_id) {
      const u = await pool.query('SELECT nama FROM unit_kerja_l1 WHERE id = $1', [row.l1_id]);
      unitNama = u.rows[0]?.nama || null;
    }
    let forRole = isAdmin ? 'user' : 'admin';
    let text = pesan;
    if (!text) {
      const dari = unitNama || req.user?.username || 'Unit kerja';
      if (isAdmin) {
        if (event === 'rejected') text = `Ortala MR telah mereview dan memberi catatan revisi pada ${jenis} “${judul}”.`;
        else if (event === 'penetapan') text = kind === 'sop'
          ? `Cover SOP “${judul}” disetujui — menunggu proses penetapan menteri.`
          : `${jenis} “${judul}” disetujui — menunggu proses penetapan menteri.`;
        else if (event === 'approved') text = kind === 'bpmn'
          ? `${jenis} “${judul}” telah ditetapkan dan masuk Daftar Proses Bisnis.`
          : `${jenis} “${judul}” disetujui — menunggu pengesahan pimpinan (unggah PDF/cover ber-TTD).`;
        else if (event === 'terbit') text = `${jenis} “${judul}” telah ditetapkan (terbit).`;
      } else {
        if (event === 'pending') text = `${dari} mengirim ${jenis} “${judul}” untuk direview Ortala MR.`;
        else if (event === 'verifikasi') text = `${dari} mengunggah dokumen ber-TTD ${jenis} “${judul}” — menunggu verifikasi admin.`;
      }
    }
    if (!text) return;
    await pool.query(
      'INSERT INTO notifications (kind, model_id, judul, event, pesan, for_role, unit_l1, actor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [kind, row.id, judul, event, text, forRole, forRole === 'user' ? unitNama : null, req.user?.username || null]
    );
    // Retensi notifikasi 3 hari (permintaan user: riwayat yang sudah dibaca hilang).
    await pool.query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '3 days'");
  } catch (e) { console.error('pushNotif:', e.message); }
}

let _lastNotifPrune = 0;
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const role = req.user.role;
    if (role === 'viewer') return res.json({ items: [], unseen: 0 });
    const isAdmin = ['admin', 'superadmin'].includes(role);
    // Retensi 3 hari. Panel notifikasi di-polling tiap 60 detik oleh SETIAP pengguna,
    // jadi pemangkasan dibatasi maksimal sekali per 10 menit agar tidak menjadi
    // DELETE beruntun yang tak perlu.
    if (Date.now() - _lastNotifPrune > 10 * 60 * 1000) {
      _lastNotifPrune = Date.now();
      pool.query("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '3 days'")
        .catch(e => console.error('Pangkas notifikasi gagal:', e.message));
    }
    // ?all=1 → riwayat notifikasi (semua yang tersimpan, maks 300); default 30 terbaru.
    const limit = req.query.all === '1' ? 300 : 30;
    const items = isAdmin
      ? await pool.query('SELECT * FROM notifications WHERE for_role = $1 ORDER BY created_at DESC LIMIT $2', ['admin', limit])
      : await pool.query(
          "SELECT * FROM notifications WHERE for_role = 'user' AND (unit_l1 IS NULL OR LOWER(unit_l1) = LOWER($1)) ORDER BY created_at DESC LIMIT $2",
          [req.user.unit_l1 || '', limit]);
    const seen = await pool.query('SELECT notif_seen_at FROM users WHERE id = $1', [req.user.id]);
    const seenAt = seen.rows[0]?.notif_seen_at || null;
    const unseen = items.rows.filter(n => !seenAt || new Date(n.created_at) > new Date(seenAt)).length;
    res.json({ items: items.rows, unseen, seenAt });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/notifications/seen', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE users SET notif_seen_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

const _BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
function tglIndo(d) { return `${String(d.getDate()).padStart(2, '0')} ${_BULAN_ID[d.getMonth()]} ${d.getFullYear()}`; }
async function appendDiskusi(kind, req, res) {
  try {
    const table = { bpmn: 'bpmn_models', sop: 'sop_models', sp: 'sp_models' }[kind];
    const { id } = req.params;
    const pesan = String(req.body.pesan || '').trim();
    if (!pesan) return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    const q = await pool.query(
      `SELECT m.*, u1.nama AS unit_l1_nama FROM ${table} m LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id WHERE m.id = $1`, [id]);
    if (q.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const m = q.rows[0];
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isOwner = m.created_by === req.user.id;
    const sameUnit = req.user.unit_l1 && m.unit_l1_nama &&
      String(m.unit_l1_nama).toLowerCase() === String(req.user.unit_l1).toLowerCase();
    if (!isAdmin) {
      if (req.user.role === 'viewer' || (!isOwner && !sameUnit)) return res.status(403).json({ error: 'Tidak berwenang menanggapi dokumen ini' });
      if (m.status !== 'rejected') return res.status(400).json({ error: 'Tanggapan hanya dapat diberikan saat dokumen Perlu Revisi' });
    }
    const label = isAdmin ? `${req.user.username || 'admin'} (admin)` : `${req.user.username || 'penyusun'} (penyusun)`;
    const entri = `— ${label} · ${tglIndo(new Date())}: ${pesan}`;
    const tanggapan = m.tanggapan ? `${m.tanggapan}\n\n${entri}` : entri;
    await pool.query(`UPDATE ${table} SET tanggapan = $1, updated_at = NOW() WHERE id = $2`, [tanggapan, id]);
    pushNotif({ kind, row: m, event: 'tanggapan', req, pesan: `${req.user.username || (isAdmin ? 'Ortala MR' : 'Penyusun')} menanggapi diskusi revisi ${JENIS_NOTIF[kind]} “${m.process_title || '(tanpa judul)'}”.` });
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2 FROM ${table} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id WHERE m.id = $1`, [id]);
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.patch('/api/bpmn/models/:id/tanggapan', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => appendDiskusi('bpmn', req, res));
app.patch('/api/sop/models/:id/tanggapan', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => appendDiskusi('sop', req, res));
app.patch('/api/sp/models/:id/tanggapan', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => appendDiskusi('sp', req, res));

// ==========================================================
// ========= STANDAR PELAYANAN (SP) — daftar & usulan ========
// Belum ada studio penyusun: baris lahir dari usulan atau dokumen manual.
// ==========================================================
// Kolom daftar SP — SENGAJA tanpa `sp_data` (naskah studio bisa puluhan KB per
// dokumen). Lihat SOP_COLS/BPMN_LIST_COLS: daftar hanya butuh metadata.
const SP_LIST_COLS = [
  'id', 'process_title', 'l1_id', 'l2_id', 'description', 'status', 'catatan', 'version',
  'jenis_proses', 'klasifikasi_proses', 'is_manual', 'manual_nomor', 'manual_link',
  'manual_file_name', 'manual_tanggal', 'manual_link_visio', 'penetapan_dasar', 'penetapan_tanggal',
  'catatan_at', 'tanggapan', 'created_by', 'created_at', 'updated_at',
].map(c => `m.${c}`).join(', ') + ', (m.sp_data IS NOT NULL) AS has_studio';

app.get('/api/sp/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    let query = `
      SELECT ${SP_LIST_COLS}, u1.nama as unit_l1, u2.nama as unit_l2
      FROM sp_models m
      LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
      WHERE m.deleted_at IS NULL
    `;
    const params = [];
    if (role !== 'admin' && role !== 'superadmin') {
      query += ` AND (m.created_by = $1`;
      params.push(id);
      if (unit_l1 && unit_l1 !== '') {
        query += ` OR (u1.nama ILIKE $2`;
        params.push(unit_l1);
        if (unit_l2 && unit_l2 !== '' && unit_l2 !== 'SELURUH UNIT') {
          query += ` AND (u2.nama ILIKE $3 OR u2.nama IS NULL))`;
          params.push(unit_l2);
        } else {
          query += `)`;
        }
      }
      query += ` OR m.l1_id IS NULL)`;
    }
    query += ` ORDER BY m.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.post('/api/sp/models', authenticate, async (req, res) => {
  try {
    const { process_title, unit_l1, unit_l2, jenis_proses, klasifikasi_proses, status, sp_data } = req.body;
    if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Judul wajib diisi' });
    const { l1Id, l2Id } = await resolveUnitIds(unit_l1, unit_l2, true);
    const ins = await pool.query(
      `INSERT INTO sp_models (process_title, l1_id, l2_id, jenis_proses, klasifikasi_proses, status, created_by, sp_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [process_title.trim(), l1Id, l2Id, jenis_proses || null, klasifikasi_proses || null, status || 'usulan', req.user.id, sp_data || null]
    );
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
       FROM sp_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`, [ins.rows[0].id]);
    if ((status || 'usulan') === 'pending') pushNotif({ kind: 'sp', row: full.rows[0], event: 'pending', req });
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.patch('/api/sp/models/status/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { status, catatan, penetapan_dasar, penetapan_tanggal } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });
  try {
    const result = await pool.query(
      `UPDATE sp_models SET status = $1::varchar, catatan = $2, updated_at = NOW(),
         -- Tanggal catatan revisi dipakai daftar & panel catatan untuk menampilkan
         -- "direvisi sejak kapan"; tanpa ini kolomnya selalu kosong.
         catatan_at = CASE WHEN $1::varchar = 'rejected' THEN NOW() ELSE catatan_at END,
         penetapan_dasar = COALESCE($4, penetapan_dasar),
         penetapan_tanggal = COALESCE($5, penetapan_tanggal)
       WHERE id = $3 RETURNING *`,
      [status, catatan || null, req.params.id, penetapan_dasar || null, penetapan_tanggal || null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SP tidak ditemukan' });
    try {
      if (status === 'terbit') await syncDokumenFromModel({ type: 'sp', jenis: 'Standar Pelayanan', row: result.rows[0], status: 'terbit' });
      else await removeDokumenForModel('sp', req.params.id);
    } catch (e) { console.error('Sync dokumen SP gagal:', e.message); }
    pushNotif({ kind: 'sp', row: result.rows[0], event: status, req });
    // Catatan revisi HARUS masuk Riwayat: kolom `catatan` dikosongkan lagi begitu
    // unit mengirim ulang perbaikan, jadi doc_history-lah arsip permanennya.
    logDocHistory('sp', req.params.id, req, status, catatan || null);
    res.json(result.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.delete('/api/sp/models/:id', authenticate, async (req, res) => {
  try {
    const acc = await assertDeleteAccess(req, res, 'sp', req.params.id);
    if (!acc) return;
    await pool.query('UPDATE sp_models SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1', [req.params.id, req.user.id]);
    await removeDokumenForModel('sp', req.params.id);
    logDocHistory('sp', req.params.id, req, 'dihapus', 'Dipindahkan ke Kotak Sampah');
    res.json({ success: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

// ==========================================================
// ====== STUDIO STANDAR PELAYANAN (naskah komponen SP) =====
// ==========================================================
// Naskah SP mengikuti Permenpan RB 15/2014: komponen Service Delivery (wajib
// dipublikasikan) lalu Manufacturing, ditambah komponen lain bila diperlukan
// (mis. "Peringatan"). Kertas F4 potret 210×330 mm, Bookman Old Style 12 pt.

// Status yang mengunci naskah dari perubahan (sejajar aturan SOP).
const SP_STATUS_TERKUNCI = ['verifikasi', 'penetapan', 'terbit'];

// Studio SP terbuka untuk superadmin, admin, dan user terbatas (viewer tetap
// tanpa akses naskah). Batas unit kerja & status dijaga assertModelAccess:
// user hanya menjangkau dokumen unit kerjanya sendiri.
app.get('/api/sp/models/:id', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const acc = await assertModelAccess(req, res, 'sp', req.params.id, { write: false });
    if (!acc) return;
    if (acc.deleted_at) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const r = await pool.query(`
      SELECT ${SP_LIST_COLS}, m.sp_data, u1.nama as unit_l1, u2.nama as unit_l2
      FROM sp_models m
      LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
      WHERE m.id = $1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.put('/api/sp/models/:id', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const { process_title, unit_l1, unit_l2, jenis_proses, klasifikasi_proses, sp_data, status } = req.body;
    const cur = await assertWriteAccess(req, res, 'sp', req.params.id);
    if (!cur) return;
    if (SP_STATUS_TERKUNCI.includes(cur.status)) {
      return res.status(403).json({ error: 'Dokumen SP terkunci (menunggu verifikasi/penetapan atau sudah terbit). Buat salinan untuk merevisi.' });
    }
    const { l1Id, l2Id } = await resolveUnitIds(unit_l1, unit_l2, true);
    // Status tak dikirim (mis. simpan otomatis / simpan sebelum ekspor) → pertahankan yang lama.
    const statusParam = (typeof status === 'string' && status) ? status : null;
    // Versi naik hanya saat dokumen hasil catatan revisi dikirim/disimpan ulang.
    const versionBump = (cur.status === 'rejected' && ['draft', 'pending'].includes(statusParam || '')) ? 1 : 0;

    const r = await pool.query(
      `UPDATE sp_models
       SET process_title = $1, l1_id = $2, l2_id = $3, jenis_proses = $4, klasifikasi_proses = $5,
           sp_data = $6, status = COALESCE($7, status), updated_at = NOW(), version = version + $8,
           catatan = CASE WHEN COALESCE($7, status) IN ('draft','pending') THEN NULL ELSE catatan END,
           catatan_at = CASE WHEN COALESCE($7, status) IN ('draft','pending') THEN NULL ELSE catatan_at END
       WHERE id = $9 RETURNING *`,
      [process_title || cur.process_title || 'Standar Pelayanan', l1Id, l2Id,
       jenis_proses || null, klasifikasi_proses || null, sp_data || null, statusParam, versionBump, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (statusParam === 'pending' && cur.status !== 'pending') pushNotif({ kind: 'sp', row: r.rows[0], event: 'pending', req });
    if (statusParam && statusParam !== cur.status) {
      logDocHistory('sp', req.params.id, req, statusParam,
        cur.status === 'rejected' && statusParam === 'pending' ? 'Mengirim ulang hasil perbaikan setelah catatan review' : null);
    }
    const { sp_data: _buang, ...ringkas } = r.rows[0];
    res.json(ringkas);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Salin dokumen SP menjadi draft baru — dipakai untuk merevisi naskah yang
// sudah terkunci (verifikasi/penetapan/terbit), sama seperti Salin di SOP.
app.post('/api/sp/models/:id/copy', authenticate, async (req, res) => {
  try {
    const sumber = await assertWriteAccess(req, res, 'sp', req.params.id,
      `${ACCESS_COLS_RINGAN}, m.process_title, m.sp_data, m.jenis_proses, m.klasifikasi_proses, m.is_manual`);
    if (!sumber) return;
    if (sumber.is_manual) return res.status(400).json({ error: 'Dokumen manual tidak dapat disalin — unggah ulang berkasnya sebagai dokumen baru.' });
    const judulBaru = (req.body?.process_title || '').trim() || `Salinan - ${sumber.process_title}`;
    const ins = await pool.query(
      `INSERT INTO sp_models (process_title, l1_id, l2_id, sp_data, status, jenis_proses, klasifikasi_proses, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7) RETURNING id`,
      [judulBaru, sumber.l1_id, sumber.l2_id, sumber.sp_data,
       sumber.jenis_proses || null, sumber.klasifikasi_proses || null, req.user.id]);
    const full = await pool.query(
      `SELECT ${SP_LIST_COLS}, u1.nama as unit_l1, u2.nama as unit_l2
       FROM sp_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`, [ins.rows[0].id]);
    logDocHistory('sp', ins.rows[0].id, req, 'draft', `Disalin dari dokumen #${req.params.id}`);
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Ubah informasi ringkas dari modal "Detail Dokumen SP" — dipakai admin/unit
// pemilik, jadi TIDAK ikut dibatasi superadmin seperti rute naskah studio.
app.patch('/api/sp/models/:id/meta', authenticate, async (req, res) => {
  const { process_title, klasifikasi_proses, jenis_proses } = req.body;
  if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Nama Pelayanan tidak boleh kosong' });
  try {
    const cur = await assertWriteAccess(req, res, 'sp', req.params.id);
    if (!cur) return;
    if (SP_STATUS_TERKUNCI.includes(cur.status)) {
      return res.status(403).json({ error: 'Dokumen SP terkunci (menunggu verifikasi/penetapan atau sudah terbit).' });
    }
    const r = await pool.query(
      `UPDATE sp_models SET process_title = $1, klasifikasi_proses = $2, jenis_proses = $3, updated_at = NOW()
       WHERE id = $4 RETURNING id, process_title, klasifikasi_proses, jenis_proses, updated_at`,
      [process_title.trim(), klasifikasi_proses || null, jenis_proses || null, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    res.json(r.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// Nama berkas unduhan: "SP - {judul}" tanpa karakter yang ilegal di Windows.
const namaBerkasSp = (judul) => `SP - ${String(judul || 'Standar Pelayanan')
  .replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Standar Pelayanan'}`;
const kirimLampiran = (res, nama, ext, mime, buf) => {
  const penuh = `${nama}.${ext}`;
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition',
    `attachment; filename="${penuh.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(penuh)}`);
  res.end(buf);
};

// ── Unduh PDF vektor F4 potret (210×330 mm) ────────────────────────────────
// Naskah dirender langsung dari sp_data menjadi HTML lalu dicetak headless
// Chrome. Berbeda dgn SOP (yang harus membuka halaman studio karena panah alur
// dihitung di klien), SP murni teks/tabel sehingga tak perlu memuat aplikasi —
// jauh lebih cepat dan tidak bergantung sesi login perender.
// Render naskah SP menjadi PDF. Fungsi mandiri (bukan hanya di dalam rute) agar
// fitur "Bagikan" bisa memakainya langsung — tanpa memanggil HTTP ke diri
// sendiri yang akan ikut terkena pembatasan peran rute unduh.
async function renderSpPdf(spData) {
  let browser, semaphoreAcquired = false;
  try {
    const html = spDocument.buildDocumentHtml(spData);
    await _pdfSemaphore.acquire();
    semaphoreAcquired = true;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.emulateMediaType('print');
    // Tunggu skrip pemenggal halaman (cermin algoritma kanvas) selesai menyusun
    // lembar-lembar; bila skrip gagal, tata alir asli tetap tercetak (cadangan).
    await page.waitForFunction('window.__siapCetak === true', { timeout: 30000 }).catch(() => {});
    const P = spDocument.PAGE;
    const pdf = await page.pdf({
      width: `${P.w}mm`, height: `${P.h}mm`, printBackground: true,
      margin: { top: `${P.mTop}mm`, right: `${P.mRight}mm`, bottom: `${P.mBottom}mm`, left: `${P.mLeft}mm` },
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (semaphoreAcquired) _pdfSemaphore.release();
  }
}

app.get('/api/sp/models/:id/pdf', authenticate, requireRole('admin', 'superadmin', 'user'), pdfLimiter, async (req, res) => {
  try {
    const acc = await assertModelAccess(req, res, 'sp', req.params.id, { write: false });
    if (!acc) return;
    const r = await pool.query('SELECT process_title, sp_data FROM sp_models WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (!r.rows[0].sp_data) return res.status(400).json({ error: 'Dokumen ini belum memiliki naskah studio SP.' });
    const buf = await renderSpPdf(r.rows[0].sp_data);
    // `inline` dipakai pratinjau di modal detail; unduhan memakai ?unduh=1.
    if (req.query.unduh) return kirimLampiran(res, namaBerkasSp(r.rows[0].process_title), 'pdf', 'application/pdf', buf);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="standar-pelayanan.pdf"');
    res.end(buf);
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membuat PDF. Coba lagi beberapa saat.' });
  }
});

// ── Unduh DOCX (Word asli, F4 potret + Bookman Old Style 12) ───────────────
app.get('/api/sp/models/:id/docx', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const acc = await assertModelAccess(req, res, 'sp', req.params.id, { write: false });
    if (!acc) return;
    const r = await pool.query('SELECT process_title, sp_data FROM sp_models WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (!r.rows[0].sp_data) return res.status(400).json({ error: 'Dokumen ini belum memiliki naskah studio SP.' });
    const buf = await spDocument.buildDocx(r.rows[0].sp_data);
    kirimLampiran(res, namaBerkasSp(r.rows[0].process_title), 'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buf);
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membuat berkas Word.' });
  }
});

// ── Impor naskah dari berkas Word ──────────────────────────────────────────
// Menerima .docx (base64) dan MENGEMBALIKAN struktur naskah saja — tidak
// menyentuh basis data. Penyusun memeriksa hasilnya di studio lalu menyimpan
// sendiri, jadi impor yang meleset tak pernah menimpa dokumen tersimpan.
// ── Pencarian dokumen untuk "Keterkaitan Dokumen" di panel properti studio ──
// Menggabungkan DUA sumber sekaligus:
//   1. registri  — tabel `dokumen` (yang dihitung Dashboard: hasil impor + aplikasi)
//   2. studio    — sop_models 'terbit' & bpmn_models 'approved' yang belum masuk registri
// Pencarian dilakukan di SERVER karena registri sudah >1600 baris (±500KB) —
// terlalu besar untuk dikirim seluruhnya ke panel.
// (JENIS_REGISTRI sudah dideklarasikan di blok registri terbit di atas.)
app.get('/api/sp/keterkaitan', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const kind = req.query.kind === 'bpmn' ? 'bpmn' : 'sop';
    const q = String(req.query.q || '').replace(/\s+/g, ' ').trim();
    const pola = `%${q}%`;
    const BATAS = 20;

    const registri = await pool.query(
      `SELECT d.id, d.nama AS judul, d.tahun, d.link, u1.nama AS unit
       FROM dokumen d
       LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
       WHERE d.jenis = $1 AND ($2 = '' OR d.nama ILIKE $3)
       ORDER BY d.tahun DESC NULLS LAST, d.id DESC
       LIMIT $4`, [JENIS_REGISTRI[kind], q, pola, BATAS]);

    // Naskah studio yang sudah ditetapkan tetapi belum tercatat di registri
    // (registri mencatat asalnya lewat source_type/source_id).
    const tabel = kind === 'sop' ? 'sop_models' : 'bpmn_models';
    const statusFinal = kind === 'sop' ? 'terbit' : 'approved';
    const studio = await pool.query(
      `SELECT m.id, m.process_title AS judul, u1.nama AS unit
       FROM ${tabel} m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       WHERE m.status = $1 AND m.deleted_at IS NULL AND ($2 = '' OR m.process_title ILIKE $3)
         AND NOT EXISTS (SELECT 1 FROM dokumen d WHERE d.source_type = $4 AND d.source_id = m.id)
       ORDER BY m.updated_at DESC NULLS LAST, m.id DESC
       LIMIT $5`, [statusFinal, q, pola, kind, BATAS]);

    res.json([
      ...studio.rows.map(r => ({ sumber: 'studio', kind, id: r.id, judul: r.judul, unit: r.unit || null, tahun: null, link: null })),
      ...registri.rows.map(r => ({ sumber: 'registri', kind, id: r.id, judul: r.judul, unit: r.unit || null, tahun: r.tahun || null, link: r.link || null })),
    ].slice(0, BATAS));
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/sp/import-docx', authenticate, requireRole('admin', 'superadmin', 'user'), async (req, res) => {
  try {
    const { file_data } = req.body;
    if (!file_data || typeof file_data !== 'string') return res.status(400).json({ error: 'Berkas Word wajib diunggah.' });
    const base64 = file_data.includes(',') ? file_data.split(',').pop() : file_data;
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Berkas Word kosong atau rusak.' });
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Berkas Word terlalu besar (maksimal 8MB).' });
    // .docx = arsip ZIP; .doc lama (biner) tidak didukung mammoth.
    if (buf[0] !== 0x50 || buf[1] !== 0x4B) {
      return res.status(400).json({ error: 'Format tidak didukung. Simpan dokumen sebagai .docx (Word 2007+) lalu unggah ulang.' });
    }
    const doc = await spDocument.parseDocxToDoc(buf);
    const jumlah = doc.sections.reduce((n, s) => n + s.items.length, 0);
    if (!jumlah) return res.status(422).json({ error: 'Tidak menemukan tabel komponen di berkas Word. Pastikan naskah memakai tabel NO | KOMPONEN | URAIAN.' });
    res.json({ doc, jumlahKomponen: jumlah });
  } catch (err) {
    console.error('[ROUTE ERROR]', req.method, req.path, err.message);
    res.status(500).json({ error: 'Gagal membaca berkas Word.' });
  }
});


// ==========================================================
// ============ SOP MODELS (STUDIO BARU ATR/BPN) ============
// ==========================================================
// Kolom sop_models untuk API — SENGAJA TANPA `share_pdf` (cache PDF base64 hasil
// "Bagikan", bisa berukuran MB). Dulu memakai `s.*` sehingga respons daftar SOP
// membengkak ~7,5MB dan terasa lambat dibanding BPMN.
const SOP_COLS = ['id','process_title','process_key','l1_id','l2_id','description','sop_data','status','catatan','version',
  'created_by','created_at','updated_at','jenis_proses','klasifikasi_proses','penetapan_dasar','penetapan_tanggal',
  'is_manual','manual_nomor','manual_link','manual_file_name','manual_tanggal','manual_link_visio','share_token',
  'catatan_at','tanggapan'].map(c => `s.${c}`).join(', ');

app.get('/api/sop/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    
    let query = `
      SELECT ${SOP_COLS}, u1.nama as unit_l1, u2.nama as unit_l2,
             EXISTS(SELECT 1 FROM sop_covers c WHERE c.sop_id = s.id) AS has_cover,
             (SELECT COALESCE(c.pages, 1) FROM sop_covers c WHERE c.sop_id = s.id) AS cover_pages
      FROM sop_models s
      LEFT JOIN unit_kerja_l1 u1 ON s.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON s.l2_id = u2.id
      WHERE s.deleted_at IS NULL
    `;
    
    const params = [];
    
    if (role !== 'admin' && role !== 'superadmin') {
      query += ` AND (s.created_by = $1`;
      params.push(id);

      if (unit_l1 && unit_l1 !== '') {
        query += ` OR (u1.nama ILIKE $2`;
        params.push(unit_l1);

        if (unit_l2 && unit_l2 !== '' && unit_l2 !== 'SELURUH UNIT') {
          query += ` AND (u2.nama ILIKE $3 OR u2.nama IS NULL))`;
          params.push(unit_l2);
        } else {
          query += `)`;
        }
      }
      query += ` OR s.l1_id IS NULL)`;
    }
    
    query += ` ORDER BY s.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error Get SOP Models:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/sop/models/:id', authenticate, async (req, res) => {
  try {
    // Batasi sesuai visibilitas unit (anti-enumerasi ID lintas unit) + dokumen di sampah 404.
    const acc = await assertModelAccess(req, res, 'sop', req.params.id, { write: false });
    if (!acc) return;
    if (acc.deleted_at) return res.status(404).json({ error: 'Model not found' });
    const result = await pool.query(`
      SELECT ${SOP_COLS}, u1.nama as unit_l1, u2.nama as unit_l2,
             EXISTS(SELECT 1 FROM sop_covers c WHERE c.sop_id = s.id) AS has_cover,
             (SELECT COALESCE(c.pages, 1) FROM sop_covers c WHERE c.sop_id = s.id) AS cover_pages
      FROM sop_models s
      LEFT JOIN unit_kerja_l1 u1 ON s.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON s.l2_id = u2.id
      WHERE s.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Merender halaman studio (mode view) memakai mesin cetak Chromium pada ukuran F4 persis,
// menghasilkan PDF VEKTOR (teks bisa diseleksi) yang diunduh langsung — tanpa dialog cetak.
const PDF_BASE_URL = process.env.PDF_BASE_URL || 'https://tlrb.ortalamr.id/e-sop-atrbpn';
// Kunci cache PDF: berubah bila isi dokumen / cover ber-TTD berubah.
async function pdfCacheKey(id) {
  const r = await pool.query(
    `SELECT s.updated_at, s.version, (SELECT MAX(uploaded_at) FROM sop_covers c WHERE c.sop_id = s.id) cov
     FROM sop_models s WHERE s.id = $1`, [id]);
  if (r.rowCount === 0) return null;
  const x = r.rows[0];
  return `${new Date(x.updated_at).getTime()}|${x.version}|${x.cov ? new Date(x.cov).getTime() : 0}`;
}

// Cek apakah PDF pratinjau sudah tersedia di cache (dokumen belum berubah).
// Dipakai modal detail: bila siap → pratinjau dimuat otomatis (instan); bila belum →
// tampilkan tombol agar pengguna sadar prosesnya butuh beberapa detik.
// Gambar pratinjau (PNG halaman pertama) — untuk ponsel/tablet yang tidak dapat
// menampilkan PDF di dalam bingkai halaman.
app.get('/api/sop/models/:id/preview-image', authenticate, async (req, res) => {
  try {
    const r = await pool.query('SELECT preview_png FROM sop_models WHERE id = $1', [req.params.id]);
    if (r.rowCount === 0 || !r.rows[0].preview_png) return res.status(404).json({ error: 'Gambar pratinjau belum tersedia' });
    const buf = Buffer.from(r.rows[0].preview_png, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(buf);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/sop/models/:id/pdf-status', authenticate, async (req, res) => {
  try {
    const key = await pdfCacheKey(req.params.id);
    if (!key) return res.status(404).json({ error: 'SOP tidak ditemukan' });
    const r = await pool.query('SELECT pdf_cache_key, (pdf_cache IS NOT NULL) ada, (preview_png IS NOT NULL) ada_gambar FROM sop_models WHERE id = $1', [req.params.id]);
    const cocok = r.rows[0]?.pdf_cache_key === key;
    res.json({ cached: !!(r.rows[0]?.ada && cocok), hasImage: !!(r.rows[0]?.ada_gambar && cocok) });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/sop/models/:id/pdf', authenticate, pdfLimiter, async (req, res) => {
  const { id } = req.params;
  const token = (req.headers.authorization || '').split(' ')[1];
  let browser;
  let semaphoreAcquired = false;
  try {
    const chk = await pool.query('SELECT process_title FROM sop_models WHERE id = $1', [id]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'SOP tidak ditemukan' });

    // CACHE: dokumen belum berubah sejak render terakhir → kirim langsung (instan,
    // tanpa puppeteer). Ini yang membuat pratinjau di modal detail terasa mulus.
    const key = await pdfCacheKey(id);
    const cached = await pool.query('SELECT pdf_cache, pdf_cache_key, (preview_png IS NOT NULL) ada_gambar FROM sop_models WHERE id = $1', [id]);
    // Cache dipakai hanya bila PDF **dan** gambar pratinjaunya sudah ada — dokumen
    // yang di-cache sebelum fitur gambar dirender sekali lagi agar gambarnya terbuat.
    if (key && cached.rows[0]?.pdf_cache && cached.rows[0].pdf_cache_key === key && cached.rows[0].ada_gambar) {
      const buf = Buffer.from(cached.rows[0].pdf_cache, 'base64');
      const judulC = String(chk.rows[0].process_title || 'Dokumen SOP').replace(/[\\/]+/g, '_').replace(/[:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'Dokumen SOP';
      const safeC = `SOP - ${judulC}`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Pdf-Cache', 'HIT');
      res.setHeader('Content-Disposition', `attachment; filename="${safeC.replace(/[^\x20-\x7E]/g, '_')}.pdf"; filename*=UTF-8''${encodeURIComponent(safeC + '.pdf')}`);
      return res.end(buf);
    }

    await _pdfSemaphore.acquire();
    semaphoreAcquired = true;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // Sisipkan token sebelum skrip app jalan agar halaman studio bisa memuat data (baca localStorage).
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('token', t); } catch (e) {} }, token);
    await page.goto(`${PDF_BASE_URL}/sop/studio?id=${id}&mode=view`, { waitUntil: 'networkidle0', timeout: 60000 });
    // Sesi kedaluwarsa → studio me-redirect ke /login → selector tak pernah muncul.
    // Deteksi lebih awal supaya error-nya jelas (bukan timeout 30 detik yang membisu).
    if (page.url().includes('/login')) {
      return res.status(401).json({ error: 'Sesi berakhir saat merender PDF. Muat ulang halaman lalu coba lagi.' });
    }
    try {
      await page.waitForSelector('.print-page-target', { timeout: 30000 });
    } catch (selErr) {
      console.error(`PDF render: .print-page-target tidak muncul utk SOP ${id} (url akhir: ${page.url()})`);
      throw selErr;
    }
    await page.emulateMediaType('print');
    // Picu perhitungan ulang panah (getBoundingClientRect) & tunggu font termuat.
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('resize'));
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    });
    await new Promise((r) => setTimeout(r, 2500)); // beri waktu panah dihitung (timer s/d ~1.5s) + font
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await new Promise((r) => setTimeout(r, 800));

    // FIT-TO-PAGE: bila konten sebuah halaman sedikit melebihi F4 (215mm) — yang tanpa ini akan
    // TERPOTONG karena overflow:hidden — perkecil (scale) konten halaman itu agar muat penuh.
    await page.evaluate(() => {
      document.querySelectorAll('.page-container, .cover-page-container').forEach((el) => {
        try {
          const cs = getComputedStyle(el);
          const padT = parseFloat(cs.paddingTop) || 0;
          const padB = parseFloat(cs.paddingBottom) || 0;
          const availH = el.clientHeight - padT - padB;   // tinggi area isi (F4)
          const contentH = el.scrollHeight - padT - padB; // tinggi isi sebenarnya
          if (availH > 0 && contentH > availH + 2) {
            const k = availH / contentH;
            if (k >= 0.5 && k < 1) {
              const wrap = document.createElement('div');
              wrap.style.cssText = 'display:flex;flex-direction:column;transform-origin:top left;width:' +
                (100 / k).toFixed(4) + '%;height:' + contentH + 'px;transform:scale(' + k.toFixed(4) + ');';
              while (el.firstChild) wrap.appendChild(el.firstChild);
              el.appendChild(wrap);
            }
          }
        } catch (e) { /* abaikan */ }
      });
    });
    await new Promise((r) => setTimeout(r, 300));

    // Nama file = "SOP - {judul}". Garis miring (/ atau \) → "_", karakter ilegal lain dibuang.
    const judul = String(chk.rows[0].process_title || 'Dokumen SOP')
      .replace(/[\\/]+/g, '_')
      .replace(/[:*?"<>|]+/g, '')
      .replace(/\s+/g, ' ').trim() || 'Dokumen SOP';
    const safe = `SOP - ${judul}`;

    // Selaraskan judul dokumen (metadata /Title PDF) dengan nama file. Tanpa ini, viewer PDF
    // browser memakai <title> aplikasi ("E-BISPRO ATR/BPN") sebagai nama simpan bawaan.
    await page.evaluate((t) => { document.title = t; }, safe);

    const pdf = await page.pdf({
      width: '330mm', height: '215mm', printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });

    // Sekalian potret halaman pertama untuk pratinjau di ponsel/tablet (browser HP
    // tak bisa menyematkan PDF). Memakai proses puppeteer yang sama — tanpa beban baru.
    let previewPng = null;
    try {
      const el = await page.$('.print-page-target');
      if (el) previewPng = (await el.screenshot({ type: 'png' })).toString('base64');
      else console.error('Potret pratinjau: elemen .print-page-target tidak ditemukan');
    } catch (e) { console.error('Potret pratinjau gagal:', e.message); }

    // GABUNG COVER BERTANDA TANGAN (bila ada) di halaman paling depan → total = [cover TTD] + [alur SOP].
    let finalPdf = Buffer.from(pdf);
    try {
      const coverRes = await pool.query('SELECT data, mime FROM sop_covers WHERE sop_id = $1', [req.params.id]);
      if (coverRes.rowCount > 0) {
        const { data, mime } = coverRes.rows[0];
        const parsed = /^data:[^;]+;base64,(.+)$/s.exec(data);
        const coverBuf = Buffer.from(parsed ? parsed[1] : data, 'base64');
        const merged = await PDFDocument.create();
        if ((mime || '').includes('pdf')) {
          const coverDoc = await PDFDocument.load(coverBuf);
          const cp = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
          cp.forEach(p => merged.addPage(p));
        } else {
          const img = (mime || '').includes('png') ? await merged.embedPng(coverBuf) : await merged.embedJpg(coverBuf);
          const pw = 215 / 25.4 * 72, ph = 330 / 25.4 * 72; // F4 potret (points)
          const pg = merged.addPage([pw, ph]);
          const scale = Math.min(pw / img.width, ph / img.height);
          const w = img.width * scale, h = img.height * scale;
          pg.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        }
        const flowDoc = await PDFDocument.load(finalPdf);
        const fp = await merged.copyPages(flowDoc, flowDoc.getPageIndices());
        fp.forEach(p => merged.addPage(p));
        finalPdf = Buffer.from(await merged.save());
      }
    } catch (mergeErr) {
      console.error('Merge cover ke PDF gagal (pakai PDF tanpa cover):', mergeErr.message);
    }

    // HTTP header hanya boleh ASCII — gunakan filename* (RFC 6266) untuk nama Unicode + ASCII fallback.
    const safeAscii = safe.replace(/[^\x20-\x7E]/g, '_');
    const safeEncoded = encodeURIComponent(`${safe}.pdf`);
    // Simpan ke cache agar permintaan berikutnya (pratinjau/unduh) instan.
    try {
      // Pakai `key` yang dihitung SEBELUM render — bila dokumen diedit selama proses
      // puppeteer (~5 dtk), kunci pasca-render mencerminkan versi baru sementara PDF-nya
      // versi lama → cache basi disajikan sebagai HIT selamanya.
      const keyNow = key || await pdfCacheKey(id);
      if (keyNow) {
        await pool.query('UPDATE sop_models SET pdf_cache = $1, pdf_cache_key = $2, preview_png = COALESCE($4, preview_png) WHERE id = $3',
          [finalPdf.toString('base64'), keyNow, id, previewPng]);
        // BATASI PERTUMBUHAN: tiap cache ±1 MB. Simpan hanya 25 dokumen yang paling
        // baru diperbarui; sisanya dibuang (nanti dirender ulang bila dibuka lagi).
        await pool.query(`
          UPDATE sop_models SET pdf_cache = NULL, pdf_cache_key = NULL, preview_png = NULL
          WHERE pdf_cache IS NOT NULL AND id NOT IN (
            SELECT id FROM sop_models WHERE pdf_cache IS NOT NULL ORDER BY updated_at DESC LIMIT 25
          )`);
      }
    } catch (e) { console.error('Simpan cache PDF gagal:', e.message); }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Pdf-Cache', 'MISS');
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}.pdf"; filename*=UTF-8''${safeEncoded}`);
    res.end(finalPdf);
  } catch (err) {
    console.error('PDF gen error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membuat PDF: ' + err.message });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (semaphoreAcquired) _pdfSemaphore.release();
  }
});

app.post('/api/sop/models', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, unit_l1, unit_l2, sop_data, status, jenis_proses, klasifikasi_proses } = req.body;

    const { l1Id: final_l1, l2Id: final_l2 } = await resolveUnitIds(unit_l1, unit_l2, true);

    const finalKey = process_key && process_key.trim() ? process_key.trim() : null;

    const modelResult = await pool.query(
      `INSERT INTO sop_models (process_title, process_key, l1_id, l2_id, sop_data, status, jenis_proses, klasifikasi_proses, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [process_title, finalKey, final_l1, final_l2, sop_data || null, status || 'draft',
       jenis_proses || null, klasifikasi_proses || null, req.user.id]
    );
    if ((status || 'draft') === 'pending') pushNotif({ kind: 'sop', row: modelResult.rows[0], event: 'pending', req });
    logDocHistory('sop', modelResult.rows[0].id, req, (status || 'draft') === 'usulan' ? 'usulan' : 'create', null);
    if ((status || 'draft') === 'pending') logDocHistory('sop', modelResult.rows[0].id, req, 'pending', null);
    res.json(modelResult.rows[0]);
  } catch (err) {
    console.error(err);
    if(err.code === '23505') {
       return res.status(400).json({ error: 'Nomor SOP ini sudah ada di database.' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/sop/models/:id', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, unit_l1, unit_l2, sop_data, status, jenis_proses, klasifikasi_proses } = req.body;

    // KUNCI KONTEN SETELAH TERBIT: SOP yang sudah 'terbit' (cover bertanda tangan sudah diunggah)
    // tidak boleh diubah/disimpan lagi oleh siapa pun. Revisi = buat salinan/versi baru.
    const curRow = await assertWriteAccess(req, res, 'sop', req.params.id);
    if (!curRow) return;
    const cur = { rows: [curRow] };
    if (['verifikasi', 'penetapan', 'terbit'].includes(curRow.status)) {
      return res.status(403).json({ error: 'SOP terkunci (menunggu verifikasi/penetapan atau sudah terbit). Buat salinan untuk merevisi.' });
    }

    const { l1Id: final_l1, l2Id: final_l2 } = await resolveUnitIds(unit_l1, unit_l2, true);

    const finalKey = process_key && process_key.trim() ? process_key.trim() : null;

    // Jika status tidak dikirim (mis. saat simpan-untuk-ekspor PDF), pertahankan status lama
    // agar dokumen yang sudah 'pending' tidak turun jadi 'draft'.
    const statusParam = (typeof status === 'string' && status) ? status : null;

    // VERSI: penyusunan pertama (draft ↔ kirim) tetap versi 1. Versi naik +1 hanya
    // saat dokumen hasil catatan review Ortala MR ('rejected') disimpan/dikirim lagi
    // (sekali per siklus revisi — setelah itu status berubah sehingga tak naik lagi).
    const versionBump = (cur.rows[0]?.status === 'rejected' && ['draft', 'pending'].includes(statusParam || '')) ? 1 : 0;

    const result = await pool.query(
      `UPDATE sop_models
       SET process_title = $1, process_key = $2, l1_id = $3, l2_id = $4,
           sop_data = $5, status = COALESCE($6, status), jenis_proses = $7, klasifikasi_proses = $8,
           updated_at = NOW(), version = version + $9,
           -- Catatan review Ortala dianggap SELESAI begitu dokumen diperbaiki &
           -- dikirim ulang, supaya revisi berikutnya dimulai dari catatan kosong.
           -- Riwayatnya tetap tersimpan permanen di doc_history.
           catatan = CASE WHEN COALESCE($6, status) IN ('draft', 'pending') THEN NULL ELSE catatan END,
           catatan_at = CASE WHEN COALESCE($6, status) IN ('draft', 'pending') THEN NULL ELSE catatan_at END
       WHERE id = $10 RETURNING *`,
      [process_title, finalKey, final_l1, final_l2, sop_data || null, statusParam,
       jenis_proses || null, klasifikasi_proses || null, versionBump, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    if (statusParam === 'pending' && cur.rows[0]?.status !== 'pending') pushNotif({ kind: 'sop', row: result.rows[0], event: 'pending', req });
    if (statusParam && statusParam !== cur.rows[0]?.status) {
      logDocHistory('sop', req.params.id, req, statusParam,
        cur.rows[0]?.status === 'rejected' && statusParam === 'pending' ? 'Mengirim ulang hasil perbaikan setelah catatan review' : null);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/sop/models/:id', authenticate, async (req, res) => {
  try {
    const acc = await assertDeleteAccess(req, res, 'sop', req.params.id);
    if (!acc) return;
    // SOFT DELETE — dokumen masuk Kotak Sampah (dipulihkan dalam 30 hari).
    await pool.query('UPDATE sop_models SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1', [req.params.id, req.user.id]);
    await removeDokumenForModel('sop', req.params.id);
    logDocHistory('sop', req.params.id, req, 'dihapus', 'Dipindahkan ke Kotak Sampah');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.patch('/api/sop/models/status/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan, penetapan_dasar, penetapan_tanggal } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });

  try {
    const result = await pool.query(
      `UPDATE sop_models SET status = $1::varchar, catatan = $2, updated_at = NOW(),
         catatan_at = CASE WHEN $1::varchar = 'rejected' THEN NOW() ELSE catatan_at END,
         penetapan_dasar = COALESCE($4, penetapan_dasar),
         penetapan_tanggal = COALESCE($5, penetapan_tanggal)
       WHERE id = $3 RETURNING *`,
      [status, catatan || null, id, penetapan_dasar || null, penetapan_tanggal || null]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SOP Model tidak ditemukan' });
    // SOP masuk registry Dashboard hanya saat benar-benar TERBIT (setelah verifikasi admin).
    try {
      if (status === 'terbit') await syncDokumenFromModel({ type: 'sop', jenis: 'SOP', row: result.rows[0], status: 'terbit' });
      else await removeDokumenForModel('sop', id);
    } catch (e) { console.error('Sync dokumen SOP gagal:', e.message); }
    pushNotif({ kind: 'sop', row: result.rows[0], event: status, req });
    logDocHistory('sop', id, req, status, catatan || null);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error update status SOP:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// UNGGAH COVER SOP BERTANDA TANGAN → status menjadi 'verifikasi'.
// Boleh: admin, penyusun (created_by), ATAU user pada unit kerja (Level 1) yang sama.
// Hanya saat status 'approved' atau 'verifikasi' (unggah ulang). Batas 2 MB, PDF/JPG/PNG.
app.post('/api/sop/models/:id/cover', authenticate, async (req, res) => {
  const { id } = req.params;
  const { cover, filename } = req.body;
  if (!cover) return res.status(400).json({ error: 'File cover wajib diunggah' });
  try {
    const chk = await pool.query('SELECT id, created_by, status, sop_data, l1_id, process_title FROM sop_models WHERE id = $1', [id]);
    if (chk.rowCount === 0) return res.status(404).json({ error: 'SOP tidak ditemukan' });
    const row = chk.rows[0];
    const isOwner = row.created_by === req.user.id;
    // User (terbatas) boleh unggah cover bila SOP berada di unit kerja Level 1-nya.
    let unitMatch = false;
    if (req.user.role !== 'viewer' && req.user.unit_l1) {
      let sopUnit = '';
      try { sopUnit = (JSON.parse(row.sop_data || '{}').unitKerja) || ''; } catch (e) { /* abaikan */ }
      if (!sopUnit && row.l1_id) {
        const u = await pool.query('SELECT nama FROM unit_kerja_l1 WHERE id = $1', [row.l1_id]);
        sopUnit = u.rows[0] ? u.rows[0].nama : '';
      }
      if (sopUnit && sopUnit.trim().toLowerCase() === String(req.user.unit_l1).trim().toLowerCase()) unitMatch = true;
    }
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin' && !isOwner && !unitMatch) {
      return res.status(403).json({ error: 'Anda tidak berwenang mengunggah cover SOP ini' });
    }
    if (row.status !== 'approved' && row.status !== 'verifikasi') {
      return res.status(400).json({ error: 'Cover hanya dapat diunggah setelah SOP disetujui Biro Ortala MR' });
    }
    const parsed = /^data:([^;]+);base64,(.+)$/s.exec(cover);
    if (!parsed) return res.status(400).json({ error: 'Format file tidak valid (harus data URL base64)' });
    const mime = parsed[1];
    const b64 = parsed[2];
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(mime)) return res.status(400).json({ error: 'Format harus PDF, JPG, atau PNG' });
    const bytes = Buffer.byteLength(b64, 'base64');
    if (bytes > 2 * 1024 * 1024) return res.status(400).json({ error: 'Ukuran file melebihi 2 MB' });

    await pool.query(`
      INSERT INTO sop_covers (sop_id, data, filename, mime, uploaded_by, uploaded_at, pages)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      ON CONFLICT (sop_id) DO UPDATE
        SET data = EXCLUDED.data, filename = EXCLUDED.filename, mime = EXCLUDED.mime,
            uploaded_by = EXCLUDED.uploaded_by, uploaded_at = NOW(), pages = EXCLUDED.pages
    `, [id, cover, (filename || 'cover-sop.pdf').slice(0, 255), mime, req.user.id,
        await hitungHalamanCover(cover, mime)]);

    // Cover masuk → status 'verifikasi' (menunggu admin memeriksa TTD & nomor SOP). Belum terbit,
    // belum masuk registry Dashboard — itu terjadi saat admin menyetujui (status → 'terbit').
    await pool.query("UPDATE sop_models SET status = 'verifikasi', updated_at = NOW() WHERE id = $1", [id]);
    pushNotif({ kind: 'sop', row, event: 'verifikasi', req });
    logDocHistory('sop', id, req, 'verifikasi', 'Mengunggah cover bertanda tangan pimpinan');
    res.json({ ok: true, id: Number(id), status: 'verifikasi' });
  } catch (err) {
    console.error('Upload cover SOP:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// TAMPILKAN / UNDUH COVER SOP bertanda tangan.
app.get('/api/sop/models/:id/cover', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('SELECT data, filename, mime FROM sop_covers WHERE sop_id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Cover belum diunggah' });
    const { data, filename, mime } = r.rows[0];
    const parsed = /^data:([^;]+);base64,(.+)$/s.exec(data);
    const buf = Buffer.from(parsed ? parsed[2] : data, 'base64');
    // HTTP header hanya boleh ASCII — filename* (RFC 6266) untuk Unicode + fallback ASCII.
    const fname = (filename || 'cover-sop').replace(/"/g, '');
    const fnameAscii = fname.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fnameAscii}"; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(buf);
  } catch (err) {
    console.error('Get cover SOP:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.patch('/api/sop/models/:id/meta', authenticate, async (req, res) => {
  const { id } = req.params;
  const { process_title, jenis_proses, klasifikasi_proses } = req.body;
  if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Judul tidak boleh kosong' });
  try {
    // SOP terkunci sejak verifikasi/penetapan/terbit — judul/informasi tidak dapat diubah.
    const curRow = await assertWriteAccess(req, res, 'sop', id);
    if (!curRow) return;
    if (['verifikasi', 'penetapan', 'terbit'].includes(curRow.status)) {
      return res.status(403).json({ error: 'SOP terkunci (menunggu verifikasi/penetapan atau sudah terbit). Buat salinan untuk merevisi.' });
    }
    const result = await pool.query(
      `UPDATE sop_models SET process_title = $1, jenis_proses = $2, klasifikasi_proses = $3, updated_at = NOW()
       WHERE id = $4 RETURNING id, process_title, jenis_proses, klasifikasi_proses, updated_at`,
      [process_title.trim(), jenis_proses || null, klasifikasi_proses || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Model tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) { console.error('PATCH sop meta:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/sop/models/:id/copy', authenticate, async (req, res) => {
  const { id } = req.params;
  const { process_title, jenis_proses, klasifikasi_proses } = req.body;
  try {
    // Salin = membaca isi dokumen sumber; batasi sesuai visibilitas unit (viewer ditolak).
    const s = await assertWriteAccess(req, res, 'sop', id, `${ACCESS_COLS_RINGAN}, m.process_title, m.sop_data, m.jenis_proses, m.klasifikasi_proses`);
    if (!s) return;
    const newTitle = (process_title && process_title.trim()) ? process_title.trim() : `Salinan - ${s.process_title}`;
    const result = await pool.query(
      `INSERT INTO sop_models (process_title, process_key, l1_id, l2_id, sop_data, status, jenis_proses, klasifikasi_proses, created_by)
       VALUES ($1, NULL, $2, $3, $4, 'draft', $5, $6, $7) RETURNING *`,
      [newTitle, s.l1_id, s.l2_id, s.sop_data,
       (jenis_proses !== undefined ? jenis_proses : s.jenis_proses) || null,
       (klasifikasi_proses !== undefined ? klasifikasi_proses : s.klasifikasi_proses) || null,
       req.user.id]
    );
    const full = await pool.query(
      `SELECT ${SOP_COLS}, u1.nama as unit_l1, u2.nama as unit_l2
       FROM sop_models s
       LEFT JOIN unit_kerja_l1 u1 ON s.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON s.l2_id = u2.id
       WHERE s.id = $1`,
      [result.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error('POST sop copy:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

// ============ PERATURAN / KEPUTUSAN MENTERI ============
app.get('/api/peraturan/drive-files', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_DRIVE_API_KEY belum dikonfigurasi di api/.env' });
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents+and+trashed%3Dfalse&fields=files(id,name,webViewLink,mimeType)&orderBy=name&pageSize=200&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    // 424 (bukan 502): Cloudflare mengganti body respons 5xx dengan halaman HTML-nya
    // sendiri → klien gagal parse JSON & tampil "Tidak dapat terhubung". 4xx diteruskan apa adanya.
    if (!response.ok) return res.status(424).json({ error: data.error?.message || 'Gagal mengambil file dari Drive' });
    const files = (data.files || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    res.json(files);
  } catch (err) {
    console.error('Drive files error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// ============ DOKUMEN DRIVE BROWSER ============
app.get('/api/dokumen/drive-browse', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = req.query.folderId || '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_DRIVE_API_KEY belum dikonfigurasi di api/.env' });
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('files(id,name,webViewLink,mimeType)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=500&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    // 424 (bukan 502): Cloudflare mengganti body respons 5xx dengan halaman HTML-nya
    // sendiri → klien gagal parse JSON & tampil "Tidak dapat terhubung". 4xx diteruskan apa adanya.
    if (!response.ok) return res.status(424).json({ error: data.error?.message || 'Gagal mengambil file dari Drive' });
    const all = data.files || [];
    const folders = all.filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => ({ id: f.id, name: f.name }));
    const files = all.filter(f => f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).map(f => ({
      id: f.id,
      name: f.name,
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    }));
    res.json({ folders, files });
  } catch (err) {
    console.error('Drive browse error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/peraturan', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nama, jenis, nomor, tahun,
              TO_CHAR(tanggal_ditetapkan, 'YYYY-MM-DD') AS tanggal_ditetapkan,
              tentang, link_drive, created_at
       FROM peraturan_menteri ORDER BY tanggal_ditetapkan DESC NULLS LAST, created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/peraturan error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/peraturan', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { nama, jenis, nomor, tahun, tanggal_ditetapkan, tentang, link_drive } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama peraturan wajib diisi' });
  const validJenis = ['Peraturan Menteri', 'Keputusan Menteri'];
  const safeJenis = validJenis.includes(jenis) ? jenis : 'Peraturan Menteri';
  const safeTanggal = tanggal_ditetapkan && /^\d{4}-\d{2}-\d{2}$/.test(tanggal_ditetapkan) ? tanggal_ditetapkan : null;
  try {
    const result = await pool.query(
      `INSERT INTO peraturan_menteri (nama, jenis, nomor, tahun, tanggal_ditetapkan, tentang, link_drive, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        sanitizeString(nama), safeJenis,
        sanitizeString(nomor || ''), sanitizeString(tahun || ''),
        safeTanggal, sanitizeString(tentang || ''),
        (link_drive || '').substring(0, 2000), req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/peraturan error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/peraturan/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { id } = req.params;
  const { nama, jenis, nomor, tahun, tanggal_ditetapkan, tentang, link_drive } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: 'Nama peraturan wajib diisi' });
  const validJenis = ['Peraturan Menteri', 'Keputusan Menteri'];
  const safeJenis = validJenis.includes(jenis) ? jenis : 'Peraturan Menteri';
  const safeTanggal = tanggal_ditetapkan && /^\d{4}-\d{2}-\d{2}$/.test(tanggal_ditetapkan) ? tanggal_ditetapkan : null;
  try {
    const result = await pool.query(
      `UPDATE peraturan_menteri SET nama=$1, jenis=$2, nomor=$3, tahun=$4, tanggal_ditetapkan=$5,
       tentang=$6, link_drive=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [
        sanitizeString(nama), safeJenis,
        sanitizeString(nomor || ''), sanitizeString(tahun || ''),
        safeTanggal, sanitizeString(tentang || ''),
        (link_drive || '').substring(0, 2000), id,
      ]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Peraturan tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/peraturan/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/peraturan/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM peraturan_menteri WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Peraturan tidak ditemukan' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/peraturan/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ============ JUKNIS / JUKLAK / SE ============
app.get('/api/juknis', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, judul, jenis, nomor, tahun,
              TO_CHAR(tanggal_terbit, 'YYYY-MM-DD') AS tanggal_terbit,
              tentang, link, unit_l1, unit_l2, unit_l3, created_at, created_by
       FROM juknis_dokumen ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/juknis error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/juknis', authenticate, async (req, res) => {
  const { judul, jenis, nomor, tahun, tanggal_terbit, tentang, link, unit_l1, unit_l2, unit_l3 } = req.body;
  if (!judul || !judul.trim()) return res.status(400).json({ error: 'Judul wajib diisi' });
  const validJenis = ['Juknis', 'Juklak', 'SE'];
  const safeJenis = validJenis.includes(jenis) ? jenis : 'Juknis';
  const safeTanggal = tanggal_terbit && /^\d{4}-\d{2}-\d{2}$/.test(tanggal_terbit) ? tanggal_terbit : null;
  try {
    const result = await pool.query(
      `INSERT INTO juknis_dokumen (judul, jenis, nomor, tahun, tanggal_terbit, tentang, link, unit_l1, unit_l2, unit_l3, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        sanitizeString(judul), safeJenis,
        sanitizeString(nomor || ''), sanitizeString(tahun || ''),
        safeTanggal,
        sanitizeString(tentang || ''), (link || '').substring(0, 2000),
        sanitizeString(unit_l1 || ''), sanitizeString(unit_l2 || ''), sanitizeString(unit_l3 || ''),
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /api/juknis error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/juknis/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { judul, jenis, nomor, tahun, tanggal_terbit, tentang, link, unit_l1, unit_l2, unit_l3 } = req.body;
  if (!judul || !judul.trim()) return res.status(400).json({ error: 'Judul wajib diisi' });
  const validJenis = ['Juknis', 'Juklak', 'SE'];
  const safeJenis = validJenis.includes(jenis) ? jenis : 'Juknis';
  const safeTanggal = tanggal_terbit && /^\d{4}-\d{2}-\d{2}$/.test(tanggal_terbit) ? tanggal_terbit : null;
  try {
    const existing = await pool.query('SELECT created_by, unit_l1 FROM juknis_dokumen WHERE id=$1', [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const sameCreator = existing.rows[0].created_by === req.user.id;
      const docUnit = (existing.rows[0].unit_l1 || '').toLowerCase().trim();
      const userUnit = (req.user.unit_l1 || '').toLowerCase().trim();
      const sameUnit = docUnit && userUnit && docUnit === userUnit;
      if (!sameCreator && !sameUnit) {
        return res.status(403).json({ error: 'Tidak diizinkan mengubah dokumen ini' });
      }
    }
    const result = await pool.query(
      `UPDATE juknis_dokumen SET judul=$1, jenis=$2, nomor=$3, tahun=$4, tanggal_terbit=$5,
       tentang=$6, link=$7, unit_l1=$8, unit_l2=$9, unit_l3=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [
        sanitizeString(judul), safeJenis,
        sanitizeString(nomor || ''), sanitizeString(tahun || ''),
        safeTanggal,
        sanitizeString(tentang || ''), (link || '').substring(0, 2000),
        sanitizeString(unit_l1 || ''), sanitizeString(unit_l2 || ''), sanitizeString(unit_l3 || ''),
        id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /api/juknis/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/juknis/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await pool.query('SELECT created_by, unit_l1 FROM juknis_dokumen WHERE id=$1', [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      const sameCreator = existing.rows[0].created_by === req.user.id;
      const docUnit = (existing.rows[0].unit_l1 || '').toLowerCase().trim();
      const userUnit = (req.user.unit_l1 || '').toLowerCase().trim();
      const sameUnit = docUnit && userUnit && docUnit === userUnit;
      if (!sameCreator && !sameUnit) {
        return res.status(403).json({ error: 'Tidak diizinkan menghapus dokumen ini' });
      }
    }
    await pool.query('DELETE FROM juknis_dokumen WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/juknis/:id error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================================
// ============ BAGIKAN (share) mode-view tanpa login ========
// ==========================================================
// Buat/ambil token bagikan. Untuk SOP STUDIO (bukan manual), render PDF sekali
// pakai kredensial pembagi lalu simpan (share_pdf) supaya publik tak perlu auth.
async function createShare(kind, req, res) {
  try {
    const table = WRITE_TABLES[kind];
    if (!table) return res.status(400).json({ error: 'Jenis dokumen tidak dikenal' });
    const { id } = req.params;
    // Hanya dokumen yang boleh DIA ubah yang boleh dia bagikan (role user = unit sendiri;
    // viewer ditolak) — mencegah mempublikasikan draft unit lain lewat tautan publik.
    const acc = await assertWriteAccess(req, res, kind, id, `${ACCESS_COLS_RINGAN}, m.share_token, m.is_manual`);
    if (!acc) return;
    if (acc.deleted_at) return res.status(404).json({ error: 'Dokumen sudah dihapus.' });
    const cur = { rows: [acc] };
    let token = cur.rows[0].share_token;
    if (!token) {
      token = crypto.randomBytes(18).toString('base64url');
      await pool.query(`UPDATE ${table} SET share_token = $1 WHERE id = $2`, [token, id]);
    }
    // SP studio → render & simpan PDF-nya agar pembaca publik langsung dilayani
    // dari cache (render dipanggil langsung, tanpa lewat rute ber-otorisasi).
    if (kind === 'sp' && !cur.rows[0].is_manual) {
      try {
        const d = await pool.query('SELECT sp_data FROM sp_models WHERE id = $1', [id]);
        if (d.rows[0]?.sp_data) {
          const buf = await renderSpPdf(d.rows[0].sp_data);
          await pool.query('UPDATE sp_models SET share_pdf = $1 WHERE id = $2', [buf.toString('base64'), id]);
        }
      } catch (e) { console.error('Share SP PDF gagal:', e.message); }
    }
    // SOP studio → render & cache PDF (pakai token pembagi ke endpoint PDF yang sudah ada).
    if (kind === 'sop' && !cur.rows[0].is_manual) {
      try {
        const authToken = (req.headers.authorization || '').split(' ')[1];
        const r = await fetch(`http://127.0.0.1:${PORT}/api/sop/models/${id}/pdf`, { headers: { Authorization: `Bearer ${authToken}` } });
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          await pool.query('UPDATE sop_models SET share_pdf = $1 WHERE id = $2', [buf.toString('base64'), id]);
        } else {
          console.error('Share SOP PDF gagal:', r.status);
        }
      } catch (e) { console.error('Share SOP PDF error:', e.message); }
    }
    res.json({ token, path: `/share/${kind}/${token}` });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
}
app.post('/api/bpmn/models/:id/share', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createShare('bpmn', req, res));
app.post('/api/sop/models/:id/share', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createShare('sop', req, res));
app.post('/api/sp/models/:id/share', authenticate, requireRole('admin', 'superadmin', 'user'), (req, res) => createShare('sp', req, res));

// PUBLIK (tanpa auth) — hanya baca, hanya dokumen yang punya share_token.
app.get('/api/public/bpmn/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT bm.id, bm.process_title, bm.bpmn_xml, bm.status, bm.is_manual, bm.manual_link, bm.manual_link_visio,
              bm.manual_file_name, bm.jenis_proses, bm.klasifikasi_proses, u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM bpmn_models bm LEFT JOIN unit_kerja_l1 u1 ON bm.l1_id=u1.id LEFT JOIN unit_kerja_l2 u2 ON bm.l2_id=u2.id
       WHERE bm.share_token = $1 AND bm.deleted_at IS NULL`, [req.params.token]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tautan tidak ditemukan atau sudah dicabut' });
    const row = r.rows[0];
    res.json({ ...row, has_file: !!row.manual_file_name });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});
app.get('/api/public/sop/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.process_title, s.status, s.is_manual, s.manual_link, s.manual_file_name,
              s.jenis_proses, s.klasifikasi_proses, (s.share_pdf IS NOT NULL) AS has_pdf,
              u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM sop_models s LEFT JOIN unit_kerja_l1 u1 ON s.l1_id=u1.id LEFT JOIN unit_kerja_l2 u2 ON s.l2_id=u2.id
       WHERE s.share_token = $1 AND s.deleted_at IS NULL`, [req.params.token]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tautan tidak ditemukan atau sudah dicabut' });
    const row = r.rows[0];
    res.json({ ...row, has_file: !!row.manual_file_name });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});
// Berkas manual (PDF unggahan) untuk dokumen manual yang dibagikan.
async function servePublicManualFile(kind, req, res) {
  try {
    const table = kind === 'bpmn' ? 'bpmn_models' : 'sop_models';
    const m = await pool.query(`SELECT id FROM ${table} WHERE share_token = $1 AND deleted_at IS NULL`, [req.params.token]);
    if (m.rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    const f = await pool.query('SELECT data, mime, file_name FROM manual_files WHERE model_type=$1 AND model_id=$2 ORDER BY id DESC LIMIT 1', [kind, m.rows[0].id]);
    if (f.rows.length === 0) return res.status(404).json({ error: 'File tidak ada' });
    const { data, mime, file_name } = f.rows[0];
    const parsed = /^data:[^;]+;base64,(.+)$/s.exec(data);
    const buf = Buffer.from(parsed ? parsed[1] : data, 'base64');
    res.setHeader('Content-Type', mime || 'application/pdf');
    const fnSafe = (file_name || 'dokumen.pdf').replace(/["\\]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${fnSafe.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(fnSafe)}`);
    res.send(buf);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
}
app.get('/api/public/bpmn/:token/file', (req, res) => servePublicManualFile('bpmn', req, res));
app.get('/api/public/sop/:token/file', (req, res) => servePublicManualFile('sop', req, res));
app.get('/api/public/sp/:token/file', (req, res) => servePublicManualFile('sp', req, res));

// Data dokumen SP yang dibagikan (tanpa login).
app.get('/api/public/sp/:token', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.process_title, s.status, s.is_manual, s.manual_link, s.manual_file_name,
              s.jenis_proses, s.klasifikasi_proses, (s.share_pdf IS NOT NULL) AS has_pdf,
              u1.nama AS unit_l1, u2.nama AS unit_l2
       FROM sp_models s LEFT JOIN unit_kerja_l1 u1 ON s.l1_id=u1.id LEFT JOIN unit_kerja_l2 u2 ON s.l2_id=u2.id
       WHERE s.share_token = $1 AND s.deleted_at IS NULL`, [req.params.token]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tautan tidak ditemukan atau sudah dicabut' });
    const row = r.rows[0];
    res.json({ ...row, has_file: !!row.manual_file_name });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.get('/api/public/sp/:token/pdf', async (req, res) => {
  try {
    const r = await pool.query('SELECT share_pdf FROM sp_models WHERE share_token = $1 AND deleted_at IS NULL', [req.params.token]);
    if (r.rows.length === 0 || !r.rows[0].share_pdf) return res.status(404).json({ error: 'PDF tidak tersedia' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="standar-pelayanan.pdf"');
    res.send(Buffer.from(r.rows[0].share_pdf, 'base64'));
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});
// PDF SOP studio yang sudah di-cache saat dibagikan.
app.get('/api/public/sop/:token/pdf', async (req, res) => {
  try {
    const r = await pool.query('SELECT share_pdf, process_title FROM sop_models WHERE share_token = $1 AND deleted_at IS NULL', [req.params.token]);
    if (r.rows.length === 0 || !r.rows[0].share_pdf) return res.status(404).json({ error: 'PDF tidak tersedia' });
    const buf = Buffer.from(r.rows[0].share_pdf, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="SOP.pdf"`);
    res.send(buf);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: 'Internal Server Error' }); }
});

// ============ CRAWL PROBIS & BULK IMPORT ============
const _https = require('https');

function probisGet(url) {
  return new Promise((resolve, reject) => {
    const req = _https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => resolve({ body, status: res.statusCode }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout 15s')); });
  });
}

function parseProbisDir(html, currentPath) {
  const dirs = [], files = [];
  const seenD = new Set(), seenF = new Set();
  let m;

  // Gunakan data-href yang ada di setiap <li> — lebih reliable dari href
  // Format: data-href="?dir=PATH" untuk folder, data-href="FULL/PATH.svg" untuk file
  const re = /data-href="([^"]+)"/gi;
  while ((m = re.exec(html)) !== null) {
    const val = m[1];
    if (val.startsWith('http')) continue; // parent dir (absolute URL)

    if (val.startsWith('?dir=')) {
      // Folder
      const fp = decodeURIComponent(val.slice(5));
      if (seenD.has(fp) || fp === currentPath) continue;
      if (currentPath) {
        if (!fp.startsWith(currentPath + '/')) continue;
        if (fp.slice(currentPath.length + 1).includes('/')) continue;
      } else {
        if (fp.includes('/')) continue;
      }
      seenD.add(fp);
      dirs.push({ name: fp.split('/').pop(), path: fp });
    } else if (/\.(svg|pdf)$/i.test(val)) {
      // File — val sudah berupa full relative path dari root probis, URL-encoded
      if (seenF.has(val)) continue;
      seenF.add(val);
      const decoded = decodeURIComponent(val);
      const filename = decoded.split('/').pop();
      const ext = filename.split('.').pop().toLowerCase();
      const name = filename.replace(/\.(svg|pdf)$/i, '');
      files.push({ name, ext, url: 'https://orpeg.atrbpn.go.id/probis/' + val });
    }
  }

  return { dirs, files };
}

app.get('/api/dokumen/crawl-probis', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const path = (req.query.path || '').trim();
  const encodedPath = path
    ? path.split('/').map(p => encodeURIComponent(p)).join('/')
    : '';
  const url = `https://orpeg.atrbpn.go.id/probis/${encodedPath ? '?dir=' + encodedPath : ''}`;

  try {
    const { body, status } = await probisGet(url);
    if (status !== 200) return res.status(502).json({ error: `Situs merespons HTTP ${status}` });
    res.json({ path, ...parseProbisDir(body, path) });
  } catch (err) {
    console.error('[crawl-probis]', err.message);
    res.status(502).json({ error: 'Gagal akses orpeg.atrbpn.go.id: ' + err.message });
  }
});

// Map singkatan/alias L1 → nama resmi (ALL CAPS sesuai DB)
const L1_ALIAS = {
  // Singkatan resmi
  'SPPR': 'DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG',
  'DITJEN SPPR': 'DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG',
  'SURVEI DAN PEMETAAN': 'DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG',
  'PHPT': 'DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH',
  'DITJEN PHPT': 'DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH',
  'TARU': 'DIREKTORAT JENDERAL TATA RUANG',
  'DITJEN TATA RUANG': 'DIREKTORAT JENDERAL TATA RUANG',
  'PENTAG': 'DIREKTORAT JENDERAL PENATAAN AGRARIA',
  'PENATAAN AGRARIA': 'DIREKTORAT JENDERAL PENATAAN AGRARIA',
  'PTPP': 'DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN',
  'PENGADAAN TANAH': 'DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN',
  'PPTR': 'DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG',
  'PENGENDALIAN': 'DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG',
  'PSKP': 'DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHAN',
  'SENGKETA': 'DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHAN',
  'SETJEN': 'SEKRETARIAT JENDERAL',
  'SEKJEN': 'SEKRETARIAT JENDERAL',
  'ITJEN': 'INSPEKTORAT JENDERAL',
  'INSPEKTORAT': 'INSPEKTORAT JENDERAL',
  'BPSDM': 'BADAN PENGEMBANGAN SUMBER DAYA MANUSIA',
  'STPN': 'SEKOLAH TINGGI PERTANAHAN NASIONAL',
  // Typo umum — "Direktortat" (t ekstra)
  'DIREKTORTAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG': 'DIREKTORAT JENDERAL SURVEI DAN PEMETAAN PERTANAHAN DAN RUANG',
  'DIREKTORTAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH': 'DIREKTORAT JENDERAL PENETAPAN HAK DAN PENDAFTARAN TANAH',
  'DIREKTORTAT JENDERAL TATA RUANG': 'DIREKTORAT JENDERAL TATA RUANG',
  'DIREKTORTAT JENDERAL PENATAAN AGRARIA': 'DIREKTORAT JENDERAL PENATAAN AGRARIA',
  'DIREKTORTAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN': 'DIREKTORAT JENDERAL PENGADAAN TANAH DAN PENGEMBANGAN PERTANAHAN',
  'DIREKTORTAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG': 'DIREKTORAT JENDERAL PENGENDALIAN DAN PENERTIBAN TANAH DAN RUANG',
  'DIREKTORTAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHAN': 'DIREKTORAT JENDERAL PENANGANAN SENGKETA DAN KONFLIK PERTANAHAN',
};

async function resolveL1(client, raw) {
  if (!raw?.trim()) return null;
  const norm = raw.trim().toUpperCase();
  // 1. Cek alias singkatan → selalu ambil id terkecil (ALL CAPS)
  if (L1_ALIAS[norm]) {
    const r = await client.query('SELECT id FROM unit_kerja_l1 WHERE nama ILIKE $1 ORDER BY id LIMIT 1', [L1_ALIAS[norm]]);
    if (r.rows[0]) return r.rows[0].id;
  }
  // 2. Exact case-insensitive → id terkecil menang (ALL CAPS lebih dulu)
  const r1 = await client.query('SELECT id FROM unit_kerja_l1 WHERE nama ILIKE $1 ORDER BY id LIMIT 1', [raw.trim()]);
  if (r1.rows[0]) return r1.rows[0].id;
  // 3. Partial match → id terkecil menang
  const r2 = await client.query(
    "SELECT id FROM unit_kerja_l1 WHERE nama ILIKE '%' || $1 || '%' ORDER BY id LIMIT 1",
    [raw.trim()]
  );
  return r2.rows[0]?.id || null;
}

async function resolveL2(client, raw, l1Id) {
  if (!raw?.trim() || !l1Id) return null;
  // 1. Exact case-insensitive
  const r1 = await client.query('SELECT id FROM unit_kerja_l2 WHERE nama ILIKE $1 AND l1_id=$2 ORDER BY id LIMIT 1', [raw.trim(), l1Id]);
  if (r1.rows[0]) return r1.rows[0].id;
  // 2. Partial match
  const r2 = await client.query(
    "SELECT id FROM unit_kerja_l2 WHERE nama ILIKE '%' || $1 || '%' AND l1_id=$2 ORDER BY length(nama) LIMIT 1",
    [raw.trim(), l1Id]
  );
  return r2.rows[0]?.id || null;
}

app.post('/api/dokumen/import', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Data kosong atau tidak valid' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let ok = 0;
    const errs = [];
    const safeJenisList = ['Proses Bisnis', 'SOP', 'Standar Pelayanan'];

    for (const it of items) {
      if (!it.nama?.trim()) { errs.push('Baris tanpa nama dilewati'); continue; }
      try {
        // SAVEPOINT per baris: bila 1 baris gagal, hanya baris itu yang di-rollback; baris lain
        // tetap lanjut & tersimpan. Tanpa ini, 1 error mengaborsi seluruh transaksi ("current
        // transaction is aborted") sehingga semua baris berikutnya ikut gagal.
        await client.query('SAVEPOINT row_sp');
        const l1Id = await resolveL1(client, it.unitL1);
        if (!l1Id) throw new Error(`Unit L1 tidak ditemukan ("${it.unitL1 || 'kosong'}")`);
        const l2Id = await resolveL2(client, it.unitL2, l1Id);
        let l3Id = null;
        if (it.unitL3 && l2Id) {
          const r = await client.query('SELECT id FROM unit_kerja_l3 WHERE nama ILIKE $1 AND l2_id=$2 LIMIT 1', [it.unitL3.trim(), l2Id]);
          l3Id = r.rows[0]?.id || null;
        }
        await client.query(
          `INSERT INTO dokumen (nama,jenis,tahun,l1_id,l2_id,l3_id,link,sumber,status,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9)`,
          [it.nama.trim().slice(0, 500),
           safeJenisList.includes(it.jenis) ? it.jenis : 'Proses Bisnis',
           String(it.tahun || '2023'), l1Id, l2Id, l3Id,
           String(it.link || '').slice(0, 2000),
           String(it.sumber || '').slice(0, 1000),
           req.user.id]
        );
        await client.query('RELEASE SAVEPOINT row_sp');
        ok++;
      } catch (e) {
        try { await client.query('ROLLBACK TO SAVEPOINT row_sp'); await client.query('RELEASE SAVEPOINT row_sp'); } catch (_) { /* abaikan */ }
        errs.push(`"${(it.nama || '?').trim().slice(0, 60)}": ${e.message}`);
      }
    }

    await client.query('COMMIT');
    res.json({ imported: ok, errors: errs });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Global error logger — tangkap semua error yang tidak tertangani per-route
app.use((err, req, res, next) => {
  console.error(`[GLOBAL ERROR] ${req.method} ${req.path}:`, err.message, err.stack ? err.stack.split('\n')[1] : '');
  if (res.headersSent) return next(err); // respons sudah terkirim — jangan kirim lagi
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Jaring pengaman terakhir: Express 4 TIDAK menangkap rejection dari handler async.
// Tanpa ini, satu error DB pada handler tanpa try/catch mematikan proses (pm2 restart).
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason instanceof Error ? reason.stack : reason);
});

// START SERVER
initDatabase().then(() => {
  // Bind ke loopback saja: hanya nginx yang boleh menjangkau API ini.
  // Sebelumnya 0.0.0.0 — siapa pun di LAN/Tailscale bisa menembak API
  // langsung, melewati nginx, dan memalsukan header IP sehingga rate
  // limit (loginLimiter) lumpuh.
  app.listen(PORT, '127.0.0.1', () => console.log(`Server running on 127.0.0.1:${PORT}`));
});