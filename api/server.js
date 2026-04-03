const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const SESSION_TIMEOUT = 120 * 60; // 120 menit dalam detik

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD || 'AtrBpn!2026',
  database: process.env.DB_NAME || 'e_sop_db',
});

// ============ VALIDATION ============
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
    if (rules.maxLength && value && value.length > rules.maxLength) {
      errors.push(`${field} maksimal ${rules.maxLength} karakter`);
    }
    if (rules.pattern && value && !rules.pattern.test(value)) {
      errors.push(`${field} format tidak valid`);
    }
  }
  return errors;
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>'";&]/g, '').substring(0, 1000);
};

// ============ DATABASE INIT ============
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
        active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS unit_kerja_l1 (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(255) NOT NULL,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true
      );
      
      CREATE TABLE IF NOT EXISTS unit_kerja_l2 (
        id SERIAL PRIMARY KEY,
        l1_id INTEGER REFERENCES unit_kerja_l1(id) ON DELETE CASCADE,
        nama VARCHAR(255) NOT NULL,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true
      );
      
      CREATE TABLE IF NOT EXISTS unit_kerja_l3 (
        id SERIAL PRIMARY KEY,
        l2_id INTEGER REFERENCES unit_kerja_l2(id) ON DELETE CASCADE,
        nama VARCHAR(255) NOT NULL,
        kode VARCHAR(50),
        aktif BOOLEAN DEFAULT true
      );
      
      CREATE TABLE IF NOT EXISTS dokumen (
        id SERIAL PRIMARY KEY,
        nama VARCHAR(255) NOT NULL,
        jenis VARCHAR(100),
        tahun VARCHAR(4),
        l1_id INTEGER REFERENCES unit_kerja_l1(id),
        l2_id INTEGER REFERENCES unit_kerja_l2(id),
        l3_id INTEGER REFERENCES unit_kerja_l3(id),
        link TEXT,
        sumber TEXT,
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
    `);

    const roles = await client.query("SELECT COUNT(*) FROM roles");
    if (parseInt(roles.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO roles (name, description) VALUES 
        ('admin', 'Administrator - akses penuh'),
        ('viewer', 'Viewer - hanya lihat data');
      `);
    }

    const users = await client.query("SELECT COUNT(*) FROM users WHERE username = 'admin'");
    if (parseInt(users.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (username, password, nama_lengkap, role_id) VALUES ($1, $2, $3, 1)",
        ['admin', hashedPassword, 'Administrator']
      );
    }

    console.log('Database initialized');
  } catch (err) {
    console.error('Init error:', err.message);
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
    
    // Check session still valid
    const session = await pool.query(
      "SELECT * FROM sessions WHERE user_id = $1 AND token = $2 AND expires_at > NOW()",
      [decoded.id, token]
    );
    if (session.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
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

// ============ AUTH ROUTES ============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, remember } = req.body;
    
    const errors = validateInput({ username, password }, {
      username: { required: true, minLength: 3, maxLength: 50 },
      password: { required: true, minLength: 4 }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    const result = await pool.query(
      "SELECT u.id, u.username, u.password, u.nama_lengkap, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1 AND u.active = true",
      [sanitizeString(username)]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: remember ? '120h' : '2h' }
    );
    
    // Save session
    const expiresAt = new Date(Date.now() + (remember ? 120 * 60 * 1000 : 2 * 60 * 60 * 1000));
    const sessionId = crypto.randomUUID();
    
    await pool.query(
      "INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET token = $3, expires_at = $4",
      [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]
    );
    
    // Update last login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
    
    res.json({ 
      token, 
      user: { id: user.id, username: user.username, nama_lengkap: user.nama_lengkap, role: user.role },
      expiresIn: remember ? 120 * 60 : 120
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM sessions WHERE user_id = $1 AND token = $2", [req.user.id, req.headers.authorization?.split(' ')[1]]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const errors = validateInput({ currentPassword, newPassword }, {
      currentPassword: { required: true, minLength: 4 },
      newPassword: { required: true, minLength: 6 }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    const user = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, user.rows[0].password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Password saat ini salah' });
    }
    
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, req.user.id]);
    
    // Logout from all devices
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [req.user.id]);
    
    res.json({ success: true, message: 'Password changed, please login again' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ USER MANAGEMENT ============
app.get('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.nama_lengkap, u.email, u.active, u.last_login, u.created_at, r.name as role 
      FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.username
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { username, password, nama_lengkap, email, role } = req.body;
    
    const errors = validateInput({ username, password }, {
      username: { required: true, minLength: 3, maxLength: 50 },
      password: { required: true, minLength: 6 },
      role: { required: true }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    
    const result = await pool.query(
      "INSERT INTO users (username, password, nama_lengkap, email, role_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, nama_lengkap, email",
      [sanitizeString(username), hashed, sanitizeString(nama_lengkap || ''), sanitizeString(email || ''), roleResult.rows[0]?.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username sudah digunakan' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nama_lengkap, email, role, active } = req.body;
    
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [role]);
    
    await pool.query(
      "UPDATE users SET nama_lengkap = $1, email = $2, role_id = $3, active = $4 WHERE id = $5",
      [sanitizeString(nama_lamplat || ''), sanitizeString(email || ''), roleResult.rows[0]?.id, active, id]
    );
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa hapus akun sendiri' });
    }
    
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HEALTH ============
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
});

// ============ UNIT KERJA ============
app.get('/api/unit-kerja/l1', authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM unit_kerja_l1 WHERE aktif = true ORDER BY nama");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unit-kerja/l1', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, kode } = req.body;
    const errors = validateInput({ nama }, { nama: { required: true, minLength: 2 } });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    const result = await pool.query(
      "INSERT INTO unit_kerja_l1 (nama, kode) VALUES ($1, $2) RETURNING *",
      [sanitizeString(nama), sanitizeString(kode || '')]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/unit-kerja/l1/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, kode, aktif } = req.body;
    await pool.query(
      "UPDATE unit_kerja_l1 SET nama = $1, kode = $2, aktif = $3 WHERE id = $4",
      [sanitizeString(nama), sanitizeString(kode || ''), aktif, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/unit-kerja/l1/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("UPDATE unit_kerja_l1 SET aktif = false WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unit-kerja/l2', authenticate, async (req, res) => {
  try {
    const { l1_id } = req.query;
    let query = "SELECT * FROM unit_kerja_l2 WHERE aktif = true";
    const params = [];
    if (l1_id) { query += " AND l1_id = $1"; params.push(l1_id); }
    query += " ORDER BY nama";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unit-kerja/l2', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, kode, l1_id } = req.body;
    const errors = validateInput({ nama, l1_id }, { nama: { required: true }, l1_id: { required: true } });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    const result = await pool.query(
      "INSERT INTO unit_kerja_l2 (nama, kode, l1_id) VALUES ($1, $2, $3) RETURNING *",
      [sanitizeString(nama), sanitizeString(kode || ''), l1_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unit-kerja/l3', authenticate, async (req, res) => {
  try {
    const { l2_id } = req.query;
    let query = "SELECT * FROM unit_kerja_l3 WHERE aktif = true";
    const params = [];
    if (l2_id) { query += " AND l2_id = $1"; params.push(l2_id); }
    query += " ORDER BY nama";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unit-kerja/l3', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, kode, l2_id } = req.body;
    const errors = validateInput({ nama, l2_id }, { nama: { required: true }, l2_id: { required: true } });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    const result = await pool.query(
      "INSERT INTO unit_kerja_l3 (nama, kode, l2_id) VALUES ($1, $2, $3) RETURNING *",
      [sanitizeString(nama), sanitizeString(kode || ''), l2_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DOKUMEN ============
app.get('/api/dokumen', authenticate, async (req, res) => {
  try {
    const { l1_id, l2_id, l3_id, jenis, tahun, search, page = 1 } = req.query;
    let query = `SELECT d.*, u1.nama as unit_l1, u2.nama as unit_l2, u3.nama as unit_l3, u.username as created_by_name
                 FROM dokumen d 
                 LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
                 LEFT JOIN unit_kerja_l2 u2 ON d.l2_id = u2.id
                 LEFT JOIN unit_kerja_l3 u3 ON d.l3_id = u3.id
                 LEFT JOIN users u ON d.created_by = u.id
                 WHERE 1=1`;
    const params = [];
    if (l1_id) { query += " AND d.l1_id = $" + (params.length + 1); params.push(l1_id); }
    if (l2_id) { query += " AND d.l2_id = $" + (params.length + 1); params.push(l2_id); }
    if (jenis && jenis !== 'Semua') { query += " AND d.jenis = $" + (params.length + 1); params.push(jenis); }
    if (tahun && tahun !== 'Semua') { query += " AND d.tahun = $" + (params.length + 1); params.push(tahun); }
    if (search) { query += " AND d.nama ILIKE $" + (params.length + 1); params.push('%' + search + '%'); }
    query += " ORDER BY d.created_at DESC LIMIT 50 OFFSET $" + (params.length + 1);
    params.push((page - 1) * 50);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dokumen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    const errors = validateInput({ nama, jenis }, { nama: { required: true, minLength: 3 }, jenis: { required: true } });
    if (errors.length > 0) return res.status(400).json({ error: errors.join(', ') });
    
    const result = await pool.query(
      `INSERT INTO dokumen (nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [sanitizeString(nama), sanitizeString(jenis), sanitizeString(tahun || ''), l1_id, l2_id, l3_id, sanitizeString(link || ''), sanitizeString(sumber || ''), req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    await pool.query(
      `UPDATE dokumen SET nama = $1, jenis = $2, tahun = $3, l1_id = $4, l2_id = $5, l3_id = $6, link = $7, sumber = $8, updated_at = NOW() WHERE id = $9`,
      [sanitizeString(nama), sanitizeString(jenis), sanitizeString(tahun || ''), l1_id, l2_id, l3_id, sanitizeString(link || ''), sanitizeString(sumber || ''), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await pool.query("DELETE FROM dokumen WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hierarchy', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l1.id as l1_id, l1.nama as l1_nama,
        l2.id as l2_id, l2.nama as l2_nama,
        l3.id as l3_id, l3.nama as l3_nama
      FROM unit_kerja_l1 l1
      LEFT JOIN unit_kerja_l2 l2 ON l2.l1_id = l1.id AND l2.aktif = true
      LEFT JOIN unit_kerja_l3 l3 ON l3.l2_id = l2.id AND l3.aktif = true
      WHERE l1.aktif = true
      ORDER BY l1.nama, l2.nama, l3.nama
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ START SERVER ============
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});