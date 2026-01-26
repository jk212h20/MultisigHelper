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
          xpub TEXT NOT NULL,
          session_id TEXT DEFAULT '0',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(xpub, session_id)
        )
      `);
      
      // Add session_id column if it doesn't exist (migration for existing tables)
      await pool.query(`
        ALTER TABLE xpubs ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT '0'
      `).catch(() => {});
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS psbts (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          psbt_data TEXT NOT NULL,
          m_required INTEGER NOT NULL,
          n_total INTEGER NOT NULL,
          signatures_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          txid TEXT,
          confirmations INTEGER DEFAULT 0,
          notes TEXT,
          session_id TEXT DEFAULT '0',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Add session_id column if it doesn't exist (migration for existing tables)
      await pool.query(`
        ALTER TABLE psbts ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT '0'
      `).catch(() => {});
      
      // Add txid and confirmations columns (migration for existing tables)
      await pool.query(`
        ALTER TABLE psbts ADD COLUMN IF NOT EXISTS txid TEXT
      `).catch(() => {});
      await pool.query(`
        ALTER TABLE psbts ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 0
      `).catch(() => {});
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS descriptors (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          descriptor TEXT NOT NULL,
          m_required INTEGER NOT NULL,
          n_total INTEGER NOT NULL,
          first_address TEXT,
          session_id TEXT DEFAULT '0',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Add session_id column if it doesn't exist (migration for existing tables)
      await pool.query(`
        ALTER TABLE descriptors ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT '0'
      `).catch(() => {});
      
      console.log('PostgreSQL tables initialized');
    } catch (error) {
      console.error('Error initializing PostgreSQL tables:', error);
    }
  };
  
  initPostgres();

  // XPub operations for PostgreSQL
  xpubOperations = {
    getAll: async (sessionId = '0') => {
      const result = await pool.query(
        'SELECT * FROM xpubs WHERE session_id = $1 ORDER BY created_at DESC',
        [sessionId]
      );
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM xpubs WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (label, xpub, sessionId = '0') => {
      const result = await pool.query(
        'INSERT INTO xpubs (label, xpub, session_id) VALUES ($1, $2, $3) RETURNING *',
        [label, xpub, sessionId]
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
    getAll: async (sessionId = '0') => {
      const result = await pool.query(
        'SELECT * FROM psbts WHERE session_id = $1 ORDER BY created_at DESC',
        [sessionId]
      );
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM psbts WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (name, psbtData, mRequired, nTotal, signaturesCount, notes = null, sessionId = '0') => {
      const status = signaturesCount >= mRequired ? 'ready' : 'pending';
      const result = await pool.query(
        'INSERT INTO psbts (name, psbt_data, m_required, n_total, signatures_count, status, notes, session_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [name, psbtData, mRequired, nTotal, signaturesCount, status, notes, sessionId]
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
    },

    updateBroadcastStatus: async (id, txid, status, confirmations) => {
      const result = await pool.query(
        'UPDATE psbts SET txid = $1, status = $2, confirmations = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
        [txid, status, confirmations, id]
      );
      return result.rows[0];
    },

    // Get PSBTs that need confirmation checking (broadcast but not final)
    getPendingConfirmations: async () => {
      const result = await pool.query(
        "SELECT * FROM psbts WHERE status LIKE 'broadcast%' AND status != 'final' AND txid IS NOT NULL"
      );
      return result.rows;
    }
  };

  // Descriptor operations for PostgreSQL
  descriptorOperations = {
    getAll: async (sessionId = '0') => {
      const result = await pool.query(
        'SELECT * FROM descriptors WHERE session_id = $1 ORDER BY created_at DESC',
        [sessionId]
      );
      return result.rows;
    },

    getById: async (id) => {
      const result = await pool.query('SELECT * FROM descriptors WHERE id = $1', [id]);
      return result.rows[0];
    },

    create: async (name, descriptor, mRequired, nTotal, firstAddress, sessionId = '0') => {
      const result = await pool.query(
        'INSERT INTO descriptors (name, descriptor, m_required, n_total, first_address, session_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [name, descriptor, mRequired, nTotal, firstAddress, sessionId]
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

  // Create tables with session support
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS xpubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        xpub TEXT NOT NULL,
        session_id TEXT DEFAULT '0',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(xpub, session_id)
      )
    `);
    
    // Migration: Add session_id column if it doesn't exist
    db.run(`ALTER TABLE xpubs ADD COLUMN session_id TEXT DEFAULT '0'`, (err) => {
      // Ignore error if column already exists
    });
    
    db.run(`
      CREATE TABLE IF NOT EXISTS psbts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        psbt_data TEXT NOT NULL,
        m_required INTEGER NOT NULL,
        n_total INTEGER NOT NULL,
        signatures_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        txid TEXT,
        confirmations INTEGER DEFAULT 0,
        notes TEXT,
        session_id TEXT DEFAULT '0',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migration: Add session_id column if it doesn't exist
    db.run(`ALTER TABLE psbts ADD COLUMN session_id TEXT DEFAULT '0'`, (err) => {
      // Ignore error if column already exists
    });
    
    // Migration: Add txid and confirmations columns if they don't exist
    db.run(`ALTER TABLE psbts ADD COLUMN txid TEXT`, (err) => {
      // Ignore error if column already exists
    });
    db.run(`ALTER TABLE psbts ADD COLUMN confirmations INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });
    
    db.run(`
      CREATE TABLE IF NOT EXISTS descriptors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        descriptor TEXT NOT NULL,
        m_required INTEGER NOT NULL,
        n_total INTEGER NOT NULL,
        first_address TEXT,
        session_id TEXT DEFAULT '0',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migration: Add session_id column if it doesn't exist
    db.run(`ALTER TABLE descriptors ADD COLUMN session_id TEXT DEFAULT '0'`, (err) => {
      // Ignore error if column already exists
    });
  });

  // XPub operations for SQLite (promisified for async/await)
  xpubOperations = {
    getAll: (sessionId = '0') => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM xpubs WHERE session_id = ? ORDER BY created_at DESC', [sessionId], (err, rows) => {
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

    create: (label, xpub, sessionId = '0') => {
      return new Promise((resolve, reject) => {
        db.run('INSERT INTO xpubs (label, xpub, session_id) VALUES (?, ?, ?)', [label, xpub, sessionId], function(err) {
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
    getAll: (sessionId = '0') => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM psbts WHERE session_id = ? ORDER BY created_at DESC', [sessionId], (err, rows) => {
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

    create: (name, psbtData, mRequired, nTotal, signaturesCount, notes = null, sessionId = '0') => {
      return new Promise((resolve, reject) => {
        const status = signaturesCount >= mRequired ? 'ready' : 'pending';
        db.run(
          'INSERT INTO psbts (name, psbt_data, m_required, n_total, signatures_count, status, notes, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [name, psbtData, mRequired, nTotal, signaturesCount, status, notes, sessionId],
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
    },

    updateBroadcastStatus: (id, txid, status, confirmations) => {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE psbts SET txid = ?, status = ?, confirmations = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [txid, status, confirmations, id],
          (err) => {
            if (err) reject(err);
            else {
              psbtOperations.getById(id).then(resolve).catch(reject);
            }
          }
        );
      });
    },

    // Get PSBTs that need confirmation checking (broadcast but not final)
    getPendingConfirmations: () => {
      return new Promise((resolve, reject) => {
        db.all(
          "SELECT * FROM psbts WHERE status LIKE 'broadcast%' AND status != 'final' AND txid IS NOT NULL",
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
    }
  };

  // Descriptor operations for SQLite
  descriptorOperations = {
    getAll: (sessionId = '0') => {
      return new Promise((resolve, reject) => {
        db.all('SELECT * FROM descriptors WHERE session_id = ? ORDER BY created_at DESC', [sessionId], (err, rows) => {
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

    create: (name, descriptor, mRequired, nTotal, firstAddress, sessionId = '0') => {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO descriptors (name, descriptor, m_required, n_total, first_address, session_id) VALUES (?, ?, ?, ?, ?, ?)',
          [name, descriptor, mRequired, nTotal, firstAddress, sessionId],
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
