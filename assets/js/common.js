/* SPLUG — shared helpers: API client, session, floating footer, toast */

const API = {
  auth: '/api/auth',
  numbers: '/api/numbers',
  wallet: '/api/wallet',
  history: '/api/history',
};

const store = {
  get token() { return localStorage.getItem('splug_token'); },
  set token(v) { v ? localStorage.setItem('splug_token', v) : localStorage.removeItem('splug_token'); },
};

async function apiCall(url, { method = 'GET', body, query = {} } = {}) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    if (res.status === 401) {
      store.token = null;
      window.location.replace('/login.html');
    }
    throw new Error(json.message || 'Request failed');
  }
  return json.data;
}

/* ---------- page guard ---------- */
function requireAuthPage() {
  if (!store.token) {
    window.location.replace('/login.html');
    return false;
  }
  return true;
}

async function logout() {
  try { await apiCall(API.auth, { method: 'POST', body: { action: 'logout' } }); } catch {}
  store.token = null;
  window.location.href = '/login.html';
}

/* ---------- formatting ---------- */
const naira = (n) =>
  '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
};

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(() => (btn.textContent = old), 1500);
  } catch {}
}

/* ---------- toast ---------- */
function toast(message, type = 'success') {
  let el = document.getElementById('splugToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'splugToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- floating footer: Dashboard | Wallet | Logout ---------- */
function mountFooter(active) {
  const nav = document.createElement('nav');
  nav.className = 'floating-footer';
  nav.innerHTML = `
    <a class="footer-tab ${active === 'dashboard' ? 'active' : ''}" href="/dashboard.html">
      <span class="icon">🏠</span><span>Dashboard</span>
    </a>
    <a class="footer-tab ${active === 'wallet' ? 'active' : ''}" href="/wallet.html">
      <span class="icon">👛</span><span>Wallet</span>
    </a>
    <button class="footer-tab" id="footerLogout">
      <span class="icon">🚪</span><span>Logout</span>
    </button>`;
  document.body.appendChild(nav);
  nav.querySelector('#footerLogout').addEventListener('click', logout);
}

/* ---------- balance chip in the top bar ---------- */
async function refreshBalanceChip() {
  const chip = document.getElementById('balanceChip');
  if (!chip) return;
  try {
    const data = await apiCall(API.wallet, { query: { action: 'balance' } });
    chip.textContent = naira(data.balance);
    chip.hidden = false;
  } catch {
    chip.hidden = true;
  }
}
