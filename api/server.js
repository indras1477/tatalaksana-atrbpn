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

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://tlrb.ortalamr.id';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

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
  max: 10,
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

    // MIGRASI KOLOM UNIT KERJA KE TABEL USER
    await client.query(`
      DO $$
      BEGIN
        BEGIN
            ALTER TABLE users ADD COLUMN unit_l1 VARCHAR(255);
        EXCEPTION WHEN duplicate_column THEN NULL; END;
        BEGIN
            ALTER TABLE users ADD COLUMN unit_l2 VARCHAR(255);
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

    // MIGRASI: tambah UNIQUE constraint pada sessions.user_id agar ON CONFLICT (user_id) berfungsi
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_key'
        ) THEN
          ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_key UNIQUE (user_id);
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
        ('admin', 'Administrator - akses penuh'),
        ('user', 'User - akses terbatas unit'),
        ('viewer', 'Viewer - hanya lihat data');
      `);
    }

    const usersCount = await client.query("SELECT COUNT(*) FROM users WHERE username = 'admin'");
    if (parseInt(usersCount.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (username, password, nama_lengkap, role_id, unit_l1, unit_l2) VALUES ($1, $2, $3, 1, 'PUSAT', 'SELURUH UNIT')",
        ['admin', hashedPassword, 'Administrator']
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

const logAudit = async (userId, username, action, resource, resourceId, detail, ip) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, username, action, resource, resource_id, detail, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [userId, username, action, resource, resourceId || null, detail || null, ip || null]
    );
  } catch (err) { console.error('Audit log error:', err.message); }
};

