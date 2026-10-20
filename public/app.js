// ==========================================
// SISTEM PEMANTAUAN KERJA MAJLIS DAERAH JELEBU
// APP.JS - LOGIK APLIKASI LENGKAP
// ==========================================

let state = {
  users: [],
  departments: [],
  currentRole: 'ydp',
  currentUser: null,
  selectedLoginRole: null,
  superAdminMode: 'management', // 'management' or 'audit'
  ydpDeptFilter: 'semua',
  tasks: [],
  stats: null,
  emailLogs: [],
  pegawaiFilter: 'semua',
  kbFilter: 'semua',
  ydpFilter: 'semua',
  isLoggedIn: false
};

// Initialize on DOM Loaded
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  lucide.createIcons();
  checkLoginSession();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));
  }
});

// Real-Time Server/Local Clock
function initClock() {
  const clockEl = document.getElementById('liveClock');
  const liveSubmitClock = document.getElementById('submitLiveTimestamp');

  function update() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    if (clockEl) clockEl.innerText = timeStr;
    if (liveSubmitClock) liveSubmitClock.innerText = timeStr;
  }
  update();
  setInterval(update, 1000);
}

// Check saved session in LocalStorage
function checkLoginSession() {
  const savedUserJson = localStorage.getItem('mdj_current_user');
  if (savedUserJson) {
    try {
      const user = JSON.parse(savedUserJson);
      state.currentUser = user;
      state.currentRole = user.role;
      state.isLoggedIn = true;
      document.getElementById('loginScreen').classList.add('hidden');
      fetchInitialData(user.id);
      return;
    } catch (e) {
      localStorage.removeItem('mdj_current_user');
    }
  }

  // Not logged in -> Show login screen
  document.getElementById('loginScreen').classList.remove('hidden');
  backToRoleSelection();
  fetchUsersForQuickLogin();
}

// Fetch users & departments list for login setup
async function fetchUsersForQuickLogin() {
  try {
    const [uRes, dRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/departments')
    ]);
    const uData = await uRes.json();
    const dData = await dRes.json();
    if (uData.success) state.users = uData.data;
    if (dData.success) state.departments = dData.data;
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

// ==========================================
// ROLE-BASED LOGIN LOGIC (MDJ)
// ==========================================
async function selectLoginRole(role) {
  if (state.users.length === 0) {
    await fetchUsersForQuickLogin();
  }

  state.selectedLoginRole = role;

  const roleMeta = {
    superadmin: { name: 'Super Admin MDJ', badgeClass: 'bg-purple-100 text-purple-900 border border-purple-300' },
    ydp: { name: 'Yang Dipertua (YDP) MDJ', badgeClass: 'bg-amber-100 text-amber-900 border border-amber-300' },
    setiausaha: { name: 'Setiausaha (SU) MDJ', badgeClass: 'bg-teal-100 text-teal-900 border border-teal-300' },
    ketua_bahagian: { name: 'Ketua Jabatan / Bahagian', badgeClass: 'bg-sky-100 text-sky-900 border border-sky-300' },
    pegawai: { name: 'Pegawai Bertugas (MDJ)', badgeClass: 'bg-emerald-100 text-emerald-900 border border-emerald-300' }
  };

  const badgeEl = document.getElementById('loginSelectedRoleBadge');
  const meta = roleMeta[role] || { name: role, badgeClass: 'bg-slate-100 text-slate-800' };
  badgeEl.innerText = meta.name;
  badgeEl.className = `text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${meta.badgeClass}`;

  // Hide Step 1, Show Step 2
  document.getElementById('loginStepRole').classList.add('hidden');
  document.getElementById('loginStepPassword').classList.remove('hidden');

  // Reset error
  const errBox = document.getElementById('loginErrorMsg');
  errBox.classList.add('hidden');
  errBox.innerText = '';

  const singleCard = document.getElementById('loginSingleUserCard');
  const multiSection = document.getElementById('loginMultiUserSection');

  if (role === 'superadmin' || role === 'ydp' || role === 'setiausaha') {
    singleCard.classList.remove('hidden');
    multiSection.classList.add('hidden');

    const user = state.users.find(u => u.role === role);
    if (user) {
      document.getElementById('loginSingleUserName').innerText = user.name;
      document.getElementById('loginSingleUserDept').innerText = user.department;
      const initials = user.name
        .split(' ')
        .filter(w => !['bin', 'binti', 'dr', 'ir', 'ts'].includes(w.toLowerCase()))
        .slice(0, 2)
        .map(w => w[0])
        .join('')
        .toUpperCase();
      document.getElementById('loginSingleUserAvatar').innerText = initials || 'MDJ';
    }
  } else {
    // ketua_bahagian or pegawai (multi users)
    singleCard.classList.add('hidden');
    multiSection.classList.remove('hidden');

    const select = document.getElementById('loginOfficerSelect');
    select.innerHTML = '';

    const officers = state.users.filter(u => u.role === role);
    officers.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.name} — [${u.department}]`;
      select.appendChild(opt);
    });

    // Check memory in LocalStorage
    const rememberedId = localStorage.getItem('mdj_last_login_' + role);
    if (rememberedId && officers.some(u => String(u.id) === String(rememberedId))) {
      select.value = rememberedId;
    } else if (officers.length > 0) {
      select.value = officers[0].id;
    }

    onLoginOfficerChange();
  }

  // Pre-fill default password 123456
  const pwdInput = document.getElementById('loginPasswordInput');
  pwdInput.value = '123456';
  pwdInput.focus();

  lucide.createIcons();
}

function onLoginOfficerChange() {
  const select = document.getElementById('loginOfficerSelect');
  const selectedId = select.value;
  if (!selectedId) return;

  const user = state.users.find(u => String(u.id) === String(selectedId));
  if (user) {
    document.getElementById('loginOfficerDeptText').innerText = `🏢 ${user.department}`;
    document.getElementById('loginOfficerEmailText').innerText = user.email;
    localStorage.setItem('mdj_last_login_' + state.selectedLoginRole, selectedId);
  }
}

function backToRoleSelection() {
  document.getElementById('loginStepPassword').classList.add('hidden');
  document.getElementById('loginStepRole').classList.remove('hidden');
  const errBox = document.getElementById('loginErrorMsg');
  if (errBox) {
    errBox.classList.add('hidden');
    errBox.innerText = '';
  }
  lucide.createIcons();
}

function fillDefaultPassword() {
  const pwd = document.getElementById('loginPasswordInput');
  if (pwd) pwd.value = '123456';
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = `<i data-lucide="eye-off" class="w-4 h-4 text-red-600"></i>`;
  } else {
    input.type = 'password';
    btn.innerHTML = `<i data-lucide="eye" class="w-4 h-4 text-slate-400"></i>`;
  }
  lucide.createIcons();
}

async function submitRoleLogin(e) {
  e.preventDefault();
  const role = state.selectedLoginRole;
  const password = document.getElementById('loginPasswordInput').value;
  const errBox = document.getElementById('loginErrorMsg');
  const btn = document.getElementById('btnLoginRoleSubmit');

  errBox.classList.add('hidden');
  errBox.innerText = '';

  let user_id = null;
  if (role === 'ketua_bahagian' || role === 'pegawai') {
    user_id = parseInt(document.getElementById('loginOfficerSelect').value);
    if (!user_id) {
      errBox.innerText = 'Sila pilih nama pegawai daripada senarai.';
      errBox.classList.remove('hidden');
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Mengesahkan...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch('/api/login-by-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, user_id, password })
    });

    const result = await res.json();
    if (result.success) {
      performLogin(result.data);
    } else {
      errBox.innerText = 'Ralat: ' + result.error;
      errBox.classList.remove('hidden');
    }
  } catch (err) {
    errBox.innerText = 'Ralat sambungan: ' + err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="log-in" class="w-4 h-4"></i><span>Log Masuk Sistem</span>`;
    lucide.createIcons();
  }
}

