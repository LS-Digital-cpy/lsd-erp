// Design Ref: §5.4 로그인 화면 / 사이드바 사용자 영역, §6 Error Handling (401 -> 로그인 화면)
// Design Ref: §4.3, §5.4 확장 — 관리자(영업팀장) 사용자 등록/관리 (module-2)
import { login, logout, getCurrentUser, isLoggedIn, getUsers, registerUser } from './api.js';

const ROLE_LABEL = {
  '영업팀장': '영업팀장',
  '영업사원': '영업사원',
};

const ADMIN_ROLE = '영업팀장';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function showLogin() {
  document.getElementById('loginScreen').classList.add('open');
  document.querySelector('.app').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').classList.remove('open');
  document.querySelector('.app').style.display = '';
}

function renderSidebarUser(user) {
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  if (!user) return;
  nameEl.textContent = user.name;
  roleEl.textContent = ROLE_LABEL[user.role] || user.role;
  avatarEl.textContent = user.name.slice(0, 2);

  // Plan SC: 영업팀장만 사용자 관리 메뉴 노출
  document.getElementById('navAdminSection').style.display = user.role === ADMIN_ROLE ? '' : 'none';
}

function showLoginError(message) {
  const el = document.getElementById('loginError');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  showLoginError('');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    showLoginError('이메일과 비밀번호를 입력하세요.');
    return;
  }
  try {
    const user = await login(email, password);
    renderSidebarUser(user);
    showApp();
    document.dispatchEvent(new CustomEvent('lsd:login', { detail: { user } }));
  } catch (err) {
    if (err.code === 'UNAUTHORIZED') {
      showLoginError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } else {
      showLoginError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}

function handleLogout() {
  logout();
  showLoginError('');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  showLogin();
}

/* ── 사용자 관리 모달 (Design Ref: §4.3, §5.4 확장, 영업팀장 전용) ── */
function showUserMgmtMessage(elId, message) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

async function renderUserList() {
  const tbody = document.getElementById('userListBody');
  tbody.innerHTML = '<tr><td colspan="3">불러오는 중...</td></tr>';
  try {
    const users = await getUsers();
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="3">등록된 사용자가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(u.name)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(ROLE_LABEL[u.role] || u.role)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="3">사용자 목록을 불러오지 못했습니다.</td></tr>';
  }
}

function openUserMgmt() {
  showUserMgmtMessage('userMgmtError', '');
  showUserMgmtMessage('userMgmtInfo', '');
  document.getElementById('um-name').value = '';
  document.getElementById('um-email').value = '';
  document.getElementById('um-password').value = '';
  document.getElementById('um-role').value = '영업사원';
  document.getElementById('userMgmtModal').classList.add('open');
  renderUserList();
}

function closeUserMgmt() {
  document.getElementById('userMgmtModal').classList.remove('open');
}

async function handleRegisterUser() {
  showUserMgmtMessage('userMgmtError', '');
  showUserMgmtMessage('userMgmtInfo', '');

  const name = document.getElementById('um-name').value.trim();
  const email = document.getElementById('um-email').value.trim();
  const password = document.getElementById('um-password').value;
  const role = document.getElementById('um-role').value;

  if (!name || !email || !password) {
    showUserMgmtMessage('userMgmtError', '이름, 이메일, 비밀번호를 모두 입력하세요.');
    return;
  }
  if (password.length < 8) {
    showUserMgmtMessage('userMgmtError', '비밀번호는 8자 이상이어야 합니다.');
    return;
  }

  try {
    await registerUser({ email, password, name, role });
    document.getElementById('um-name').value = '';
    document.getElementById('um-email').value = '';
    document.getElementById('um-password').value = '';
    showUserMgmtMessage('userMgmtInfo', `${name} 계정이 등록되었습니다.`);
    renderUserList();
  } catch (err) {
    showUserMgmtMessage('userMgmtError', err.message || '사용자 등록 중 오류가 발생했습니다.');
  }
}

// Plan SC: 영업팀원 로그인 -> 영업 파이프라인 접근 (401 시 로그인 화면으로 자동 이동)
export function requireAuth() {
  if (!isLoggedIn()) {
    showLogin();
    return false;
  }
  return true;
}

export function initAuth() {
  document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.getElementById('navUserMgmt').addEventListener('click', openUserMgmt);
  document.getElementById('userMgmtClose').addEventListener('click', closeUserMgmt);
  document.getElementById('userMgmtSubmit').addEventListener('click', handleRegisterUser);
  document.getElementById('userMgmtModal').addEventListener('click', (e) => {
    if (e.target.id === 'userMgmtModal') closeUserMgmt();
  });

  if (isLoggedIn()) {
    renderSidebarUser(getCurrentUser());
    showApp();
  } else {
    showLogin();
  }
}

// api.js의 401(UNAUTHORIZED) 응답을 받았을 때 app.js에서 호출
export function handleUnauthorized() {
  logout();
  showLogin();
  showLoginError('세션이 만료되었습니다. 다시 로그인해주세요.');
}
