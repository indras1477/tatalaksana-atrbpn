const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: __dirname + '/.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME || 'sop_atrbpn',
  password: process.env.DB_PASSWORD || 'AtrBpn!2026',
  database: process.env.DB_NAME || 'e_sop_db',
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    
    // Add unique constraints if not exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'roles_name_key'
        ) THEN
          ALTER TABLE roles ADD CONSTRAINT roles_name_key UNIQUE (name);
        END IF;
      END $$
    `);
    console.log('✓ roles constraint added');
    
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
        END IF;
      END $$
    `);
    console.log('✓ users username constraint added');
    
    // Create sessions table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        token TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(50),
        user_agent TEXT
      )
    `);
    console.log('✓ sessions table created');
    
    // Add last_login column if not exists
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP
    `);
    console.log('✓ last_login column added');
    
    // Add updated_at column to dokumen if not exists  
    await client.query(`
      ALTER TABLE dokumen ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✓ updated_at column added');
    
    // Ensure default roles exist
    await client.query(`
      INSERT INTO roles (name, description) VALUES 
      ('admin', 'Administrator - akses penuh'),
      ('viewer', 'Viewer - hanya lihat data')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('✓ roles seeded');
    
    // Ensure default admin user exists
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (username, password, nama_lengkap, role_id) 
      VALUES ('admin', $1, 'Administrator', 1)
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);
    console.log('✓ admin user seeded');
    
    console.log('\nMigration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();