function performLogin(user) {
  state.currentUser = user;
  state.currentRole = user.role;
  state.isLoggedIn = true;
  localStorage.setItem('mdj_current_user', JSON.stringify(user));

  document.getElementById('loginScreen').classList.add('hidden');
  fetchInitialData(user.id);
}

function handleLogout() {
  if (confirm('Adakah anda pasti ingin log keluar daripada sistem?')) {
    localStorage.removeItem('mdj_current_user');
    state.isLoggedIn = false;
    state.currentUser = null;
    document.getElementById('loginScreen').classList.remove('hidden');
    backToRoleSelection();
  }
}

// Fetch Initial System Data
async function fetchInitialData(preferredUserId = null) {
  try {
    const [uRes, dRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/departments')
    ]);
    const uData = await uRes.json();
    const dData = await dRes.json();

    if (uData.success) state.users = uData.data;
    if (dData.success) {
      state.departments = dData.data;
      renderDepartmentsTable();
      populateDeptDropdown();
    }

    if (preferredUserId) {
      const match = state.users.find(u => u.id === parseInt(preferredUserId));
      if (match) {
        state.currentUser = match;
        state.currentRole = match.role;
      }
    } else if (!state.currentUser && state.users.length > 0) {
      state.currentUser = state.users[0];
      state.currentRole = state.currentUser.role;
    }

    updateCurrentUser();
    await loadAllData();
    switchRole(state.currentRole);

    // Check URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const urlTaskId = urlParams.get('task_id');
    if (urlTaskId) {
      if (state.currentRole === 'pegawai') {
        setTimeout(() => openSubmitTaskModal(urlTaskId), 500);
      } else if (state.currentRole === 'ketua_bahagian') {
        setTimeout(() => openVerifyTaskModal(urlTaskId), 500);
      }
    }
  } catch (err) {
    console.error('Error fetching initial data:', err);
  }
}

function updateCurrentUser() {
  if (state.currentUser) {
    document.getElementById('currentUserName').innerText = state.currentUser.name;
    document.getElementById('currentUserDept').innerText = state.currentUser.department;
    
    const initials = state.currentUser.name
      .split(' ')
      .filter(w => !['bin', 'binti', 'dr', 'ir', 'ts', 'dato\''].includes(w.toLowerCase()))
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
    document.getElementById('currentUserAvatar').innerText = initials || 'MDJ';

    const roleBadges = {
      superadmin: { text: 'Super Admin MDJ', class: 'bg-purple-100 text-purple-900 border border-purple-300' },
      ydp: { text: 'Yang Dipertua (YDP)', class: 'bg-amber-100 text-amber-900 border border-amber-300' },
      setiausaha: { text: 'Setiausaha (SU) MDJ', class: 'bg-teal-100 text-teal-900 border border-teal-300' },
      ketua_bahagian: { text: 'Ketua Jabatan / Bahagian', class: 'bg-sky-100 text-sky-900 border border-sky-300' },
      pegawai: { text: 'Pegawai Bertugas', class: 'bg-emerald-100 text-emerald-900 border border-emerald-300' }
    };
    const badge = roleBadges[state.currentRole] || roleBadges.pegawai;
    const roleBadgeEl = document.getElementById('currentUserRoleBadge');
    roleBadgeEl.innerText = badge.text;
    roleBadgeEl.className = `text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.class}`;
  }
}

// Toggle Jabatan & Pegawai tables in Superadmin view
function toggleDeptStaffTables() {
  const panel = document.getElementById('superadminManagementSection');
  const btnText = document.getElementById('btnToggleDeptStaffText');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    if (btnText) btnText.innerText = '▲ Tutup Pengurusan Jabatan & Pegawai';
  } else {
    panel.classList.add('hidden');
    if (btnText) btnText.innerText = '▼ Buka Pengurusan Jabatan & Pegawai';
  }
  lucide.createIcons();
}

// Switch Active Role (Superadmin / YDP / Setiausaha / KB / Pegawai)
function switchRole(newRole) {
  state.currentRole = newRole;

  updateCurrentUser();

  const superAdminSection = document.getElementById('superadminOnlySection');
  const viewYDP = document.getElementById('viewYDP');
  const viewKB = document.getElementById('viewKB');
  const viewPegawai = document.getElementById('viewPegawai');

  const ydpBadge = document.getElementById('ydpBannerBadge');
  const ydpBadgeText = document.getElementById('ydpBannerBadgeText');

  // Executive Roles: Superadmin, YDP & Setiausaha
  if (newRole === 'superadmin' || newRole === 'ydp' || newRole === 'setiausaha') {
    viewYDP.classList.remove('hidden');
    viewKB.classList.add('hidden');
    viewPegawai.classList.add('hidden');

    if (newRole === 'superadmin') {
      if (superAdminSection) superAdminSection.classList.remove('hidden');
      if (ydpBadge && ydpBadgeText) {
        ydpBadge.className = 'inline-flex items-center space-x-2 bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-bold px-3 py-1 rounded-full mb-3';
        ydpBadgeText.innerText = 'Papan Pemuka Eksekutif (Super Admin MDJ)';
      }
    } else {
      // YDP and Setiausaha must NEVER see Super Admin management section
      if (superAdminSection) superAdminSection.classList.add('hidden');

      if (newRole === 'setiausaha') {
        if (ydpBadge && ydpBadgeText) {
          ydpBadge.className = 'inline-flex items-center space-x-2 bg-teal-500/20 border border-teal-400/30 text-teal-300 text-xs font-bold px-3 py-1 rounded-full mb-3';
          ydpBadgeText.innerText = 'Papan Pemuka Setiausaha (SU) Majlis Daerah Jelebu';
        }
      } else {
        if (ydpBadge && ydpBadgeText) {
          ydpBadge.className = 'inline-flex items-center space-x-2 bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-bold px-3 py-1 rounded-full mb-3';
          ydpBadgeText.innerText = 'Papan Pemuka Yang Dipertua (YDP) Majlis Daerah Jelebu';
        }
      }
    }
  } else if (newRole === 'ketua_bahagian') {
    viewYDP.classList.add('hidden');
    if (superAdminSection) superAdminSection.classList.add('hidden');
    viewKB.classList.remove('hidden');
    viewPegawai.classList.add('hidden');
  } else if (newRole === 'pegawai') {
    viewYDP.classList.add('hidden');
    if (superAdminSection) superAdminSection.classList.add('hidden');
    viewKB.classList.add('hidden');
    viewPegawai.classList.remove('hidden');
  }

  // Toggle quick assign button
  const quickAssignBtn = document.getElementById('btnQuickAssign');
  if (quickAssignBtn) {
    if (newRole === 'ketua_bahagian' || newRole === 'superadmin') {
      quickAssignBtn.classList.remove('hidden');
      quickAssignBtn.classList.add('flex');
    } else {
      quickAssignBtn.classList.add('hidden');
      quickAssignBtn.classList.remove('flex');
    }
  }

  loadAllData();
  lucide.createIcons();
}

