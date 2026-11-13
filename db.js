const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL || 'libsql://mdj-db-ict-mdjelebu.aws-ap-southeast-1.turso.io';
const authToken = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTQ1MzM4MzksImlkIjoiMDFhMWQyODgtYzAwMS03NWEwLWI0YWItZDQwNDc3ZTZhYzBlIiwia2lkIjoiV3JPZy0tMEdQUnJXZzQ2Vjhxc2RqcnU2bEVDbEFWUlZfQkV1LXVFMHVhQSIsInJpZCI6Ijk0ZDk5OWEzLTExNjUtNGVlYy04MWZkLWZlNzQ4NGE0OTYyMyJ9.2e4nQ2Y3tbXRsfd5zRoA5ed-OHbK_NIum6xBRwHbOvdXzMDc8CsfuI0NZQkAxsOMqFetczeGmDWwYC_EqIJ8AQ';

const client = createClient({
  url: url.startsWith('file:') ? url : (process.env.TURSO_DATABASE_URL || url),
  authToken: url.startsWith('file:') ? undefined : (process.env.TURSO_AUTH_TOKEN || authToken)
});

function normalizeArgs(params) {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params;
  return [params];
}

const db = {
  client,
  async all(sql, params = []) {
    const res = await client.execute({ sql, args: normalizeArgs(params) });
    return res.rows;
  },
  async get(sql, params = []) {
    const res = await client.execute({ sql, args: normalizeArgs(params) });
    return res.rows[0] || null;
  },
  async run(sql, params = []) {
    const res = await client.execute({ sql, args: normalizeArgs(params) });
    return {
      lastInsertRowid: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : null,
      changes: res.rowsAffected
    };
  },
  async exec(sql) {
    return await client.executeMultiple(sql);
  },
  prepare(sql) {
    return {
      async all(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return await db.all(sql, flatArgs);
      },
      async get(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return await db.get(sql, flatArgs);
      },
      async run(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return await db.run(sql, flatArgs);
      }
    };
  }
};

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFormattedNow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function initDb() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      phone TEXT,
      avatar TEXT,
      password TEXT DEFAULT '123456'
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_no TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      venue TEXT NOT NULL,
      assigned_to INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'baru',
      submitted_at TEXT,
      report_text TEXT,
      report_images TEXT,
      verified_at TEXT,
      verified_by INTEGER,
      verification_notes TEXT,
      verification_token TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_email TEXT NOT NULL,
      recipient_role TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      task_id INTEGER,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'terhantar'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Auto-migrate columns for YDP & SU ulasan if not present
  const migrations = [
    'ALTER TABLE tasks ADD COLUMN ydp_notes TEXT',
    'ALTER TABLE tasks ADD COLUMN ydp_noted_at TEXT',
    'ALTER TABLE tasks ADD COLUMN ydp_by INTEGER',
    'ALTER TABLE tasks ADD COLUMN su_notes TEXT',
    'ALTER TABLE tasks ADD COLUMN su_noted_at TEXT',
    'ALTER TABLE tasks ADD COLUMN su_by INTEGER'
  ];

  for (const sql of migrations) {
    try {
      await client.execute(sql);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  await seedMDJData();
}

async function seedMDJData() {
  const nowTime = getFormattedNow();

  // 1. Seed Initial Departments if none exist
  const deptCount = await db.get('SELECT COUNT(*) as c FROM departments');
  if (!deptCount || deptCount.c === 0) {
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Jabatan Landskap', nowTime]);
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Jabatan Kejuruteraan', nowTime]);
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Jabatan Penguatkuasaan & Kawalan', nowTime]);
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Pejabat Yang Dipertua', nowTime]);
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Pejabat Setiausaha', nowTime]);
    await db.run('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)', ['Bahagian Teknologi Maklumat & Pentadbiran', nowTime]);
  }

  // Helper to insert user only if email doesn't exist
  async function ensureUser(name, email, role, department, phone, avatar, password = '123456') {
    const existing = await db.get('SELECT id FROM users WHERE email = ?', email);
    if (!existing) {
      await db.run(
        'INSERT INTO users (name, email, role, department, phone, avatar, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, role, department, phone, avatar, password]
      );
    }
  }

  await ensureUser('Super Admin MDJ', 'superadmin@mdj.gov.my', 'superadmin', 'Bahagian Teknologi Maklumat & Pentadbiran', '06-6136200', 'admin.png', '123456');
  await ensureUser('Yang Dipertua (YDP) Majlis Daerah Jelebu', 'ydp@mdj.gov.my', 'ydp', 'Pejabat Yang Dipertua', '06-6136201', 'ydp.png', '123456');
  await ensureUser('Setiausaha (SU) Majlis Daerah Jelebu', 'setiausaha@mdj.gov.my', 'setiausaha', 'Pejabat Setiausaha', '06-6136202', 'su.png', '123456');
  await ensureUser('Ali bin Abu', 'ali@mdj.gov.my', 'ketua_bahagian', 'Jabatan Landskap', '012-7788990', 'kb_landskap.png', '123456');
  await ensureUser('Kamal bin Idris', 'kamal@mdj.gov.my', 'pegawai', 'Jabatan Landskap', '013-6655443', 'peg_landskap.png', '123456');
  await ensureUser('Ir. Ts. Mohd Zulkifli bin Hashim', 'kb.kejuruteraan@mdj.gov.my', 'ketua_bahagian', 'Jabatan Kejuruteraan', '012-3456789', 'kb1.png', '123456');
  await ensureUser('Pn. Noraini binti Kamaruddin', 'noraini@mdj.gov.my', 'ketua_bahagian', 'Jabatan Penguatkuasaan & Kawalan', '019-1234567', 'kb2.png', '123456');
  await ensureUser('Ahmad Farhan bin Roslan', 'farhan@mdj.gov.my', 'pegawai', 'Jabatan Kejuruteraan', '011-2233445', 'peg1.png', '123456');
  await ensureUser('Muhammad Danial bin Razak', 'danial@mdj.gov.my', 'pegawai', 'Jabatan Kejuruteraan', '017-9988776', 'peg2.png', '123456');
  await ensureUser('Siti Nurhaliza binti Ishak', 'siti@mdj.gov.my', 'pegawai', 'Jabatan Penguatkuasaan & Kawalan', '018-5544332', 'peg3.png', '123456');

  console.log('Pangkalan data MDJ & peranan Setiausaha berjaya dimuatkan (Turso Cloud / SQLite).');
}

module.exports = {
  db,
  initDb,
  getTodayString,
  getFormattedNow,
  getDateOffset
};