// ============ USER MANAGEMENT ROUTES ============
app.get('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama_lengkap, u.email, u.active, u.unit_l1, u.unit_l2, u.last_login, r.name as role
      FROM users u
      JOIN roles r ON u.role_id = r.id
      ORDER BY u.id ASC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  const { username, password, nama_lengkap, email, role, unit_l1, unit_l2 } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    const roleId = roleResult.rows[0]?.id || 2;

    const result = await pool.query(
      `INSERT INTO users (username, password, nama_lengkap, email, role_id, unit_l1, unit_l2)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username`,
      [username, hashedPassword, nama_lengkap, email, roleId, unit_l1, unit_l2]
    );
    
    await logAudit(req.user.id, req.user.username, 'CREATE_USER', 'users', result.rows[0].id, `User ${username} created`, req.ip);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { username, password, nama_lengkap, email, role, unit_l1, unit_l2, active } = req.body;
  
  try {
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    const roleId = roleResult.rows[0]?.id || 2;

    let result;
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE users SET username=$1, password=$2, nama_lengkap=$3, email=$4, role_id=$5, unit_l1=$6, unit_l2=$7, active=$8
         WHERE id=$9 RETURNING id`,
        [username, hashedPassword, nama_lengkap, email, roleId, unit_l1, unit_l2, active, id]
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

app.delete('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
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

// ============ AUTH ROUTES ============
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    const errors = validateInput({ username, password }, {
      username: { required: true, minLength: 3 },
      password: { required: true, minLength: 4 }
    });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });

    const result = await pool.query(
      `SELECT u.id, u.username, u.password, u.nama_lengkap, u.unit_l1, u.unit_l2, r.name as role 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.username = $1 AND u.active = true`,
      [sanitizeString(username)]
    );
    
    if (result.rows.length === 0) return res.status(401).json({ error: 'User tidak ditemukan' });
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Password salah' });
    
    const userRole = user.role || 'viewer';
    const token = jwt.sign(
      { id: user.id, username: user.username, role: userRole, unit_l1: user.unit_l1, unit_l2: user.unit_l2 },
      JWT_SECRET,
      { expiresIn: remember ? '120h' : '8h' }
    );

    const expiresAt = new Date(Date.now() + (remember ? 120 * 3600000 : 8 * 3600000));
    const sessionId = crypto.randomUUID();

    const loginClient = await pool.connect();
    try {
      await loginClient.query('BEGIN');
      await loginClient.query("DELETE FROM sessions WHERE expires_at < NOW()");
      await loginClient.query(
        `INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE
           SET id = $1, token = $3, expires_at = $4, ip_address = $5, user_agent = $6`,
        [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]
      );
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [req.user.id]);
  res.json({ success: true });
});

app.get('/api/auth/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ============ UNIT KERJA ROUTES ============
app.get('/api/unit-kerja/l1', authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM unit_kerja_l1 WHERE aktif = true ORDER BY nama");
  res.json(result.rows);
});

app.get('/api/unit-kerja/l2', authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM unit_kerja_l2 WHERE aktif = true ORDER BY nama");
  res.json(result.rows);
});

app.get('/api/unit-kerja/l3', authenticate, async (req, res) => {
  const result = await pool.query("SELECT * FROM unit_kerja_l3 WHERE aktif = true ORDER BY nama");
  res.json(result.rows);
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
      body: JSON.stringify({ client_id: 'simpel-esop', client_secret: '7ad55d9ae5633b9c4a589aef903417cc125796625a562ffe4df86dfb6ce4dafe' })
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
app.post('/api/unit-kerja/sync', authenticate, requireRole('admin'), async (req, res) => {
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
  const result = await pool.query(`
    SELECT d.*, u1.nama as unit_l1, u2.nama as unit_l2, u3.nama as unit_l3 
    FROM dokumen d 
    LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
    LEFT JOIN unit_kerja_l2 u2 ON d.l2_id = u2.id
    LEFT JOIN unit_kerja_l3 u3 ON d.l3_id = u3.id
    ORDER BY d.created_at DESC`);
  res.json(result.rows);
});

app.post('/api/dokumen', authenticate, requireRole('admin'), async (req, res) => {
  const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
  const result = await pool.query(
    "INSERT INTO dokumen (nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
    [nama, jenis, tahun, l1_id, l2_id || null, l3_id || null, link, sumber, req.user.id]
  );
  res.json(result.rows[0]);
});

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
  const link = type === 'bpmn'
    ? `/bpmn?id=${row.id}&mode=view`
    : `/e-sop-atrbpn/sop/studio?id=${row.id}&mode=view`;
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

app.put('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    await pool.query(
      "UPDATE dokumen SET nama=$1, jenis=$2, tahun=$3, l1_id=$4, l2_id=$5, l3_id=$6, link=$7, sumber=$8, updated_at=NOW() WHERE id=$9",
      [nama, jenis, tahun, l1_id, l2_id || null, l3_id || null, link, sumber, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM dokumen WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/dokumen/:id/status', authenticate, requireRole('admin'), async (req, res) => {
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
app.get('/api/bpmn/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    let query = `
      SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
      FROM bpmn_models m
      LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
    `;
    const params = [];
    if (role !== 'admin') {
      query += ` WHERE (m.created_by = $1`;
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

app.get('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
      FROM bpmn_models m
      LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
      WHERE m.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.post('/api/bpmn/models', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, l1_id, l2_id, description, jenis_proses, klasifikasi_proses, bpmn_xml, svg_xml } = req.body;
    const modelResult = await pool.query(
      `INSERT INTO bpmn_models (process_title, process_key, l1_id, l2_id, description, jenis_proses, klasifikasi_proses, status, created_by, bpmn_xml, svg_xml)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10) RETURNING *`,
      [process_title, process_key || null, l1_id, l2_id || null, description || null,
       jenis_proses || null, klasifikasi_proses || null, req.user.id, bpmn_xml || null, svg_xml || null]
    );
    const full = await pool.query(
      `SELECT m.*, u1.nama as unit_l1, u2.nama as unit_l2
       FROM bpmn_models m
       LEFT JOIN unit_kerja_l1 u1 ON m.l1_id = u1.id
       LEFT JOIN unit_kerja_l2 u2 ON m.l2_id = u2.id
       WHERE m.id = $1`,
      [modelResult.rows[0].id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.put('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    const lockChk = await pool.query('SELECT status FROM bpmn_models WHERE id = $1', [req.params.id]);
    if (lockChk.rows.length > 0 && ['penetapan', 'approved'].includes(lockChk.rows[0].status)) {
      return res.status(403).json({ error: 'Proses Bisnis terkunci (penetapan/ditetapkan). Buat salinan untuk merevisi.' });
    }
    const { process_title, process_key, l1_id, l2_id, description, bpmn_xml, svg_xml, status, jenis_proses, klasifikasi_proses } = req.body;
    const result = await pool.query(
      `UPDATE bpmn_models
       SET process_title = $1, process_key = $2, l1_id = $3, l2_id = $4, description = $5,
           bpmn_xml = $6, svg_xml = $7, status = $8::varchar,
           jenis_proses = $9, klasifikasi_proses = $10,
           updated_at = NOW(), version = version + 1,
           catatan = CASE WHEN $8::varchar IN ('draft', 'pending') THEN NULL ELSE catatan END
       WHERE id = $11
       RETURNING *`,
      [process_title, process_key || null, l1_id || null, l2_id || null, description || null,
       bpmn_xml, svg_xml, status || 'draft',
       jenis_proses || null, klasifikasi_proses || null, req.params.id]
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
    res.json(full.rows[0]);
  } catch (err) { console.error('PUT /bpmn/models/:id error:', err.message, err.detail || ''); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.put('/api/bpmn/models/:id/save', authenticate, async (req, res) => {
  try {
    const lockChk = await pool.query('SELECT status FROM bpmn_models WHERE id = $1', [req.params.id]);
    if (lockChk.rows.length > 0 && ['penetapan', 'approved'].includes(lockChk.rows[0].status)) {
      return res.status(403).json({ error: 'Proses Bisnis terkunci (penetapan/ditetapkan). Buat salinan untuk merevisi.' });
    }
    const { bpmn_xml, svg_xml, status } = req.body;
    const result = await pool.query(
      `UPDATE bpmn_models 
       SET bpmn_xml = $1, svg_xml = $2, status = $3, updated_at = NOW(),
           version = version + 1,
           catatan = CASE WHEN $3 IN ('draft', 'pending') THEN NULL ELSE catatan END
       WHERE id = $4 RETURNING *`,
      [bpmn_xml, svg_xml, status || 'draft', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.delete('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM bpmn_models WHERE id = $1', [req.params.id]);
    await removeDokumenForModel('bpmn', req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('[ROUTE ERROR]', req.method, req.path, err.message); res.status(500).json({ error: err.message || 'Internal Server Error' }); }
});

app.patch('/api/bpmn/models/status/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan, penetapan_dasar, penetapan_tanggal } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });
  try {
    const result = await pool.query(
      `UPDATE bpmn_models SET status = $1::varchar, catatan = $2, updated_at = NOW(),
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
    res.json(result.rows[0]);
  } catch (err) { console.error('Error update status BPMN:', err); res.status(500).json({ error: 'Internal Server Error' }); }
});