// Load all tasks, stats, and emails from API
async function loadAllData() {
  try {
    let tasksUrl = '/api/tasks';
    if (state.currentUser) {
      tasksUrl += `?role=${state.currentRole}&user_id=${state.currentUser.id}`;
    }

    const [tasksRes, statsRes, emailsRes] = await Promise.all([
      fetch(tasksUrl),
      fetch('/api/stats'),
      fetch('/api/emails?limit=20')
    ]);

    const tasksData = await tasksRes.json();
    const statsData = await statsRes.json();
    const emailsData = await emailsRes.json();

    if (tasksData.success) state.tasks = tasksData.data;
    if (statsData.success) state.stats = statsData.data;
    if (emailsData.success) {
      state.emailLogs = emailsData.data;
      document.getElementById('emailBadgeCount').innerText = state.emailLogs.length;
    }

    renderCurrentView();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

function renderCurrentView() {
  if (state.currentRole === 'superadmin') {
    renderSuperAdminView();
  } else if (state.currentRole === 'ydp' || state.currentRole === 'setiausaha') {
    renderYDPView();
  } else if (state.currentRole === 'ketua_bahagian') {
    renderKBView();
  } else if (state.currentRole === 'pegawai') {
    renderPegawaiView();
  }
  lucide.createIcons();
}

// ==========================================
// RENDER VIEW -1: SUPERADMIN
// ==========================================
function renderSuperAdminView() {
  renderDepartmentsTable();

  // Users Table
  const tableBody = document.getElementById('superadminUserTableBody');
  tableBody.innerHTML = '';
  document.getElementById('superadminUserCount').innerText = `${state.users.length} Pegawai & Kakitangan`;

  state.users.forEach(u => {
    let roleBadge = '';
    if (u.role === 'superadmin') roleBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">Super Admin</span>`;
    else if (u.role === 'ydp') roleBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Yang Dipertua</span>`;
    else if (u.role === 'setiausaha') roleBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300">Setiausaha (SU)</span>`;
    else if (u.role === 'ketua_bahagian') roleBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-900 border border-sky-300">Ketua Jabatan</span>`;
    else roleBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">Pegawai Bertugas</span>`;

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="px-5 py-3.5 font-bold text-slate-900">
        <div class="flex items-center space-x-2">
          <div class="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs">
            ${u.name.charAt(0)}
          </div>
          <span>${u.name}</span>
        </div>
      </td>
      <td class="px-4 py-3.5 font-mono text-[11px] text-slate-600">${u.email}</td>
      <td class="px-4 py-3.5">${roleBadge}</td>
      <td class="px-4 py-3.5 text-slate-800 font-semibold">${u.department}</td>
      <td class="px-4 py-3.5 text-slate-600 font-mono">${u.phone || '-'}</td>
      <td class="px-4 py-3.5 text-right space-x-2">
        <button onclick="openEditUserModal(${u.id})" class="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg font-bold text-[11px] transition">
          ✏️ Edit Nama
        </button>
        ${u.role !== 'superadmin' ? `
          <button onclick="deleteUser(${u.id}, '${u.name}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] transition">
            Padam
          </button>
        ` : ''}
      </td>
    `;
    tableBody.appendChild(tr);
  });
  renderYDPView();
  lucide.createIcons();
}

// Render Departments Table in Superadmin
function renderDepartmentsTable() {
  const deptBody = document.getElementById('superadminDeptTableBody');
  if (!deptBody) return;
  deptBody.innerHTML = '';

  if (state.departments.length === 0) {
    deptBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-6 text-slate-400">
          Tiada jabatan didaftarkan lagi. Sila klik butang "+ Tambah Jabatan Baru" di atas.
        </td>
      </tr>
    `;
    return;
  }

  state.departments.forEach(d => {
    const userCount = state.users.filter(u => u.department && u.department.trim().toLowerCase() === d.name.trim().toLowerCase()).length;
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 transition';
    tr.innerHTML = `
      <td class="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="building" class="w-4 h-4 text-indigo-600"></i>
        <span>${d.name}</span>
      </td>
      <td class="px-4 py-3 font-semibold text-slate-700">
        <span class="px-2 py-0.5 rounded-full text-xs ${userCount > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'}">
          ${userCount} Pegawai
        </span>
      </td>
      <td class="px-4 py-3 font-mono text-slate-400 text-[11px]">${d.created_at || '-'}</td>
      <td class="px-4 py-3 text-right space-x-2">
        <button onclick="openEditDeptModal(${d.id}, '${d.name}')" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] transition">
          ✏️ Edit Nama
        </button>
        <button onclick="deleteDept(${d.id}, '${d.name}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] transition">
          Padam
        </button>
      </td>
    `;
    deptBody.appendChild(tr);
  });
  lucide.createIcons();
}

// Populate the Department Dropdown dynamically in the User Edit modal
function populateDeptDropdown(selectedDept = null) {
  const select = document.getElementById('editUserDept');
  if (!select) return;
  select.innerHTML = '';

  if (state.departments.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- Tiada Jabatan (Sila tambah jabatan dahulu) --';
    select.appendChild(opt);
    return;
  }

  state.departments.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (selectedDept && d.name.trim().toLowerCase() === selectedDept.trim().toLowerCase()) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// ==========================================
// MODAL JABATAN (ADD / EDIT)
// ==========================================
function openAddDeptModal() {
  document.getElementById('editDeptId').value = '';
  document.getElementById('modalDeptTitle').innerText = 'Tambah Jabatan / Bahagian MDJ Baru';
  document.getElementById('formDeptEdit').reset();
  document.getElementById('modalDeptEdit').classList.remove('hidden');
}

function openEditDeptModal(id, currentName) {
  document.getElementById('editDeptId').value = id;
  document.getElementById('modalDeptTitle').innerText = `Kemas Kini: ${currentName}`;
  document.getElementById('editDeptName').value = currentName;
  document.getElementById('modalDeptEdit').classList.remove('hidden');
}

function closeDeptEditModal() {
  document.getElementById('modalDeptEdit').classList.add('hidden');
}

async function submitDeptEdit(e) {
  e.preventDefault();
  const id = document.getElementById('editDeptId').value;
  const name = document.getElementById('editDeptName').value;
  const btn = document.getElementById('btnSaveDept');

  btn.disabled = true;
  btn.innerHTML = `<span>Menyimpan...</span>`;

  try {
    let url = '/api/departments';
    let method = 'POST';
    if (id) {
      url = `/api/departments/${id}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const result = await res.json();
    if (result.success) {
      alert(result.message);
      closeDeptEditModal();
      await fetchInitialData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Simpan Jabatan`;
  }
}

async function deleteDept(id, name) {
  if (!confirm(`Adakah anda pasti ingin memadam jabatan "${name}" daripada senarai?`)) return;

  try {
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await fetchInitialData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  }
}

// ==========================================
// MODAL USER (ADD / EDIT)
// ==========================================
function openAddUserModal() {
  document.getElementById('editUserId').value = '';
  document.getElementById('modalUserTitle').innerText = 'Tambah Pegawai / Pengguna Baru (MDJ)';
  document.getElementById('formUserEdit').reset();
  populateDeptDropdown();
  document.getElementById('modalUserEdit').classList.remove('hidden');
}

function openEditUserModal(userId) {
  const user = state.users.find(u => u.id === parseInt(userId));
  if (!user) return;

  document.getElementById('editUserId').value = user.id;
  document.getElementById('modalUserTitle').innerText = `Kemas Kini: ${user.name}`;
  document.getElementById('editUserName').value = user.name;
  document.getElementById('editUserEmail').value = user.email;
  document.getElementById('editUserRole').value = user.role;
  populateDeptDropdown(user.department);
  document.getElementById('editUserPhone').value = user.phone || '';
  document.getElementById('editUserPassword').value = '';

  document.getElementById('modalUserEdit').classList.remove('hidden');
}

function closeUserEditModal() {
  document.getElementById('modalUserEdit').classList.add('hidden');
}

async function submitUserEdit(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId').value;
  const payload = {
    name: document.getElementById('editUserName').value,
    email: document.getElementById('editUserEmail').value,
    role: document.getElementById('editUserRole').value,
    department: document.getElementById('editUserDept').value,
    phone: document.getElementById('editUserPhone').value,
    password: document.getElementById('editUserPassword').value
  };

  const btn = document.getElementById('btnSaveUser');
  btn.disabled = true;
  btn.innerHTML = `<span>Menyimpan...</span>`;

  try {
    let url = '/api/users';
    let method = 'POST';
    if (userId) {
      url = `/api/users/${userId}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      alert(result.message);
      closeUserEditModal();
      await fetchInitialData(userId || null);
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Simpan Maklumat</span>`;
    lucide.createIcons();
  }
}

async function deleteUser(userId, name) {
  if (!confirm(`Adakah anda pasti ingin memadam pegawai "${name}" daripada sistem?`)) return;

  try {
    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await fetchInitialData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  }
}

// ==========================================
// RENDER VIEW 1: PEGAWAI (KOTAK MASA)
// ==========================================
function renderPegawaiView() {
  const container = document.getElementById('pegawaiTaskList');
  container.innerHTML = '';

  if (!state.currentUser) return;

  let officerTasks = state.tasks.filter(t => t.assigned_to === state.currentUser.id);

  if (state.pegawaiFilter === 'hijau' || state.pegawaiFilter === 'oren' || state.pegawaiFilter === 'merah') {
    officerTasks = officerTasks.filter(t => t.sla.status === state.pegawaiFilter && t.status === 'baru');
  } else if (state.pegawaiFilter === 'disahkan') {
    officerTasks = officerTasks.filter(t => t.status === 'disahkan');
  }

  if (officerTasks.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
        <i data-lucide="check-circle-2" class="w-12 h-12 text-slate-300 mx-auto mb-3"></i>
        <h4 class="text-sm font-bold text-slate-700">Tiada tugasan dalam kategori ini</h4>
        <p class="text-xs text-slate-400 mt-1">Semua tugasan telah diselesaikan atau tiada tugasan baru diagihkan kepada anda.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  officerTasks.forEach(task => {
    const sla = task.sla;
    let kotakMasaClass = '';
    let iconName = 'clock';
    let statusTitle = '';
    let statusDesc = '';

    if (task.status === 'disahkan') {
      kotakMasaClass = 'kotak-masa-kelabu';
      iconName = 'check-check';
      statusTitle = '✓ TUGASAN SELESAI & DISAHKAN';
      statusDesc = `Disahkan oleh Ketua Bahagian pada: ${task.verified_at}`;
    } else if (task.status === 'dihantar') {
      kotakMasaClass = 'kotak-masa-biru';
      iconName = 'send';
      statusTitle = '🔵 LAPORAN TELAH DIHANTAR';
      statusDesc = `Menunggu Pengesahan KB (Dihantar pada: ${task.submitted_at})`;
    } else {
      if (sla.status === 'hijau') {
        kotakMasaClass = 'kotak-masa-hijau';
        iconName = 'calendar';
        statusTitle = `🟢 KOTAK HIJAU: BAKI ${sla.daysLeft} HARI LAGI`;
        statusDesc = `Tugasan dalam tempoh masa selamat. Tarikh akhir: ${task.deadline}`;
      } else if (sla.status === 'oren') {
        kotakMasaClass = 'kotak-masa-oren';
        iconName = 'alert-triangle';
        statusTitle = `🟠 KOTAK OREN: TAMAT HARI INI!`;
        statusDesc = `Perlu dihantar hari ini (${task.deadline}) sebelum waktu tamat!`;
      } else {
        kotakMasaClass = 'kotak-masa-merah';
        iconName = 'alert-octagon';
        statusTitle = `🔴 KOTAK MERAH: TAMAT TEMPOH`;
        statusDesc = `Telah lewat ${Math.abs(sla.daysLeft)} hari daripada tarikh akhir (${task.deadline})!`;
      }
    }

    const card = document.createElement('div');
    card.className = 'card-executive overflow-hidden flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="p-4 ${kotakMasaClass} rounded-t-xl transition">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 font-extrabold text-xs tracking-wide">
              <i data-lucide="${iconName}" class="w-4 h-4"></i>
              <span>${statusTitle}</span>
            </div>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-black/10 font-bold">${task.task_no}</span>
          </div>
          <div class="text-[11px] mt-1 opacity-90 font-medium">${statusDesc}</div>
        </div>

        <div class="p-5 space-y-3">
          <h4 class="text-base font-extrabold text-slate-900 leading-snug">${task.title}</h4>
          
          <div class="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div class="flex items-start gap-1.5">
              <i data-lucide="map-pin" class="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5"></i>
              <div><strong>Lokasi:</strong> ${task.location} (${task.venue})</div>
            </div>
            <div class="flex items-start gap-1.5">
              <i data-lucide="user" class="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5"></i>
              <div><strong>Diagihkan Oleh:</strong> ${task.assigned_by_name}</div>
            </div>
          </div>

          <p class="text-xs text-slate-600 line-clamp-3 leading-relaxed">
            ${task.description}
          </p>

          ${task.status === 'disahkan' || task.status === 'dihantar' ? `
            <div class="pt-2 border-t border-slate-100 text-xs">
              <div class="font-bold text-slate-700 mb-1">Laporan Anda:</div>
              <div class="text-slate-600 italic bg-slate-50 p-2 rounded text-[11px] border border-slate-200">
                "${task.report_text || 'Tiada laporan'}"
              </div>
              ${task.images && task.images.length > 0 ? `
                <div class="mt-2 flex items-center gap-1.5 text-[11px] text-red-800 font-semibold">
                  <i data-lucide="image" class="w-3.5 h-3.5"></i>
                  <span>${task.images.length} keping gambar bukti dimuat naik</span>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="p-4 bg-slate-50 border-t border-slate-100">
        ${task.status === 'baru' ? `
          <button onclick="openSubmitTaskModal(${task.id})" class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2">
            <i data-lucide="upload" class="w-4 h-4"></i>
            <span>Hantar Tugasan &amp; Bukti Bergambar</span>
          </button>
        ` : `
          <button onclick="openVerifyTaskModal(${task.id})" class="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>Lihat Butiran Penuh</span>
          </button>
        `}
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

function filterPegawaiTasks(filter) {
  state.pegawaiFilter = filter;
  document.querySelectorAll('.pegawai-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-filter') === filter) {
      btn.classList.add('bg-emerald-700', 'text-white');
      btn.classList.remove('bg-slate-100', 'text-slate-600');
    } else {
      btn.classList.remove('bg-emerald-700', 'text-white');
      btn.classList.add('bg-slate-100', 'text-slate-600');
    }
  });
  renderPegawaiView();
}

// ==========================================
// RENDER VIEW 2: KETUA BAHAGIAN / JABATAN
// ==========================================
function renderKBView() {
  const pendingContainer = document.getElementById('kbPendingReviewList');
  const allContainer = document.getElementById('kbAllTaskList');
  pendingContainer.innerHTML = '';
  allContainer.innerHTML = '';

  if (!state.currentUser) return;

  const currentDept = state.currentUser.department ? state.currentUser.department.trim().toLowerCase() : '';

  // Filter tasks belonging to this Ketua Jabatan's department or assigned by him
  const kbTasks = state.tasks.filter(t => {
    const isAssignedByMe = t.assigned_by === state.currentUser.id;
    const isMyDeptOfficer = t.assigned_to_dept && t.assigned_to_dept.trim().toLowerCase() === currentDept;
    return isAssignedByMe || isMyDeptOfficer;
  });

  // 1. Pending Verifications
  const pendingTasks = kbTasks.filter(t => t.status === 'dihantar');
  document.getElementById('kbPendingCountBadge').innerText = `${pendingTasks.length} Tugasan`;

  if (pendingTasks.length === 0) {
    pendingContainer.innerHTML = `
      <div class="col-span-full py-6 text-center text-slate-500 text-xs">
        <i data-lucide="shield-check" class="w-8 h-8 text-emerald-500 mx-auto mb-1.5"></i>
        Tiada tugasan tertunggak untuk pengesahan anda di bawah ${state.currentUser.department} buat masa ini.
      </div>
    `;
  } else {
    pendingTasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'bg-white p-4 rounded-xl border border-amber-300 shadow-sm space-y-3';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900">${task.task_no}</span>
          <span class="text-[11px] text-slate-500">Dihantar: <strong class="text-slate-700 font-mono">${task.submitted_at}</strong></span>
        </div>
        <h4 class="text-sm font-bold text-slate-900">${task.title}</h4>
        <div class="text-xs text-slate-600">
          <strong>Pegawai:</strong> ${task.assigned_to_name} (${task.assigned_to_dept || state.currentUser.department})
        </div>
        <div class="text-xs text-slate-600 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200 line-clamp-2">
          "${task.report_text || 'Tiada teks'}"
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-100">
          <span class="text-[11px] text-red-800 font-semibold flex items-center gap-1">
            <i data-lucide="image" class="w-3.5 h-3.5"></i>
            ${task.images ? task.images.length : 0} keping gambar
          </span>
          <button onclick="openVerifyTaskModal(${task.id})" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Semak &amp; Sahkan</span>
          </button>
        </div>
      `;
      pendingContainer.appendChild(card);
    });
  }

  // 2. All Tasks Filter
  let filteredKBTasks = kbTasks;
  if (state.kbFilter === 'baru') {
    filteredKBTasks = kbTasks.filter(t => t.status === 'baru' || t.status === 'dihantar');
  } else if (state.kbFilter === 'disahkan') {
    filteredKBTasks = kbTasks.filter(t => t.status === 'disahkan');
  }

  if (filteredKBTasks.length === 0) {
    allContainer.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400 text-xs">
        Tiada rekod tugasan di bawah ${state.currentUser.department} untuk paparan ini.
      </div>
    `;
  } else {
    filteredKBTasks.forEach(task => {
      const sla = task.sla;
      let badgeStyle = '';
      if (task.status === 'disahkan') {
        badgeStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      } else if (task.status === 'dihantar') {
        badgeStyle = 'bg-blue-100 text-blue-800 border-blue-300';
      } else {
        if (sla.status === 'hijau') badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-400';
        else if (sla.status === 'oren') badgeStyle = 'bg-amber-100 text-amber-900 border-amber-400 font-bold';
        else badgeStyle = 'bg-rose-100 text-rose-800 border-rose-400 font-bold';
      }

      const card = document.createElement('div');
      card.className = 'card-executive p-5 flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-mono font-bold text-slate-500">${task.task_no}</span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeStyle}">
              ${sla.badge}
            </span>
          </div>
          <h4 class="text-sm font-bold text-slate-900 mb-2">${task.title}</h4>
          <div class="space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg mb-3">
            <div><strong>Pegawai:</strong> ${task.assigned_to_name}</div>
            <div><strong>Lokasi:</strong> ${task.location}</div>
            <div><strong>Tarikh Akhir:</strong> ${task.deadline}</div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-[11px] text-slate-400 font-mono">Diagih: ${task.created_at.split(' ')[0]}</span>
          <button onclick="openVerifyTaskModal(${task.id})" class="text-red-700 hover:text-red-900 font-semibold flex items-center gap-1">
            <span>Perincian</span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
      allContainer.appendChild(card);
    });
  }
  lucide.createIcons();
}

function filterKBTasks(filter) {
  state.kbFilter = filter;
  document.querySelectorAll('.kb-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-filter') === filter) {
      btn.classList.add('bg-slate-800', 'text-white');
      btn.classList.remove('bg-slate-100', 'text-slate-600');
    } else {
      btn.classList.remove('bg-slate-800', 'text-white');
      btn.classList.add('bg-slate-100', 'text-slate-600');
    }
  });
  renderKBView();
}

// ==========================================
// RENDER VIEW 3: YDP & SETIAUSAHA (EXECUTIVE)
// ==========================================
function populateYdpDeptFilter() {
  const select = document.getElementById('ydpFilterDept');
  if (!select) return;

  const currentVal = state.ydpDeptFilter || 'semua';
  select.innerHTML = '<option value="semua">Semua Jabatan MDJ</option>';

  state.departments.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (d.name === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderYDPView() {
  populateYdpDeptFilter();

  if (state.stats) {
    document.getElementById('kpiTotal').innerText = state.stats.total;
    document.getElementById('kpiHijau').innerText = state.stats.hijau;
    document.getElementById('kpiOren').innerText = state.stats.oren;
    document.getElementById('kpiMerah').innerText = state.stats.merah;
    document.getElementById('kpiDihantar').innerText = state.stats.dihantar;
    document.getElementById('kpiDisahkan').innerText = state.stats.disahkan;
    document.getElementById('kpiRate').innerText = `${state.stats.kadar_selesai}% Selesai`;
  }

  const tableBody = document.getElementById('ydpTaskTableBody');
  tableBody.innerHTML = '';

  let filteredTasks = state.tasks;

  // Filter by Department (if chosen)
  if (state.ydpDeptFilter && state.ydpDeptFilter !== 'semua') {
    filteredTasks = filteredTasks.filter(t => {
      const toDept = (t.assigned_to_dept || '').trim().toLowerCase();
      const byDept = (t.assigned_by_dept || '').trim().toLowerCase();
      const targetDept = state.ydpDeptFilter.trim().toLowerCase();
      return toDept === targetDept || byDept === targetDept;
    });
  }

  // Filter by SLA status
  if (state.ydpFilter !== 'semua') {
    if (['hijau', 'oren', 'merah'].includes(state.ydpFilter)) {
      filteredTasks = filteredTasks.filter(t => t.sla.status === state.ydpFilter && t.status === 'baru');
    } else {
      filteredTasks = filteredTasks.filter(t => t.status === state.ydpFilter);
    }
  }

  if (filteredTasks.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-10 text-slate-400">
          Tiada rekod tugasan ditemui untuk penapisan ini.
        </td>
      </tr>
    `;
    return;
  }

  filteredTasks.forEach(task => {
    const sla = task.sla;
    let badgeHtml = '';

    if (task.status === 'disahkan') {
      badgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✓ Selesai Disahkan</span>`;
    } else if (task.status === 'dihantar') {
      badgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">🔵 Menunggu Sah KB</span>`;
    } else {
      if (sla.status === 'hijau') {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-400">🟢 Baki ${sla.daysLeft} Hari</span>`;
      } else if (sla.status === 'oren') {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-400 animate-pulse">🟠 Tamat Hari Ini</span>`;
      } else {
        badgeHtml = `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-400">🔴 Lewat ${Math.abs(sla.daysLeft)} Hari</span>`;
      }
    }

    const row = document.createElement('tr');
    row.className = 'hover:bg-slate-50 transition';
    row.innerHTML = `
      <td class="px-5 py-4">
        <div class="font-bold text-slate-900">${task.title}</div>
        <div class="text-[11px] font-mono text-slate-400 mt-0.5">${task.task_no} • Agih: ${task.created_at.split(' ')[0]}</div>
      </td>
      <td class="px-4 py-4">
        <div class="text-slate-800 font-medium">${task.location}</div>
        <div class="text-[11px] text-slate-400">${task.venue}</div>
      </td>
      <td class="px-4 py-4">
        <div class="font-semibold text-slate-900">${task.assigned_to_name}</div>
        <div class="text-[11px] text-slate-500 font-medium">${task.assigned_to_dept || ''}</div>
      </td>
      <td class="px-4 py-4">
        ${badgeHtml}
      </td>
      <td class="px-4 py-4 font-mono text-[11px]">
        ${task.submitted_at ? `<span class="text-emerald-700 font-bold">${task.submitted_at}</span>` : '<span class="text-slate-400">Belum dihantar</span>'}
      </td>
      <td class="px-4 py-4 font-mono text-[11px]">
        ${task.verified_at ? `<span class="text-emerald-800 font-bold">${task.verified_at}</span>` : '<span class="text-slate-400">Belum disahkan</span>'}
      </td>
      <td class="px-4 py-4 text-right">
        <button onclick="openVerifyTaskModal(${task.id})" class="text-red-700 hover:text-red-900 font-bold text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition">
          Perincian
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  lucide.createIcons();
}

function filterYdpTasks() {
  state.ydpFilter = document.getElementById('ydpFilterStatus').value;
  const deptSelect = document.getElementById('ydpFilterDept');
  if (deptSelect) {
    state.ydpDeptFilter = deptSelect.value;
  }
  renderYDPView();
}

// ==========================================
// MODAL: AGIH TUGASAN (AUTO-FILTER MENGIKUT JABATAN)
// ==========================================
function openAssignModal() {
  const modal = document.getElementById('modalAssign');
  const officerSelect = document.getElementById('assignOfficer');
  const filterBadge = document.getElementById('assignDeptFilterBadge');
  officerSelect.innerHTML = '';

  const allOfficers = state.users.filter(u => u.role === 'pegawai');
  let availableOfficers = [];

  // Jika Ketua Jabatan, tapis HANYA pegawai di bawah jabatannya sendiri
  if (state.currentUser && state.currentUser.role === 'ketua_bahagian') {
    const userDept = state.currentUser.department ? state.currentUser.department.trim().toLowerCase() : '';
    availableOfficers = allOfficers.filter(o => o.department && o.department.trim().toLowerCase() === userDept);
    
    if (filterBadge) {
      filterBadge.innerText = state.currentUser.department || 'Jabatan Anda';
      filterBadge.className = 'text-[10px] bg-red-100 text-red-900 font-bold px-1.5 py-0.2 rounded truncate max-w-[150px]';
      filterBadge.title = `Menapis pegawai di bawah ${state.currentUser.department} sahaja`;
    }

    if (availableOfficers.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = `[Tiada pegawai berdaftar di bawah ${state.currentUser.department}]`;
      officerSelect.appendChild(opt);
    } else {
      availableOfficers.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = `${o.name} (${o.phone || 'Tiada No. Tel'})`;
        officerSelect.appendChild(opt);
      });
    }
  } else {
    // Superadmin, YDP, Setiausaha boleh lihat semua pegawai
    availableOfficers = allOfficers;
    if (filterBadge) {
      filterBadge.innerText = 'Semua Jabatan';
      filterBadge.className = 'text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded truncate';
    }
    availableOfficers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name} - [${o.department}]`;
      officerSelect.appendChild(opt);
    });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('assignDeadline').value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

  modal.classList.remove('hidden');
}

function closeAssignModal() {
  document.getElementById('modalAssign').classList.add('hidden');
  document.getElementById('formAssignTask').reset();
}

async function submitAssignTask(e) {
  e.preventDefault();
  const officerVal = document.getElementById('assignOfficer').value;
  if (!officerVal || isNaN(parseInt(officerVal))) {
    alert('Sila pilih pegawai bertugas. Tiada pegawai sah dipilih.');
    return;
  }

  const btn = document.getElementById('btnSubmitAssign');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Menghantar...</span>`;

  try {
    const payload = {
      title: document.getElementById('assignTitle').value,
      description: document.getElementById('assignDesc').value,
      location: document.getElementById('assignLocation').value,
      venue: document.getElementById('assignVenue').value,
      assigned_to: parseInt(officerVal),
      assigned_by: state.currentUser.id,
      deadline: document.getElementById('assignDeadline').value
    };

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      alert('Tugasan MDJ berjaya diagihkan! Notifikasi emel automatik telah dihantar kepada Pegawai dan YDP Majlis Daerah Jelebu.');
      closeAssignModal();
      await loadAllData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="send" class="w-3.5 h-3.5"></i><span>Agih &amp; Hantar Notifikasi</span>`;
    lucide.createIcons();
  }
}

// ==========================================
// MODAL: HANTAR TUGASAN (PEGAWAI)
// ==========================================
function openSubmitTaskModal(taskId) {
  const task = state.tasks.find(t => t.id === parseInt(taskId));
  if (!task) return;

  document.getElementById('submitTaskId').value = task.id;
  document.getElementById('submitTaskTitle').innerText = `${task.task_no}: ${task.title}`;
  document.getElementById('submitTaskVenue').innerText = `${task.location} (${task.venue})`;
  document.getElementById('submitReportText').value = task.report_text || '';
  
  document.getElementById('evidencePhotos').value = '';
  const preview = document.getElementById('photoPreviewContainer');
  preview.innerHTML = '';
  preview.classList.add('hidden');

  document.getElementById('modalSubmitTask').classList.remove('hidden');
}

function closeSubmitTaskModal() {
  document.getElementById('modalSubmitTask').classList.add('hidden');
  document.getElementById('formSubmitTask').reset();
}

function previewSelectedPhotos(input) {
  const container = document.getElementById('photoPreviewContainer');
  container.innerHTML = '';

  if (input.files && input.files.length > 0) {
    container.classList.remove('hidden');
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const item = document.createElement('div');
        item.className = 'photo-preview-item';
        item.innerHTML = `<img src="${e.target.result}" alt="Bukti">`;
        container.appendChild(item);
      };
      reader.readAsDataURL(file);
    });
  } else {
    container.classList.add('hidden');
  }
}

async function submitOfficerReport(e) {
  e.preventDefault();
  const taskId = document.getElementById('submitTaskId').value;
  const fileInput = document.getElementById('evidencePhotos');
  const reportText = document.getElementById('submitReportText').value;

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Sila pilih sekurang-kurangnya 1 bukti bergambar sebelum menghantar.');
    return;
  }

  const btn = document.getElementById('btnConfirmSubmit');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Memproses...</span>`;

  try {
    const formData = new FormData();
    formData.append('report_text', reportText);
    Array.from(fileInput.files).forEach(file => {
      formData.append('photos', file);
    });

    const res = await fetch(`/api/tasks/${taskId}/submit`, {
      method: 'POST',
      body: formData
    });

    const result = await res.json();
    if (result.success) {
      alert(`Tugasan berjaya dihantar pada ${result.submitted_at}!\n\nNotifikasi emel rasmi telah dihantar kepada Ketua Bahagian dan kepada YDP Majlis Daerah Jelebu.`);
      closeSubmitTaskModal();
      await loadAllData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i><span>Hantar Tugasan Sekarang</span>`;
    lucide.createIcons();
  }
}

