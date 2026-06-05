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

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD || 'AtrBpn!2026',
  database: process.env.DB_NAME || 'e_sop_db',
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
        process_title VARCHAR(255) NOT NULL,
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
        process_title VARCHAR(255) NOT NULL,
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

app.delete('/api/users/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    await logAudit(req.user.id, req.user.username, 'DELETE_USER', 'users', id, null, req.ip);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AUTH ROUTES ============
app.post('/api/auth/login', async (req, res) => {
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
      { expiresIn: remember ? '120h' : '4h' }
    );
    
    const expiresAt = new Date(Date.now() + (remember ? 120 * 3600000 : 4 * 3600000));
    const sessionId = crypto.randomUUID();
    
    await pool.query(
      "INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id) DO UPDATE SET token = $3, expires_at = $4",
      [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent']]
    );
    
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
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

app.put('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
  await pool.query(
    "UPDATE dokumen SET nama=$1, jenis=$2, tahun=$3, l1_id=$4, l2_id=$5, l3_id=$6, link=$7, sumber=$8, updated_at=NOW() WHERE id=$9",
    [nama, jenis, tahun, l1_id, l2_id || null, l3_id || null, link, sumber, req.params.id]
  );
  res.json({ success: true });
});

app.delete('/api/dokumen/:id', authenticate, requireRole('admin'), async (req, res) => {
  await pool.query("DELETE FROM dokumen WHERE id = $1", [req.params.id]);
  res.json({ success: true });
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
          query += ` AND (u2.nama ILIKE $3 OR u2.nama IS NULL)`;
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
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
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
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.post('/api/bpmn/models', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, l1_id, l2_id, description } = req.body;
    const modelResult = await pool.query(
      `INSERT INTO bpmn_models (process_title, process_key, l1_id, l2_id, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING *`,
      [process_title, process_key, l1_id, l2_id || null, description || null, req.user.id]
    );
    res.json(modelResult.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.put('/api/bpmn/models/:id/save', authenticate, async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});

app.delete('/api/bpmn/models/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM bpmn_models WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Internal Server Error' }); }
});


// ==========================================================
// ============ SOP MODELS (STUDIO BARU ATR/BPN) ============ 
// ==========================================================
app.get('/api/sop/models', authenticate, async (req, res) => {
  try {
    const { id, role, unit_l1, unit_l2 } = req.user;
    
    let query = `
      SELECT s.*, u1.nama as unit_l1, u2.nama as unit_l2
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
          query += ` AND (u2.nama ILIKE $3 OR u2.nama IS NULL)`;
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

app.post('/api/sop/models', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, unit_l1, unit_l2, sop_data, status } = req.body;
    
    // Cari ID berdasarkan nama Unit Kerja yang dikirim Frontend
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
    
    const modelResult = await pool.query(
      `INSERT INTO sop_models (process_title, process_key, l1_id, l2_id, sop_data, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [process_title, process_key, final_l1, final_l2, sop_data || null, status || 'draft', req.user.id]
    );
    res.json(modelResult.rows[0]);
  } catch (err) {
    console.error(err);
    // Jika key duplicate
    if(err.code === '23505') {
       return res.status(400).json({ error: 'Nomor SOP ini sudah ada di database.' });
    }
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/api/sop/models/:id', authenticate, async (req, res) => {
  try {
    const { process_title, process_key, unit_l1, unit_l2, sop_data, status } = req.body;
    
    // Cari ID berdasarkan nama Unit Kerja yang dikirim Frontend
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
    
    const result = await pool.query(
      `UPDATE sop_models 
       SET process_title = $1, process_key = $2, l1_id = $3, l2_id = $4, 
           sop_data = $5, status = $6, updated_at = NOW(), version = version + 1
       WHERE id = $7 RETURNING *`,
      [process_title, process_key, final_l1, final_l2, sop_data || null, status || 'draft', req.params.id]
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
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.patch('/api/sop/models/status/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status, catatan } = req.body;
  if (!status) return res.status(400).json({ error: 'Status wajib diisi' });

  try {
    const result = await pool.query(
      'UPDATE sop_models SET status = $1, catatan = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, catatan || null, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'SOP Model tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error update status SOP:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// START SERVER
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});