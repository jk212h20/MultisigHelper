const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize database
const db = new sqlite3.Database(path.join(__dirname, 'data.db'));

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
});

// XPub operations (promisified for async/await)
const xpubOperations = {
  // Get all xpubs
  getAll: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM xpubs ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get xpub by ID
  getById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM xpubs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Add new xpub
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

  // Update xpub label
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

  // Delete xpub
  delete: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM xpubs WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }
};

// PSBT operations
const psbtOperations = {
  // Get all PSBTs
  getAll: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM psbts ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get PSBT by ID
  getById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM psbts WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Create new PSBT
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

  // Update PSBT (when new signatures are added)
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

  // Update notes
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

  // Delete PSBT
  delete: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM psbts WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }
};

module.exports = {
  db,
  xpubOperations,
  psbtOperations
};