// ==========================================
// MODAL: SEMAK & SAHKAN TUGASAN
// ==========================================
function openVerifyTaskModal(taskId) {
  const task = state.tasks.find(t => t.id === parseInt(taskId));
  if (!task) return;

  document.getElementById('verifyTaskId').value = task.id;
  document.getElementById('verifyTaskNo').innerText = task.task_no;
  document.getElementById('verifyTaskTitle').innerText = task.title;
  document.getElementById('verifyOfficerName').innerText = task.assigned_to_name;
  document.getElementById('verifyLocation').innerText = `${task.location} (${task.venue})`;
  document.getElementById('verifyDeadline').innerText = task.deadline;
  document.getElementById('verifySubmittedAt').innerText = task.submitted_at || 'Belum dihantar';

  const statusBadge = document.getElementById('verifyTaskStatusBadge');
  if (task.status === 'disahkan') {
    statusBadge.innerText = `✓ Disahkan: ${task.verified_at}`;
    statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800';
  } else if (task.status === 'dihantar') {
    statusBadge.innerText = 'Menunggu Pengesahan KB';
    statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800';
  } else {
    statusBadge.innerText = 'Sedang Dilaksana';
    statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800';
  }

  document.getElementById('verifyReportText').innerText = task.report_text || 'Tiada laporan bertulis dikemukakan lagi.';

  const photoGrid = document.getElementById('verifyPhotosGrid');
  photoGrid.innerHTML = '';
  if (task.images && task.images.length > 0) {
    task.images.forEach(imgUrl => {
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm';
      imgWrapper.innerHTML = `
        <a href="${imgUrl}" target="_blank" title="Klik untuk saiz besar">
          <img src="${imgUrl}" alt="Bukti" class="w-full h-full object-cover hover:scale-105 transition duration-200">
        </a>
      `;
      photoGrid.appendChild(imgWrapper);
    });
  } else {
    photoGrid.innerHTML = `<div class="col-span-full text-slate-400 italic py-4">Tiada gambar bukti dimuat naik.</div>`;
  }

  const confirmBtn = document.getElementById('btnConfirmVerify');
  if (task.status === 'dihantar' && (state.currentRole === 'ketua_bahagian' || state.currentRole === 'ydp' || state.currentRole === 'setiausaha' || state.currentRole === 'superadmin')) {
    confirmBtn.classList.remove('hidden');
  } else {
    confirmBtn.classList.add('hidden');
  }

  document.getElementById('modalVerifyTask').classList.remove('hidden');
}

