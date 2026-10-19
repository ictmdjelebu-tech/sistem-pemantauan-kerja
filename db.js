const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL, -- 'superadmin', 'ydp', 'setiausaha', 'ketua_bahagian', 'pegawai'
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
      deadline TEXT NOT NULL, -- YYYY-MM-DD
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'baru', -- 'baru', 'dihantar', 'disahkan'
      submitted_at TEXT,
      report_text TEXT,
      report_images TEXT, -- JSON string array
      verified_at TEXT,
      verified_by INTEGER,
      verification_notes TEXT,
      verification_token TEXT UNIQUE,
      FOREIGN KEY (assigned_to) REFERENCES users (id),
      FOREIGN KEY (assigned_by) REFERENCES users (id),
      FOREIGN KEY (verified_by) REFERENCES users (id)
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

  // Ensure password column exists if table existed previously
  try {
    db.exec(`ALTER TABLE users ADD COLUMN password TEXT DEFAULT '123456';`);
  } catch (e) {}

  seedMDJData();
}

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

function seedMDJData() {
  const nowTime = getFormattedNow();

  // 1. Seed Initial Departments if none exist
  const deptCount = db.prepare('SELECT COUNT(*) as c FROM departments').get();
  if (deptCount.c === 0) {
    const insertDept = db.prepare('INSERT OR IGNORE INTO departments (name, created_at) VALUES (?, ?)');
    insertDept.run('Jabatan Landskap', nowTime);
    insertDept.run('Jabatan Kejuruteraan', nowTime);
    insertDept.run('Jabatan Penguatkuasaan & Kawalan', nowTime);
    insertDept.run('Pejabat Yang Dipertua', nowTime);
    insertDept.run('Pejabat Setiausaha', nowTime);
    insertDept.run('Bahagian Teknologi Maklumat & Pentadbiran', nowTime);
  }

  // 2. Ensure Users
  const checkUser = db.prepare('SELECT id FROM users WHERE email = ?');
  const insertUser = db.prepare(`
    INSERT INTO users (name, email, role, department, phone, avatar, password)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Ensure all existing users have default password 123456 if not explicitly set
  try {
    db.exec(`UPDATE users SET password = '123456' WHERE password IS NULL OR password = '' OR password = 'admin123';`);
  } catch (e) {}

  // Superadmin
  if (!checkUser.get('superadmin@mdj.gov.my')) {
    insertUser.run('Super Admin MDJ', 'superadmin@mdj.gov.my', 'superadmin', 'Bahagian Teknologi Maklumat & Pentadbiran', '06-6136200', 'admin.png', '123456');
  }

  // YDP
  if (!checkUser.get('ydp@mdj.gov.my')) {
    insertUser.run('Yang Dipertua (YDP) Majlis Daerah Jelebu', 'ydp@mdj.gov.my', 'ydp', 'Pejabat Yang Dipertua', '06-6136201', 'ydp.png', '123456');
  }

  // Setiausaha (SU)
  if (!checkUser.get('setiausaha@mdj.gov.my')) {
    insertUser.run('Setiausaha (SU) Majlis Daerah Jelebu', 'setiausaha@mdj.gov.my', 'setiausaha', 'Pejabat Setiausaha', '06-6136202', 'su.png', '123456');
  }

  // Ketua Jabatan Landskap (Ali - contoh pengguna)
  if (!checkUser.get('ali@mdj.gov.my')) {
    insertUser.run('Ali bin Abu', 'ali@mdj.gov.my', 'ketua_bahagian', 'Jabatan Landskap', '012-7788990', 'kb_landskap.png', '123456');
  }

  // Pegawai Landskap bawah Ali
  if (!checkUser.get('kamal@mdj.gov.my')) {
    insertUser.run('Kamal bin Idris', 'kamal@mdj.gov.my', 'pegawai', 'Jabatan Landskap', '013-6655443', 'peg_landskap.png', '123456');
  }

  // Ketua Jabatan Kejuruteraan
  const kbKej = checkUser.get('kb.kejuruteraan@mdj.gov.my') || checkUser.get('ketuabahagian@agensi.gov.my');
  if (!kbKej) {
    insertUser.run('Ir. Ts. Mohd Zulkifli bin Hashim', 'kb.kejuruteraan@mdj.gov.my', 'ketua_bahagian', 'Jabatan Kejuruteraan', '012-3456789', 'kb1.png', '123456');
  } else {
    db.prepare("UPDATE users SET department = 'Jabatan Kejuruteraan' WHERE id = ?").run(kbKej.id);
  }

  // Pegawai Kejuruteraan
  const pegKej1 = checkUser.get('farhan@mdj.gov.my') || checkUser.get('farhan@agensi.gov.my');
  if (pegKej1) {
    db.prepare("UPDATE users SET department = 'Jabatan Kejuruteraan' WHERE id = ?").run(pegKej1.id);
  }

  const pegKej2 = checkUser.get('danial@mdj.gov.my') || checkUser.get('danial@agensi.gov.my');
  if (pegKej2) {
    db.prepare("UPDATE users SET department = 'Jabatan Kejuruteraan' WHERE id = ?").run(pegKej2.id);
  }

  // Ketua Jabatan Penguatkuasaan
  const kbPeng = checkUser.get('noraini@mdj.gov.my') || checkUser.get('noraini@agensi.gov.my');
  if (kbPeng) {
    db.prepare("UPDATE users SET department = 'Jabatan Penguatkuasaan & Kawalan' WHERE id = ?").run(kbPeng.id);
  }

  // Pegawai Penguatkuasaan
  const pegPeng = checkUser.get('siti@mdj.gov.my') || checkUser.get('siti@agensi.gov.my');
  if (pegPeng) {
    db.prepare("UPDATE users SET department = 'Jabatan Penguatkuasaan & Kawalan' WHERE id = ?").run(pegPeng.id);
  }

  console.log('Pangkalan data MDJ & peranan Setiausaha berjaya dimuatkan.');
}

module.exports = {
  db,
  initDb,
  getTodayString,
  getFormattedNow,
  getDateOffset
};