app.patch('/api/bpmn/models/:id/meta', authenticate, async (req, res) => {
  const { id } = req.params;
  const { process_title, jenis_proses, klasifikasi_proses } = req.body;
  if (!process_title || !process_title.trim()) return res.status(400).json({ error: 'Judul tidak boleh kosong' });
  try {
    // Terkunci setelah masuk penetapan/ditetapkan.
    const cur = await pool.query('SELECT status FROM bpmn_models WHERE id = $1', [id]);
    if (cur.rows.length > 0 && ['penetapan', 'approved'].includes(cur.rows[0].status)) {
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
    const src = await pool.query('SELECT * FROM bpmn_models WHERE id = $1', [id]);
    if (src.rows.length === 0) return res.status(404).json({ error: 'Model tidak ditemukan' });
    const s = src.rows[0];
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
// ============ SOP MODELS (STUDIO BARU ATR/BPN) ============ 
// ==========================================================
app.get('/api/sop/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    
    let query = `
      SELECT s.*, u1.nama as unit_l1, u2.nama as unit_l2,
             EXISTS(SELECT 1 FROM sop_covers c WHERE c.sop_id = s.id) AS has_cover
      FROM sop_models s
      LEFT JOIN unit_kerja_l1 u1 ON s.l1_id = u1.id
      LEFT JOIN unit_kerja_l2 u2 ON s.l2_id = u2.id
    `;
    
    const params = [];
    
    if (role !== 'admin') {
      query += ` WHERE (s.created_by = $1`;
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
    const result = await pool.query(`
      SELECT s.*, u1.nama as unit_l1, u2.nama as unit_l2
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

const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak permintaan PDF. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Merender halaman studio (mode view) memakai mesin cetak Chromium pada ukuran F4 persis,
// menghasilkan PDF VEKTOR (teks bisa diseleksi) yang diunduh langsung — tanpa dialog cetak.
const PDF_BASE_URL = process.env.PDF_BASE_URL || 'https://tlrb.ortalamr.id/e-sop-atrbpn';
app.get('/api/sop/models/:id/pdf', pdfLimiter, authenticate, async (req, res) => {
  const { id } = req.params;
  const token = (req.headers.authorization || '').split(' ')[1];
  let browser;
  let semaphoreAcquired = false;
  try {
    const chk = await pool.query('SELECT process_title FROM sop_models WHERE id = $1', [id]);
    if (chk.rows.length === 0) return res.status(404).json({ error: 'SOP tidak ditemukan' });

    await _pdfSemaphore.acquire();
    semaphoreAcquired = true;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // Sisipkan token sebelum skrip app jalan agar halaman studio bisa memuat data (baca localStorage).
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('token', t); } catch (e) {} }, token);
    await page.goto(`${PDF_BASE_URL}/sop/studio?id=${id}&mode=view`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.print-page-target', { timeout: 30000 });
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
    res.setHeader('Content-Type', 'application/pdf');
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

    let final_l1 = null;
    let final_l2 = null;

    if (unit_l1) {
      const r1 = await pool.query('SELECT id FROM unit_kerja_l1 WHERE nama = $1', [unit_l1]);
      if (r1.rows.length > 0) final_l1 = r1.rows[0].id;
    }
    if (unit_l2 && final_l1) {
      const r2 = await pool.query('SELECT id FROM unit_kerja_l2 WHERE nama = $1 AND l1_id = $2', [unit_l2, final_l1]);
      if (r2.rows.length > 0) final_l2 = r2.rows[0].id;
    }

    const finalKey = process_key && process_key.trim() ? process_key.trim() : null;

    const modelResult = await pool.query(
      `INSERT INTO sop_models (process_title, process_key, l1_id, l2_id, sop_data, status, jenis_proses, klasifikasi_proses, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [process_title, finalKey, final_l1, final_l2, sop_data || null, status || 'draft',
       jenis_proses || null, klasifikasi_proses || null, req.user.id]
    );
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
    const cur = await pool.query('SELECT status FROM sop_models WHERE id = $1', [req.params.id]);
    if (cur.rows.length > 0 && ['verifikasi', 'penetapan', 'terbit'].includes(cur.rows[0].status)) {
      return res.status(403).json({ error: 'SOP terkunci (menunggu verifikasi/penetapan atau sudah terbit). Buat salinan untuk merevisi.' });
    }

    let final_l1 = null;
    let final_l2 = null;

    if (unit_l1) {
      const r1 = await pool.query('SELECT id FROM unit_kerja_l1 WHERE nama = $1', [unit_l1]);
      if (r1.rows.length > 0) final_l1 = r1.rows[0].id;
    }
    if (unit_l2 && final_l1) {
      const r2 = await pool.query('SELECT id FROM unit_kerja_l2 WHERE nama = $1 AND l1_id = $2', [unit_l2, final_l1]);
      if (r2.rows.length > 0) final_l2 = r2.rows[0].id;
    }

    const finalKey = process_key && process_key.trim() ? process_key.trim() : null;

    // Jika status tidak dikirim (mis. saat simpan-untuk-ekspor PDF), pertahankan status lama
    // agar dokumen yang sudah 'pending' tidak turun jadi 'draft'.
    const statusParam = (typeof status === 'string' && status) ? status : null;

    const result = await pool.query(
      `UPDATE sop_models
       SET process_title = $1, process_key = $2, l1_id = $3, l2_id = $4,
           sop_data = $5, status = COALESCE($6, status), jenis_proses = $7, klasifikasi_proses = $8,
           updated_at = NOW(), version = version + 1
       WHERE id = $9 RETURNING *`,
      [process_title, finalKey, final_l1, final_l2, sop_data || null, statusParam,
       jenis_proses || null, klasifikasi_proses || null, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Model not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.delete('/api/sop/models/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM sop_models WHERE id = $1', [req.params.id]);
    await removeDokumenForModel('sop', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.patch('/api/sop/models/status/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan, penetapan_dasar, penetapan_tanggal } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });

  try {
    const result = await pool.query(
      `UPDATE sop_models SET status = $1, catatan = $2, updated_at = NOW(),
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
    const chk = await pool.query('SELECT id, created_by, status, sop_data, l1_id FROM sop_models WHERE id = $1', [id]);
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
    if (req.user.role !== 'admin' && !isOwner && !unitMatch) {
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
      INSERT INTO sop_covers (sop_id, data, filename, mime, uploaded_by, uploaded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (sop_id) DO UPDATE
        SET data = EXCLUDED.data, filename = EXCLUDED.filename, mime = EXCLUDED.mime,
            uploaded_by = EXCLUDED.uploaded_by, uploaded_at = NOW()
    `, [id, cover, (filename || 'cover-sop.pdf').slice(0, 255), mime, req.user.id]);

    // Cover masuk → status 'verifikasi' (menunggu admin memeriksa TTD & nomor SOP). Belum terbit,
    // belum masuk registry Dashboard — itu terjadi saat admin menyetujui (status → 'terbit').
    await pool.query("UPDATE sop_models SET status = 'verifikasi', updated_at = NOW() WHERE id = $1", [id]);
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
    const cur = await pool.query('SELECT status FROM sop_models WHERE id = $1', [id]);
    if (cur.rows.length > 0 && ['verifikasi', 'penetapan', 'terbit'].includes(cur.rows[0].status)) {
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
    const src = await pool.query('SELECT * FROM sop_models WHERE id = $1', [id]);
    if (src.rows.length === 0) return res.status(404).json({ error: 'Model tidak ditemukan' });
    const s = src.rows[0];
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
      `SELECT s.*, u1.nama as unit_l1, u2.nama as unit_l2
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
app.get('/api/peraturan/drive-files', authenticate, requireRole('admin'), async (req, res) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_DRIVE_API_KEY belum dikonfigurasi di api/.env' });
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q=%27${folderId}%27+in+parents+and+trashed%3Dfalse&fields=files(id,name,webViewLink,mimeType)&orderBy=name&pageSize=200&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Gagal mengambil file dari Drive' });
    const files = (data.files || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    res.json(files);
  } catch (err) {
    console.error('Drive files error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// ============ DOKUMEN DRIVE BROWSER ============
app.get('/api/dokumen/drive-browse', authenticate, requireRole('admin'), async (req, res) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  const folderId = req.query.folderId || '1T4dQCI3CJYLOEJOCmC18Lsa9jjFRmGDP';
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_DRIVE_API_KEY belum dikonfigurasi di api/.env' });
  try {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('files(id,name,webViewLink,mimeType)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=name&pageSize=500&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: data.error?.message || 'Gagal mengambil file dari Drive' });
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

app.post('/api/peraturan', authenticate, requireRole('admin'), async (req, res) => {
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

app.put('/api/peraturan/:id', authenticate, requireRole('admin'), async (req, res) => {
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

app.delete('/api/peraturan/:id', authenticate, requireRole('admin'), async (req, res) => {
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
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
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

app.get('/api/dokumen/crawl-probis', authenticate, requireRole('admin'), async (req, res) => {
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

app.post('/api/dokumen/import', authenticate, requireRole('admin'), async (req, res) => {
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
app.use((err, req, res, _next) => {
  console.error(`[GLOBAL ERROR] ${req.method} ${req.path}:`, err.message, err.stack ? err.stack.split('\n')[1] : '');
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// START SERVER
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});