function closeVerifyTaskModal() {
  document.getElementById('modalVerifyTask').classList.add('hidden');
}

async function confirmTaskVerification() {
  const taskId = document.getElementById('verifyTaskId').value;
  const notes = document.getElementById('verifyNotes').value;
  const btn = document.getElementById('btnConfirmVerify');

  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Mengesahkan...</span>`;

  try {
    const res = await fetch(`/api/tasks/${taskId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verified_by: state.currentUser.id,
        verification_notes: notes
      })
    });

    const result = await res.json();
    if (result.success) {
      alert(`Tugasan telah berjaya disahkan pada ${result.verified_at}!\n\nEmel rasmi telah dihantar kepada YDP Majlis Daerah Jelebu dan Pegawai berserta rekod masa audit sebenar.`);
      closeVerifyTaskModal();
      await loadAllData();
    } else {
      alert('Ralat: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span>✓ SAHKAN TUGASAN SEKARANG</span>`;
    lucide.createIcons();
  }
}

// ==========================================
// MODAL: LOG EMEL & NOTIFIKASI
// ==========================================
function openEmailModal() {
  document.getElementById('modalEmails').classList.remove('hidden');
  loadEmailLogs();
}

function closeEmailModal() {
  document.getElementById('modalEmails').classList.add('hidden');
}

