const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

db.serialize(() => {
  // 1. Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default admin user
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const passHash = hashPassword(adminPass);

  db.get('SELECT * FROM users WHERE username = ?', [adminUser], (err, row) => {
    if (err) console.error(err);
    if (!row) {
      db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [adminUser, passHash], (err2) => {
        if (err2) console.error('Erro ao criar usuário admin padrão:', err2);
        else console.log('Usuário admin padrão criado.');
      });
    }
  });

  // 2. Clients table
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    reason TEXT,
    note TEXT,
    status TEXT DEFAULT 'PENDENTE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 3. Campaigns table
  db.run(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'INATIVA',
    calls_per_minute INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 2,
    start_hour TEXT DEFAULT '09:00',
    end_hour TEXT DEFAULT '18:00',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 4. Campaign Clients table
  db.run(`CREATE TABLE IF NOT EXISTS campaign_clients (
    campaign_id INTEGER,
    client_id INTEGER,
    status TEXT DEFAULT 'PENDENTE',
    attempts INTEGER DEFAULT 0,
    last_attempt_at DATETIME,
    PRIMARY KEY (campaign_id, client_id),
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  )`);

  // 5. Calls table
  db.run(`CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER,
    client_id INTEGER,
    phone TEXT NOT NULL,
    reason TEXT,
    status TEXT,
    digit TEXT,
    result TEXT,
    duration INTEGER DEFAULT 0,
    attempt INTEGER DEFAULT 1,
    asterisk_uniqueid TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  )`);
  db.run('ALTER TABLE calls ADD COLUMN reason TEXT', (err) => {
    if (!err) {
      console.log('Coluna reason adicionada em calls.');
      return;
    }

    if (!String(err.message || '').includes('duplicate column name')) {
      console.error('Erro ao garantir a coluna reason em calls:', err);
    }
  });

  // 6. Blacklist table
  db.run(`CREATE TABLE IF NOT EXISTS blacklist (
    phone TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 7. Settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed default settings from environment variables if not present
  const defaultKeys = [
    'SIP_HOST', 'SIP_DOMAIN', 'SIP_OUTBOUND_PROXY', 'SIP_PORT', 'SIP_POSSIBLE_PORTS', 
    'SIP_USERNAME', 'SIP_AUTH_USERNAME', 'SIP_PASSWORD', 'SIP_FROM_USER', 'SIP_TRANSPORT', 
    'SIP_STUN_ENABLED', 'SIP_TLS_ENABLED', 'CALLS_PER_MINUTE', 'MAX_ATTEMPTS', 
    'CALL_START_HOUR', 'CALL_END_HOUR', 'WHATSAPP_NUMBER', 'COMPANY_NAME', 
    'ASTERISK_AMI_HOST', 'ASTERISK_AMI_PORT', 'ASTERISK_AMI_USER', 'ASTERISK_AMI_PASSWORD',
    'CATALOG_BASE_URL',
    'GEMINI_API_KEY', 'GEMINI_MODEL',
    'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_VOICE_PRESET',
    'ELEVENLABS_VOICE_THIAGO_ID', 'ELEVENLABS_VOICE_FERNANDO_ID', 'ELEVENLABS_VOICE_ISABELA_ID',
    'ELEVENLABS_MODEL_ID', 'ELEVENLABS_OUTPUT_FORMAT',
    'ELEVENLABS_STABILITY', 'ELEVENLABS_SIMILARITY_BOOST', 'ELEVENLABS_STYLE', 'ELEVENLABS_SPEED',
    'ELEVENLABS_USE_SPEAKER_BOOST'
  ];

  defaultKeys.forEach(k => {
    db.get('SELECT * FROM settings WHERE key = ?', [k], (err, row) => {
      if (err) console.error(err);
      if (!row) {
        let val = process.env[k] || '';
        db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [k, val], (err2) => {
          if (err2) console.error(`Erro ao inserir setting ${k}:`, err2);
        });
      }
    });
  });

  // 8. SIP Diagnostics table
  db.run(`CREATE TABLE IF NOT EXISTS sip_diagnostics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT,
    port TEXT,
    transport TEXT,
    test_type TEXT,
    result TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('Banco de dados SQLite inicializado com sucesso.');
});

// Helper functions for settings
const settings = {
  get: (key) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.value : null);
      });
    });
  },
  getAll: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT key, value FROM settings', [], (err, rows) => {
        if (err) return reject(err);
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        resolve(map);
      });
    });
  },
  set: (key, value) => {
    return new Promise((resolve, reject) => {
      db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, value], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};

module.exports = {
  db,
  hashPassword,
  settings
};
