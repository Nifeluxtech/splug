/* SPLUG — shared shell, API client, session, formatting and toast helpers */

const API = {
  auth: '/api/auth', numbers: '/api/numbers', wallet: '/api/wallet', history: '/api/history',
};

const store = {
  get token() { return localStorage.getItem('splug_token'); },
  set token(v) { v ? localStorage.setItem('splug_token', v) : localStorage.removeItem('splug_token'); },
  get refreshToken() { return localStorage.getItem('splug_refresh_token'); },
  set refreshToken(v) { v ? localStorage.setItem('splug_refresh_token', v) : localStorage.removeItem('splug_refresh_token'); },
};

async function apiCall(url, { method = 'GET', body, query = {}, retry = true } = {}) {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const authFailure = res.status === 401 || /invalid jwt|token is expired|session expired|not authenticated/i.test(json.message || '');
    if (authFailure && retry && url !== API.auth && store.refreshToken) {
      try {
        const refreshed = await apiCall(API.auth, { method: 'POST', body: { action: 'refresh', refresh_token: store.refreshToken }, retry: false });
        store.token = refreshed.access_token;
        if (refreshed.refresh_token) store.refreshToken = refreshed.refresh_token;
        return apiCall(url, { method, body, query, retry: false });
      } catch {}
    }
    if (authFailure) {
      store.token = null; store.refreshToken = null;
      window.location.replace('/login.html');
    }
    throw new Error(json.message || 'Request failed');
  }
  return json.data;
}

function mountHeader(active = '') {
  const header = document.querySelector('.topbar');
  if (!header) return;
  header.innerHTML = `
    <a class="brand" href="/index.html"><span class="brand-mark">✦</span> S<span>PLUG</span></a>
    <div class="header-right">
      <nav class="header-nav" aria-label="Primary navigation">
        <a class="${active === 'dashboard' ? 'active' : ''}" href="/dashboard.html">Dashboard</a>
        <a class="${active === 'wallet' ? 'active' : ''}" href="/wallet.html">Wallet</a>
        <a class="${active === 'history' ? 'active' : ''}" href="/history.html">History</a>
      </nav>
      <div class="balance-chip" id="balanceChip" hidden>₦0.00</div>
    </div>`;
}

function requireAuthPage() {
  if (!store.token) { window.location.replace('/login.html'); return false; }
  return true;
}

async function logout() {
  try { await apiCall(API.auth, { method: 'POST', body: { action: 'logout' } }); } catch {}
  store.token = null; store.refreshToken = null; window.location.href = '/login.html';
}

function mountFooter(active) {
  if (document.querySelector('.floating-footer')) return;
  const nav = document.createElement('nav');
  nav.className = 'floating-footer';
  nav.innerHTML = `
    <a class="footer-tab ${active === 'dashboard' ? 'active' : ''}" href="/dashboard.html"><span class="icon">⌂</span><span>Dashboard</span></a>
    <a class="footer-tab ${active === 'wallet' ? 'active' : ''}" href="/wallet.html"><span class="icon">◈</span><span>Wallet</span></a>
    <a class="footer-tab ${active === 'history' ? 'active' : ''}" href="/history.html"><span class="icon">≡</span><span>History</span></a>
    <button class="footer-tab" id="footerLogout"><span class="icon">↗</span><span>Logout</span></button>`;
  document.body.appendChild(nav);
  nav.querySelector('#footerLogout').addEventListener('click', logout);
}

async function refreshBalanceChip() {
  const chip = document.getElementById('balanceChip');
  if (!chip || !store.token) return;
  try { const data = await apiCall(API.wallet, { query: { action: 'balance' } }); chip.textContent = naira(data.balance); chip.hidden = false; } catch { chip.hidden = true; }
}

const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
async function copyText(text, btn) { try { await navigator.clipboard.writeText(text); const old = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = old), 1500); } catch {} }
function toast(message, type = 'success') { let el = document.getElementById('splugToast'); if (!el) { el = document.createElement('div'); el.id = 'splugToast'; el.className = 'toast'; document.body.appendChild(el); } el.textContent = message; el.className = `toast show ${type}`; clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3600); }