async function loadEmailLogs() {
  const container = document.getElementById('emailLogsList');
  container.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Memuatkan log emel...</div>`;

  try {
    const res = await fetch('/api/emails?limit=30');
    const result = await res.json();
    if (result.success) {
      state.emailLogs = result.data;
      document.getElementById('emailBadgeCount').innerText = state.emailLogs.length;

      if (state.emailLogs.length === 0) {
        container.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Belum ada emel notifikasi dijana.</div>`;
        return;
      }

      container.innerHTML = '';
      state.emailLogs.forEach(mail => {
        const item = document.createElement('div');
        item.className = 'p-3.5 bg-slate-50 hover:bg-red-50 border border-slate-200 rounded-xl cursor-pointer transition flex items-center justify-between text-xs';
        item.onclick = () => previewEmailContent(mail);

        let roleBadgeClass = 'bg-slate-200 text-slate-700';
        if (mail.recipient_role === 'YDP') roleBadgeClass = 'bg-amber-100 text-amber-800 font-bold';
        else if (mail.recipient_role === 'Ketua Bahagian') roleBadgeClass = 'bg-sky-100 text-sky-800 font-bold';
        else if (mail.recipient_role === 'Pegawai') roleBadgeClass = 'bg-emerald-100 text-emerald-800 font-bold';

        item.innerHTML = `
          <div class="space-y-1 pr-4">
            <div class="flex items-center space-x-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] ${roleBadgeClass}">${mail.recipient_role}</span>
              <span class="font-bold text-slate-900">${mail.subject}</span>
            </div>
            <div class="text-[11px] text-slate-500">
              Penerima: <strong>${mail.recipient_name}</strong> &lt;${mail.recipient_email}&gt;
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <div class="font-mono text-[11px] text-slate-400">${mail.sent_at}</div>
            <span class="text-[10px] font-semibold text-red-700 hover:underline">Buka Surat &rarr;</span>
          </div>
        `;
        container.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Error fetching email logs:', err);
  }
}

