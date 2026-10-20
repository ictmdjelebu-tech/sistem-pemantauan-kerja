const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

const { db, initDb, getTodayString, getFormattedNow } = require('./db');
const {
  notifyTaskAssignedToOfficer,
  notifyTaskAssignedToYDP,
  notifyOfficerDueToday,
  notifyTaskSubmittedToKB,
  notifyTaskSubmittedToYDP,
  notifyTaskVerifiedToYDP,
  notifyTaskVerifiedToOfficer
} = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database
initDb();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }
  res.status(404).send('Fail index.html tidak dijumpai.');
});

// Configure Multer for evidence photo uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'bukti-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya fail imej/gambar dibenarkan.'));
    }
  }
});

// Helper: Calculate Kotak Masa (SLA Status)
function calculateSLA(task) {
  if (task.status === 'disahkan') {
    return {
      status: 'disahkan',
      boxColor: 'kelabu',
      badge: 'Selesai & Disahkan',
      daysLeft: 0,
      label: 'Selesai Sepenuhnya'
    };
  }

  if (task.status === 'dihantar') {
    return {
      status: 'dihantar',
      boxColor: 'biru',
      badge: 'Menunggu Pengesahan KB',
      daysLeft: 0,
      label: 'Laporan Dihantar (Belum Disahkan)'
    };
  }

  // Task is pending ('baru')
  const today = new Date(getTodayString());
  const deadline = new Date(task.deadline);
  
  // Calculate difference in calendar days
  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      status: 'hijau',
      boxColor: 'hijau',
      badge: `Baki ${diffDays} Hari`,
      daysLeft: diffDays,
      label: `Baki ${diffDays} Hari Lagi (Dalam Tempoh)`
    };
  } else if (diffDays === 0) {
    return {
      status: 'oren',
      boxColor: 'oren',
      badge: 'Tamat Hari Ini',
      daysLeft: 0,
      label: 'Tamat Hari Ini (Perlu Hantar Segera)'
    };
  } else {
    const overdueDays = Math.abs(diffDays);
    return {
      status: 'merah',
      boxColor: 'merah',
      badge: `Lewat ${overdueDays} Hari`,
      daysLeft: diffDays,
      label: `Tamat Tempoh: Lewat ${overdueDays} Hari`
    };
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Get all users
app.get('/api/users', (req, res) => {
  try {
    const role = req.query.role;
    let users;
    if (role) {
      users = db.prepare('SELECT id, name, email, role, department, phone, avatar FROM users WHERE role = ? ORDER BY id ASC').all(role);
    } else {
      users = db.prepare('SELECT id, name, email, role, department, phone, avatar FROM users ORDER BY id ASC').all();
    }
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Login Authentication
app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Sila masukkan emel anda.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ success: false, error: 'Akaun emel tidak dijumpai dalam sistem.' });
    }

    // Password check (if password is provided, verify match)
    if (password && user.password && user.password !== password) {
      return res.status(401).json({ success: false, error: 'Kata laluan tidak sah.' });
    }

    res.json({
      success: true,
      message: 'Log masuk berjaya.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatar: user.avatar
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b-2. Role-Based Login (Password Default 123456)
app.post('/api/login-by-role', (req, res) => {
  try {
    const { role, user_id, password } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, error: 'Sila pilih peranan sistem.' });
    }

    let user;
    if (user_id) {
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    } else {
      user = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get(role);
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Akaun pengguna tidak dijumpai.' });
    }

    // Verify Password (Default fallback is 123456)
    const expectedPassword = user.password || '123456';
    if (!password || password !== expectedPassword) {
      return res.status(401).json({ success: false, error: 'Kata laluan tidak sah. (Lalai: 123456)' });
    }

    res.json({
      success: true,
      message: 'Log masuk berjaya.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatar: user.avatar
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b-3. User Profile Self-Service Update (Email, Phone, Password)
app.put('/api/profile/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const { email, phone, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai.' });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Alamat emel tidak boleh dikosongkan.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const collision = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, userId);
    if (collision) {
      return res.status(400).json({ success: false, error: 'Alamat emel ini telah digunakan oleh pengguna lain.' });
    }

    let updateSql = `UPDATE users SET email = ?, phone = ?`;
    const params = [cleanEmail, phone !== undefined ? phone.trim() : user.phone];

    if (password && password.trim().length > 0) {
      updateSql += `, password = ?`;
      params.push(password.trim());
    }

    updateSql += ` WHERE id = ?`;
    params.push(userId);

    db.prepare(updateSql).run(...params);

    const updated = db.prepare('SELECT id, name, email, role, department, phone, avatar FROM users WHERE id = ?').get(userId);
    res.json({
      success: true,
      message: 'Profil peribadi berjaya dikemas kini.',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. Superadmin: Create New User / Officer
app.post('/api/users', (req, res) => {
  try {
    const { name, email, role, department, phone, password } = req.body;
    if (!name || !email || !role || !department) {
      return res.status(400).json({ success: false, error: 'Nama, emel, peranan, dan jabatan/bahagian wajib diisi.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ success: false, error: 'Emel ini telah digunakan oleh pengguna lain.' });
    }

    const insertStmt = db.prepare(`
      INSERT INTO users (name, email, role, department, phone, avatar, password)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      name.trim(),
      email.trim().toLowerCase(),
      role,
      department.trim(),
      phone || '',
      'default.png',
      password || '123456'
    );

    const newUser = db.prepare('SELECT id, name, email, role, department, phone, avatar FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, message: 'Pengguna / Pegawai berjaya ditambah.', data: newUser });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1d. Superadmin: Update User / Officer
app.put('/api/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, department, phone, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai.' });
    }

    let updateQuery = `
      UPDATE users 
      SET name = ?, email = ?, role = ?, department = ?, phone = ?
    `;
    const params = [
      name ? name.trim() : user.name,
      email ? email.trim().toLowerCase() : user.email,
      role || user.role,
      department ? department.trim() : user.department,
      phone !== undefined ? phone : user.phone
    ];

    if (password) {
      updateQuery += `, password = ?`;
      params.push(password);
    }

    updateQuery += ` WHERE id = ?`;
    params.push(userId);

    db.prepare(updateQuery).run(...params);

    const updated = db.prepare('SELECT id, name, email, role, department, phone, avatar FROM users WHERE id = ?').get(userId);
    res.json({ success: true, message: 'Maklumat pengguna / pegawai berjaya dikemas kini.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1e. Superadmin: Delete User / Officer
app.delete('/api/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak dijumpai.' });
    }

    if (user.role === 'superadmin') {
      return res.status(400).json({ success: false, error: 'Akaun Superadmin utama tidak boleh dipadam.' });
    }

    // Check if user has assigned tasks
    const hasTasks = db.prepare('SELECT COUNT(*) as c FROM tasks WHERE assigned_to = ? OR assigned_by = ?').get(userId, userId);
    if (hasTasks.count > 0) {
      return res.status(400).json({
        success: false,
        error: `Pengguna ini tidak boleh dipadam kerana mempunyai ${hasTasks.count} rekod tugasan berkaitan. Anda boleh mengemas kini nama atau peranannya.`
      });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ success: true, message: 'Pengguna berjaya dipadam daripada sistem.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 1f. Jabatan & Bahagian Management (MDJ)
// ==========================================
app.get('/api/departments', (req, res) => {
  try {
    const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
    res.json({ success: true, data: departments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/departments', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Sila masukkan nama jabatan/bahagian.' });
    }
    const cleanName = name.trim();
    const existing = db.prepare('SELECT id FROM departments WHERE name = ? COLLATE NOCASE').get(cleanName);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Jabatan/bahagian ini telah wujud.' });
    }

    const stmt = db.prepare('INSERT INTO departments (name, created_at) VALUES (?, ?)');
    const result = stmt.run(cleanName, getFormattedNow());
    res.json({
      success: true,
      message: 'Jabatan/bahagian berjaya ditambah.',
      data: { id: result.lastInsertRowid, name: cleanName }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/departments/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Sila masukkan nama baru jabatan.' });
    }
    const deptId = req.params.id;
    const cleanName = name.trim();
    const oldDept = db.prepare('SELECT * FROM departments WHERE id = ?').get(deptId);
    if (!oldDept) {
      return res.status(404).json({ success: false, error: 'Jabatan tidak dijumpai.' });
    }

    db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(cleanName, deptId);
    // Kemas kini nama jabatan bagi semua pengguna yang terikat
    db.prepare('UPDATE users SET department = ? WHERE department = ?').run(cleanName, oldDept.name);

    res.json({ success: true, message: 'Nama jabatan berjaya dikemas kini.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/departments/:id', (req, res) => {
  try {
    const deptId = req.params.id;
    const dept = db.prepare('SELECT * FROM departments WHERE id = ?').get(deptId);
    if (!dept) {
      return res.status(404).json({ success: false, error: 'Jabatan tidak dijumpai.' });
    }

    const userCount = db.prepare('SELECT COUNT(*) as c FROM users WHERE department = ?').get(dept.name);
    if (userCount.c > 0) {
      return res.status(400).json({
        success: false,
        error: `Jabatan "${dept.name}" tidak boleh dipadam kerana terdapat ${userCount.c} pegawai berdaftar di bawahnya. Sila tukar jabatan pegawai berkenaan terlebih dahulu.`
      });
    }

    db.prepare('DELETE FROM departments WHERE id = ?').run(deptId);
    res.json({ success: true, message: 'Jabatan berjaya dipadam.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get list of tasks (with SLA info & filters)
app.get('/api/tasks', (req, res) => {
  try {
    const { role, user_id, status_filter, department } = req.query;

    let query = `
      SELECT 
        t.*,
        u_to.name AS assigned_to_name,
        u_to.email AS assigned_to_email,
        u_to.department AS assigned_to_dept,
        u_by.name AS assigned_by_name,
        u_by.department AS assigned_by_dept,
        u_vf.name AS verified_by_name
      FROM tasks t
      LEFT JOIN users u_to ON t.assigned_to = u_to.id
      LEFT JOIN users u_by ON t.assigned_by = u_by.id
      LEFT JOIN users u_vf ON t.verified_by = u_vf.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by role/user
    if (role === 'pegawai' && user_id) {
      query += ' AND t.assigned_to = ?';
      params.push(user_id);
    } else if (role === 'ketua_bahagian' && user_id) {
      // Ketua Bahagian hanya nampak tugasan di bawah jabatannya sendiri
      const kbUser = db.prepare('SELECT department FROM users WHERE id = ?').get(user_id);
      if (kbUser && kbUser.department) {
        query += ' AND (t.assigned_by = ? OR u_to.department = ?)';
        params.push(user_id, kbUser.department);
      } else {
        query += ' AND t.assigned_by = ?';
        params.push(user_id);
      }
    }
    // Setiausaha & YDP & Superadmin: tiada sekatan jabatan (nampak semua rekod MDJ)

    // Optional department filter for YDP / SU / Superadmin
    if (department && department !== 'semua') {
      query += ' AND (u_to.department = ? OR u_by.department = ?)';
      params.push(department, department);
    }

    query += ' ORDER BY t.id DESC';

    const tasks = db.prepare(query).all(...params);

    // Attach SLA calculation and parse images JSON
    const enrichedTasks = tasks.map(task => {
      const sla = calculateSLA(task);
      let images = [];
      try {
        if (task.report_images) {
          images = JSON.parse(task.report_images);
        }
      } catch (e) {
        images = [];
      }

      return {
        ...task,
        sla,
        images
      };
    });

    // Optional status_filter
    let filtered = enrichedTasks;
    if (status_filter && status_filter !== 'semua') {
      if (status_filter === 'hijau' || status_filter === 'oren' || status_filter === 'merah') {
        filtered = enrichedTasks.filter(t => t.sla.status === status_filter);
      } else {
        filtered = enrichedTasks.filter(t => t.status === status_filter);
      }
    }

    res.json({ success: true, data: filtered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get single task detail
app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = db.prepare(`
      SELECT 
        t.*,
        u_to.name AS assigned_to_name,
        u_to.email AS assigned_to_email,
        u_to.department AS assigned_to_dept,
        u_to.phone AS assigned_to_phone,
        u_by.name AS assigned_by_name,
        u_by.email AS assigned_by_email,
        u_by.department AS assigned_by_dept,
        u_vf.name AS verified_by_name
      FROM tasks t
      LEFT JOIN users u_to ON t.assigned_to = u_to.id
      LEFT JOIN users u_by ON t.assigned_by = u_by.id
      LEFT JOIN users u_vf ON t.verified_by = u_vf.id
      WHERE t.id = ?
    `).get(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, error: 'Tugasan tidak dijumpai' });
    }

    task.sla = calculateSLA(task);
    try {
      task.images = task.report_images ? JSON.parse(task.report_images) : [];
    } catch (e) {
      task.images = [];
    }

    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Ketua Bahagian: Assign new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, location, venue, assigned_to, assigned_by, deadline } = req.body;

    if (!title || !description || !location || !venue || !assigned_to || !assigned_by || !deadline) {
      return res.status(400).json({ success: false, error: 'Semua maklumat tugasan wajib diisi.' });
    }

    // Generate unique Task Number & Token
    const countRow = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
    const taskNo = `TSK-${new Date().getFullYear()}-${String(countRow.count + 1).padStart(3, '0')}`;
    const verificationToken = crypto.randomBytes(24).toString('hex');
    const createdAt = getFormattedNow();

    const insertStmt = db.prepare(`
      INSERT INTO tasks (
        task_no, title, description, location, venue, assigned_to, assigned_by, 
        deadline, created_at, status, verification_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'baru', ?)
    `);

    const result = insertStmt.run(
      taskNo, title, description, location, venue, assigned_to, assigned_by,
      deadline, createdAt, verificationToken
    );

    const taskId = result.lastInsertRowid;
    const newTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    // Fetch Officer, KB, and YDP info for notifications
    const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(assigned_to);
    const kb = db.prepare('SELECT * FROM users WHERE id = ?').get(assigned_by);
    const ydp = db.prepare("SELECT * FROM users WHERE role = 'ydp' LIMIT 1").get();

    // 1. Send Email to Pegawai
    if (officer) {
      notifyTaskAssignedToOfficer(newTask, officer, kb).catch(e => console.error(e));
    }

    // 2. Send Makluman Awal Email to YDP
    if (ydp) {
      notifyTaskAssignedToYDP(newTask, officer, kb, ydp).catch(e => console.error(e));
    }

    res.json({
      success: true,
      message: 'Tugasan berjaya dicipta dan emel makluman telah dihantar kepada Pegawai & YDP.',
      data: newTask
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Pegawai: Submit task with photo evidence & written report (Real-time timestamp recorded)
app.post('/api/tasks/:id/submit', upload.array('photos', 5), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { report_text } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Tugasan tidak dijumpai' });
    }

    if (task.status === 'disahkan') {
      return res.status(400).json({ success: false, error: 'Tugasan ini telah disahkan sebelum ini.' });
    }

    // Process uploaded photo paths
    let uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      uploadedFiles = req.files.map(f => '/uploads/' + f.filename);
    } else if (task.report_images) {
      uploadedFiles = JSON.parse(task.report_images);
    }

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'Sila muat naik sekurang-kurangnya 1 bukti bergambar.' });
    }

    if (!report_text || report_text.trim() === '') {
      return res.status(400).json({ success: false, error: 'Sila masukkan laporan bertulis ringkas.' });
    }

    // Exact server timestamp (Tamper-proof)
    const submittedAt = getFormattedNow();

    const updateStmt = db.prepare(`
      UPDATE tasks 
      SET status = 'dihantar',
          submitted_at = ?,
          report_text = ?,
          report_images = ?
      WHERE id = ?
    `);

    updateStmt.run(submittedAt, report_text.trim(), JSON.stringify(uploadedFiles), taskId);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(updatedTask.assigned_to);
    const kb = db.prepare('SELECT * FROM users WHERE id = ?').get(updatedTask.assigned_by);
    const ydp = db.prepare("SELECT * FROM users WHERE role = 'ydp' LIMIT 1").get();

    // 1. Send Email to Ketua Bahagian (contains Review link & Direct Verify button)
    if (kb) {
      notifyTaskSubmittedToKB(updatedTask, officer, kb).catch(e => console.error(e));
    }

    // 2. Send Makluman Email to YDP (Pegawai siap hantar, belum disahkan KB)
    if (ydp) {
      notifyTaskSubmittedToYDP(updatedTask, officer, kb, ydp).catch(e => console.error(e));
    }

    res.json({
      success: true,
      message: 'Tugasan berjaya dihantar bersama bukti bergambar dan laporan. Notifikasi emel telah dihantar kepada Ketua Bahagian dan YDP.',
      submitted_at: submittedAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Ketua Bahagian: Verify Task via Dashboard
app.post('/api/tasks/:id/verify', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { verified_by, verification_notes } = req.body;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Tugasan tidak dijumpai' });
    }

    const verifiedAt = getFormattedNow();

    const updateStmt = db.prepare(`
      UPDATE tasks
      SET status = 'disahkan',
          verified_at = ?,
          verified_by = ?,
          verification_notes = ?
      WHERE id = ?
    `);

    updateStmt.run(verifiedAt, verified_by || task.assigned_by, verification_notes || 'Disahkan lengkap dan teratur.', taskId);

    const verifiedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(verifiedTask.assigned_to);
    const kb = db.prepare('SELECT * FROM users WHERE id = ?').get(verified_by || verifiedTask.assigned_by);
    const ydp = db.prepare("SELECT * FROM users WHERE role = 'ydp' LIMIT 1").get();

    // 1. Send Confirmation Email to YDP (With actual verification date & time)
    if (ydp) {
      notifyTaskVerifiedToYDP(verifiedTask, officer, kb, ydp).catch(e => console.error(e));
    }

    // 2. Send Confirmation Email to Pegawai
    if (officer) {
      notifyTaskVerifiedToOfficer(verifiedTask, officer, kb).catch(e => console.error(e));
    }

    res.json({
      success: true,
      message: `Tugasan telah disahkan pada ${verifiedAt}. Emel pengesahan rasmi telah dihantar kepada YDP dan Pegawai.`,
      verified_at: verifiedAt
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Ketua Bahagian: One-Click Direct Verification from Email Button
app.get('/api/tasks/:id/verify-direct', async (req, res) => {
  try {
    const taskId = req.params.id;
    const token = req.query.token;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.send(`<h2>Ralat: Tugasan tidak wujud.</h2>`);
    }

    if (task.verification_token !== token) {
      return res.send(`<h2>Ralat: Pautan keselamatan tidak sah atau telah tamat tempoh.</h2>`);
    }

    if (task.status === 'disahkan') {
      return res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 12px; text-align: center;">
          <h2 style="color: #0284c7;">Tugasan Sudah Disahkan Terdahulu</h2>
          <p>Tugasan <strong>${task.task_no}: ${task.title}</strong> telah pun disahkan pada <strong>${task.verified_at}</strong>.</p>
          <a href="/?role=ketua_bahagian" style="background-color: #0284c7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 15px;">Kembali ke Dashboard</a>
        </div>
      `);
    }

    const verifiedAt = getFormattedNow();
    db.prepare(`
      UPDATE tasks
      SET status = 'disahkan',
          verified_at = ?,
          verified_by = assigned_by,
          verification_notes = 'Disahkan terus melalui butang pengesahan emel.'
      WHERE id = ?
    `).run(verifiedAt, taskId);

    const verifiedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(verifiedTask.assigned_to);
    const kb = db.prepare('SELECT * FROM users WHERE id = ?').get(verifiedTask.assigned_by);
    const ydp = db.prepare("SELECT * FROM users WHERE role = 'ydp' LIMIT 1").get();

    // Send notifications to YDP & Pegawai
    if (ydp) notifyTaskVerifiedToYDP(verifiedTask, officer, kb, ydp).catch(e => console.error(e));
    if (officer) notifyTaskVerifiedToOfficer(verifiedTask, officer, kb).catch(e => console.error(e));

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Pengesahan Berjaya</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 40px 20px; }
          .card { max-width: 580px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); text-align: center; }
          .icon { width: 72px; height: 72px; background: #dcfce7; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; margin: 0 auto 20px auto; }
          h2 { color: #0f172a; margin-bottom: 8px; }
          p { color: #475569; line-height: 1.6; }
          .box { background: #f1f5f9; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left; font-size: 14px; }
          .btn { background: #0284c7; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h2>Tugasan Berjaya Disahkan!</h2>
          <p>Tindakan pengesahan anda telah direkodkan ke dalam sistem pemantauan.</p>
          <div class="box">
            <div><strong>No. Rujukan:</strong> ${verifiedTask.task_no}</div>
            <div><strong>Tajuk:</strong> ${verifiedTask.title}</div>
            <div><strong>Pegawai:</strong> ${officer.name}</div>
            <div style="margin-top: 8px; color: #16a34a; font-weight: bold;">
              <strong>Tarikh &amp; Masa Sebenar Disahkan:</strong><br>${verifiedAt}
            </div>
          </div>
          <p style="font-size: 13px; color: #64748b;">Notifikasi rasmi telah dihantar secara automatik ke peti emel YDP.</p>
          <a href="/?role=ketua_bahagian" class="btn">Buka Portal Sistem</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2>Ralat Sistem: ${err.message}</h2>`);
  }
});

// 8. Automated Check: Remind Officers for tasks due today (Kotak Oren)
app.post('/api/cron/check-due-today', (req, res) => {
  try {
    const today = getTodayString();
    const tasksDueToday = db.prepare(`
      SELECT t.*, u.name as officer_name, u.email as officer_email 
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.deadline = ? AND t.status = 'baru'
    `).all(today);

    let sentCount = 0;
    for (const t of tasksDueToday) {
      const officer = { name: t.officer_name, email: t.officer_email, id: t.assigned_to };
      notifyOfficerDueToday(t, officer).catch(e => console.error(e));
      sentCount++;
    }

    res.json({
      success: true,
      message: `Semakan selesai. ${sentCount} emel peringatan Kotak Oren dihantar kepada pegawai yang terlibat.`,
      count: sentCount
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Executive Stats (for YDP Dashboard)
app.get('/api/stats', (req, res) => {
  try {
    const allTasks = db.prepare(`
      SELECT t.*, u_to.department, u_to.name as officer_name
      FROM tasks t
      LEFT JOIN users u_to ON t.assigned_to = u_to.id
    `).all();

    let total = allTasks.length;
    let hijau = 0;
    let oren = 0;
    let merah = 0;
    let dihantar = 0; // Menunggu pengesahan
    let disahkan = 0; // Selesai

    const departmentStats = {};

    allTasks.forEach(task => {
      const sla = calculateSLA(task);
      if (task.status === 'disahkan') {
        disahkan++;
      } else if (task.status === 'dihantar') {
        dihantar++;
      } else {
        if (sla.status === 'hijau') hijau++;
        else if (sla.status === 'oren') oren++;
        else if (sla.status === 'merah') merah++;
      }

      // Department breakdown
      const dept = task.department || 'Lain-lain';
      if (!departmentStats[dept]) {
        departmentStats[dept] = { total: 0, disahkan: 0, dihantar: 0, lewat: 0 };
      }
      departmentStats[dept].total++;
      if (task.status === 'disahkan') departmentStats[dept].disahkan++;
      if (task.status === 'dihantar') departmentStats[dept].dihantar++;
      if (sla.status === 'merah' && task.status === 'baru') departmentStats[dept].lewat++;
    });

    res.json({
      success: true,
      data: {
        total,
        hijau,
        oren,
        merah,
        dihantar,
        disahkan,
        kadar_selesai: total > 0 ? Math.round((disahkan / total) * 100) : 0,
        departmentStats
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Email Logs (In-app Email Notification Center)
app.get('/api/emails', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const logs = db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT ?').all(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run Kotak Oren daily check on server startup & every 30 minutes
setInterval(() => {
  try {
    const today = getTodayString();
    const tasksDueToday = db.prepare(`
      SELECT t.*, u.name as officer_name, u.email as officer_email 
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.deadline = ? AND t.status = 'baru'
    `).all(today);

    for (const t of tasksDueToday) {
      // Check if already sent in last 24h to avoid duplicate spam
      const alreadySent = db.prepare(`
        SELECT COUNT(*) as count FROM email_logs 
        WHERE task_id = ? AND subject LIKE '%[PERINGATAN SEGERA]%' AND sent_at LIKE ?
      `).get(t.id, `${today}%`);

      if (alreadySent.count === 0) {
        const officer = { name: t.officer_name, email: t.officer_email, id: t.assigned_to };
        notifyOfficerDueToday(t, officer).catch(e => console.error(e));
      }
    }
  } catch (e) {
    console.error('Scheduled Kotak Oren check error:', e);
  }
}, 30 * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  SISTEM PEMANTAUAN KERJA BERSEPADU`);
  console.log(`  Pelayan aktif di: http://localhost:${PORT}`);
  console.log(`  Pangkalan Data: SQLite (Aktif & Bersedia)`);
  console.log(`=======================================================`);
});
