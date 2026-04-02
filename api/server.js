const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: __dirname + '/.env' });

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'esop-secret-key-2026';

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD || 'AtrBpn!2026',
  database: process.env.DB_NAME || 'e_sop_db',
});

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      "SELECT u.id, u.username, u.password, u.nama_lengkap, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1 AND u.active = true",
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, nama_lengkap: user.nama_lengkap, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
});

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
    const result = await pool.query(
      "INSERT INTO unit_kerja_l1 (nama, kode) VALUES ($1, $2) RETURNING *",
      [nama, kode]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unit-kerja/l2', authenticate, async (req, res) => {
  try {
    const { l1_id } = req.query;
    let query = "SELECT * FROM unit_kerja_l2 WHERE aktif = true";
    const params = [];
    if (l1_id) {
      query += " AND l1_id = $1";
      params.push(l1_id);
    }
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
    const result = await pool.query(
      "INSERT INTO unit_kerja_l2 (nama, kode, l1_id) VALUES ($1, $2, $3) RETURNING *",
      [nama, kode, l1_id]
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
    if (l2_id) {
      query += " AND l2_id = $1";
      params.push(l2_id);
    }
    query += " ORDER BY nama";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dokumen', authenticate, async (req, res) => {
  try {
    const { l1_id, l2_id, l3_id, jenis, tahun } = req.query;
    let query = `SELECT d.*, u1.nama as unit_l1, u2.nama as unit_l2, u3.nama as unit_l3 
                 FROM dokumen d 
                 LEFT JOIN unit_kerja_l1 u1 ON d.l1_id = u1.id
                 LEFT JOIN unit_kerja_l2 u2 ON d.l2_id = u2.id
                 LEFT JOIN unit_kerja_l3 u3 ON d.l3_id = u3.id
                 WHERE 1=1`;
    const params = [];
    if (l1_id) { query += " AND d.l1_id = $1"; params.push(l1_id); }
    if (l2_id) { query += " AND d.l2_id = $2"; params.push(l2_id); }
    if (jenis && jenis !== 'Semua') { query += " AND d.jenis = $" + (params.length + 1); params.push(jenis); }
    if (tahun && tahun !== 'Semua') { query += " AND d.tahun = $" + (params.length + 1); params.push(tahun); }
    query += " ORDER BY d.created_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dokumen', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber } = req.body;
    const result = await pool.query(
      `INSERT INTO dokumen (nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nama, jenis, tahun, l1_id, l2_id, l3_id, link, sumber, req.user.id]
    );
    res.json(result.rows[0]);
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

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});