function previewEmailContent(mail) {
  document.getElementById('emailPreviewSubject').innerText = mail.subject;
  document.getElementById('emailPreviewTo').innerText = `${mail.recipient_name} <${mail.recipient_email}>`;
  document.getElementById('emailPreviewDate').innerText = mail.sent_at;
  document.getElementById('emailPreviewBody').innerHTML = mail.body_html;
  document.getElementById('modalEmailPreview').classList.remove('hidden');
}

function closeEmailPreviewModal() {
  document.getElementById('modalEmailPreview').classList.add('hidden');
}

// Trigger Kotak Oren Check & Email Reminders
async function triggerDueTodayReminder() {
  try {
    const res = await fetch('/api/cron/check-due-today', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      await loadAllData();
    }
  } catch (err) {
    alert('Ralat menyemak kotak oren: ' + err.message);
  }
}

// ==========================================
// MODAL: PROFIL SAYA (SEMUA PENGGUNA)
// ==========================================
function openProfileModal() {
  if (!state.currentUser) return;

  document.getElementById('profileViewName').innerText = state.currentUser.name;
  document.getElementById('profileViewDept').innerText = state.currentUser.department;
  
  const roleBadges = {
    superadmin: { text: 'Super Admin MDJ', class: 'bg-purple-100 text-purple-900 border border-purple-200' },
    ydp: { text: 'Yang Dipertua (YDP)', class: 'bg-amber-100 text-amber-900 border border-amber-200' },
    setiausaha: { text: 'Setiausaha (SU)', class: 'bg-teal-100 text-teal-900 border border-teal-200' },
    ketua_bahagian: { text: 'Ketua Jabatan', class: 'bg-sky-100 text-sky-900 border border-sky-200' },
    pegawai: { text: 'Pegawai Bertugas', class: 'bg-emerald-100 text-emerald-900 border border-emerald-200' }
  };
  const badge = roleBadges[state.currentUser.role] || { text: state.currentUser.role, class: 'bg-slate-100 text-slate-800' };
  const badgeEl = document.getElementById('profileViewRoleBadge');
  badgeEl.innerText = badge.text;
  badgeEl.className = `text-[10px] font-bold px-2.5 py-1 rounded-full ${badge.class}`;

  document.getElementById('profileEmail').value = state.currentUser.email;
  document.getElementById('profilePhone').value = state.currentUser.phone || '';
  document.getElementById('profileNewPassword').value = '';
  document.getElementById('profileConfirmPassword').value = '';

  document.getElementById('modalUserProfile').classList.remove('hidden');
  lucide.createIcons();
}

