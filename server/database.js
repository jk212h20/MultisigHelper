const path = require('path');
const fs = require('fs');

// Determine if we should use PostgreSQL or SQLite
const usePostgres = !!process.env.DATABASE_URL;

let db;
let xpubOperations;
let psbtOperations;
let descriptorOperations;

if (usePostgres) {
  // PostgreSQL for production (Railway)
  const { Pool } = require('pg');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  console.log('Using PostgreSQL database');

  // Create tables
  const initPostgres = async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS xpubs (
          id SERIAL PRIMARY KEY,
          label TEXT NOT NULL,
          xpub TEXT NOT NULL UNIQUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS psbts (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          psbt_data TEXT NOT NULL,
          m_required INTEGER NOT NULL,
          n_total INTEGER NOT NULL,
          signatures_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS descriptors (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          descriptor TEXT NOT NULL,
          m_required INTEGER NOT NULL,
          n_total INTEGER NOT NULL,
          first_address TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      console.log('PostgreSQL tables initialized');
    } catch (error) {
      console.error('Error initializing PostgreSQL tables:', error);
    }
  };
  
  initPostgres();

  // XPub operations for PostgreSQL
  xpubOperations = {
    getAll: async () => {
      const result = await pool.query('SELECT * FROM xpubs ORDER BY created_at DESC');
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM xpubs WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (label, xpub) => {
      const result = await pool.query(
        'INSERT INTO xpubs (label, xpub) VALUES ($1, $2) RETURNING *',
        [label, xpub]
      );
      return result.rows[0];
    },

    updateLabel: async (id, label) => {
      const result = await pool.query(
        'UPDATE xpubs SET label = $1 WHERE id = $2 RETURNING *',
        [label, id]
      );
      return result.rows[0];
    },

    delete: async (id) => {
      const result = await pool.query('DELETE FROM xpubs WHERE id = $1', [id]);
      return result.rowCount > 0;
    }
  };

  // PSBT operations for PostgreSQL
  psbtOperations = {
    getAll: async () => {
      const result = await pool.query('SELECT * FROM psbts ORDER BY created_at DESC');
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM psbts WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (name, psbtData, mRequired, nTotal, signaturesCount, notes = null) => {
      const status = signaturesCount >= mRequired ? 'ready' : 'pending';
      const result = await pool.query(
        'INSERT INTO psbts (name, psbt_data, m_required, n_total, signatures_count, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [name, psbtData, mRequired, nTotal, signaturesCount, status, notes]
      );
      return result.rows[0];
    },

    update: async (id, psbtData, signaturesCount) => {
      const psbtResult = await pool.query('SELECT m_required FROM psbts WHERE id = $1', [id]);
      if (psbtResult.rows.length === 0) {
        throw new Error('PSBT not found');
      }
      const mRequired = psbtResult.rows[0].m_required;
      const status = signaturesCount >= mRequired ? 'ready' : 'pending';
      
      const result = await pool.query(
        'UPDATE psbts SET psbt_data = $1, signatures_count = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [psbtData, signaturesCount, status, id]
      );
      return result.rows[0];
    },

    updateNotes: async (id, notes) => {
      const result = await pool.query(
        'UPDATE psbts SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [notes, id]
      );
      return result.rows[0];
    },

    delete: async (id) => {
      const result = await pool.query('DELETE FROM psbts WHERE id = $1', [id]);
      return result.rowCount > 0;
    }
  };

  // Descriptor operations for PostgreSQL
  descriptorOperations = {
    getAll: async () => {
      const result = await pool.query('SELECT * FROM descriptors ORDER BY created_at DESC');
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM descriptors WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (name, descriptor, mRequired, nTotal, firstAddress) => {
      const result = await pool.query(
        'INSERT INTO descriptors (name, descriptor, m_required, n_total, first_address) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, descriptor, mRequired, nTotal, firstAddress]
      );
      return result.rows[0];
    },

    delete: async (id) => {
      const result = await pool.query('DELETE FROM descriptors WHERE id = $1', [id]);
      return result.rowCount > 0;
    }
  };

  db = pool;

} else {
  // SQLite for local development
  const sqlite3 = require('sqlite3').verbose();

  // Determine database path
  const getDbPath = () => {
    if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
      const dbDir = process.env.RAILWAY_VOLUME_MOUNT_PATH;
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      const dbPath = path.join(dbDir, 'data.db');
      console.log(`Using persistent SQLite database at: ${dbPath}`);
      return dbPath;
    }
    
    const dbPath = path.join(__dirname, 'data.db');
    console.log(`Using local SQLite database at: ${dbPath}`);
    return dbPath;
  };

  db = new sqlite3.Database(getDbPath());

  // Create tables
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS xpubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        xpub TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS psbts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        psbt_data TEXT NOT NULL,
        m_required INTEGER NOT NULL,
        n_total INTEGER NOT NULL,
        signatures_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS descriptors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        descriptor TEXT NOT NULL,
        m_required INTEGER NOT NULL,
        n_total INTEGER NOT NULL,
        first_address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  // XPub operations for SQLite (promisified for async/await)
  xpubOperations = {
    getAll: () => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM xpubs ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },

    getById: (id) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM xpubs WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },

    create: (label, xpub) => {
      return new Promise((resolve, reject) => {
        db.run('INSERT INTO xpubs (label, xpub) VALUES (?, ?)', [label, xpub], function(err) {
          if (err) reject(err);
          else {
            xpubOperations.getById(this.lastID).then(resolve).catch(reject);
          }
        });
      });
    },

    updateLabel: (id, label) => {
      return new Promise((resolve, reject) => {
        db.run('UPDATE xpubs SET label = ? WHERE id = ?', [label, id], (err) => {
          if (err) reject(err);
          else {
            xpubOperations.getById(id).then(resolve).catch(reject);
          }
        });
      });
    },

    delete: (id) => {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM xpubs WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    }
  };

  // PSBT operations for SQLite
  psbtOperations = {
    getAll: () => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM psbts ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },

    getById: (id) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM psbts WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },

    create: (name, psbtData, mRequired, nTotal, signaturesCount, notes = null) => {
      return new Promise((resolve, reject) => {
        const status = signaturesCount >= mRequired ? 'ready' : 'pending';
        db.run(
          'INSERT INTO psbts (name, psbt_data, m_required, n_total, signatures_count, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [name, psbtData, mRequired, nTotal, signaturesCount, status, notes],
          function(err) {
            if (err) reject(err);
            else {
              psbtOperations.getById(this.lastID).then(resolve).catch(reject);
            }
          }
        );
      });
    },

    update: (id, psbtData, signaturesCount) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT m_required FROM psbts WHERE id = ?', [id], (err, row) => {
          if (err) {
            reject(err);
          } else if (!row) {
            reject(new Error('PSBT not found'));
          } else {
            const status = signaturesCount >= row.m_required ? 'ready' : 'pending';
            db.run(
              'UPDATE psbts SET psbt_data = ?, signatures_count = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [psbtData, signaturesCount, status, id],
              (err) => {
                if (err) reject(err);
                else {
                  psbtOperations.getById(id).then(resolve).catch(reject);
                }
              }
            );
          }
        });
      });
    },

    updateNotes: (id, notes) => {
      return new Promise((resolve, reject) => {
        db.run('UPDATE psbts SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [notes, id], (err) => {
          if (err) reject(err);
          else {
            psbtOperations.getById(id).then(resolve).catch(reject);
          }
        });
      });
    },

    delete: (id) => {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM psbts WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    }
  };

  // Descriptor operations for SQLite
  descriptorOperations = {
    getAll: () => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM descriptors ORDER BY created_at DESC', [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },

    getById: (id) => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM descriptors WHERE id = ?', [id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },

    create: (name, descriptor, mRequired, nTotal, firstAddress) => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO descriptors (name, descriptor, m_required, n_total, first_address) VALUES (?, ?, ?, ?, ?)',
          [name, descriptor, mRequired, nTotal, firstAddress],
          function(err) {
            if (err) reject(err);
            else {
              descriptorOperations.getById(this.lastID).then(resolve).catch(reject);
            }
          }
        );
      });
    },

    delete: (id) => {
      return new Promise((resolve, reject) => {
        db.run('DELETE FROM descriptors WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        });
      });
    }
  };
}

module.exports = {
  db,
  xpubOperations,
  psbtOperations,
  descriptorOperations
};