function closeProfileModal() {
  document.getElementById('modalUserProfile').classList.add('hidden');
}

async function submitProfileUpdate(e) {
  e.preventDefault();
  if (!state.currentUser) return;

  const email = document.getElementById('profileEmail').value.trim();
  const phone = document.getElementById('profilePhone').value.trim();
  const newPassword = document.getElementById('profileNewPassword').value;
  const confirmPassword = document.getElementById('profileConfirmPassword').value;

  if (newPassword || confirmPassword) {
    if (newPassword !== confirmPassword) {
      alert('Kata laluan baru dan pengesahan kata laluan tidak sepadan.');
      return;
    }
    if (newPassword.length < 4) {
      alert('Kata laluan baru mestilah sekurang-kurangnya 4 aksara.');
      return;
    }
  }

  const btn = document.getElementById('btnSaveProfile');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Menyimpan...</span>`;
  lucide.createIcons();

  try {
    const payload = { email, phone };
    if (newPassword) payload.password = newPassword;

    const res = await fetch(`/api/profile/${state.currentUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      alert('Profil peribadi anda berjaya dikemas kini!');
      state.currentUser = result.data;
      localStorage.setItem('mdj_current_user', JSON.stringify(result.data));

      // update in users cache
      const idx = state.users.findIndex(u => u.id === result.data.id);
      if (idx !== -1) {
        state.users[idx] = { ...state.users[idx], ...result.data };
      }

      updateCurrentUser();
      closeProfileModal();
      await loadAllData();
    } else {
      alert('Ralat kemas kini: ' + result.error);
    }
  } catch (err) {
    alert('Ralat sistem: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save" class="w-3.5 h-3.5"></i><span>Simpan Profil</span>`;
    lucide.createIcons();
  }
}
