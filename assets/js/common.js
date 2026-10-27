/* SPLUG — shared shell, API client, session, formatting, dialogs and pickers */

const API = {
  auth: '/api/auth', numbers: '/api/numbers', wallet: '/api/wallet', history: '/api/history',
};

const store = {
  get token() { return localStorage.getItem('splug_token'); },
  set token(v) { v ? localStorage.setItem('splug_token', v) : localStorage.removeItem('splug_token'); },
  get refreshToken() { return localStorage.getItem('splug_refresh_token'); },
  set refreshToken(v) { v ? localStorage.setItem('splug_refresh_token', v) : localStorage.removeItem('splug_refresh_token'); },
};

/* ---------- icons ---------- */
const svg = (d, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  home: (c) => svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', c),
  wallet: (c) => svg('<path d="M20 7H5a2 2 0 0 1 0-4h13v4z"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>', c),
  clock: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c),
  logout: (c) => svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>', c),
  copy: (c) => svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', c),
  check: (c) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', c),
  search: (c) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', c),
  eye: (c) => svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', c),
  eyeOff: (c) => svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', c),
  down: (c) => svg('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>', c),
  up: (c) => svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>', c),
  cart: (c) => svg('<path d="M5 7h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 7a3 3 0 0 1 6 0"/>', c),
  undo: (c) => svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', c),
  alert: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>', c),
  phone: (c) => svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>', c),
  inbox: (c) => svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>', c),
};
const brandMark = '<svg viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="currentColor"/><path d="M10 6v5M18 6v5M8 11h12v3a6 6 0 0 1-12 0v-3zM14 20v3" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

/* ---------- formatting ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || ''; } };
const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/* ---------- API client ---------- */
async function apiCall(url, { method = 'GET', body, query = {}, retry = true } = {}) {
  const qs = new URLSearchParams(query).toString();
  let res;
  try {
    res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
  } catch {
    throw new Error('You appear to be offline. Check your connection and try again.');
  }
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
    if (authFailure && url !== API.auth) {
      store.token = null; store.refreshToken = null;
      window.location.replace('/login.html');
    }
    throw new Error(json.message || 'Something went wrong. Please try again.');
  }
  return json.data;
}

/* ---------- shell ---------- */
function mountHeader(active = '') {
  const header = document.querySelector('.topbar');
  if (!header) return;
  const brand = `<a class="brand" href="/index.html" aria-label="SPLUG home">${brandMark}<span>SPLUG</span></a>`;
  let right = '';
  let nav = '';

  if (active === 'public') {
    right = store.token
      ? '<a class="btn btn-primary btn-sm" href="/dashboard.html">Open dashboard</a>'
      : '<a class="btn btn-quiet btn-sm" href="/login.html">Sign in</a><a class="btn btn-primary btn-sm" href="/register.html">Create account</a>';
  } else if (active === 'login') {
    right = '<a class="btn btn-secondary btn-sm" href="/register.html">Create account</a>';
  } else if (active === 'register') {
    right = '<a class="btn btn-secondary btn-sm" href="/login.html">Sign in</a>';
  } else {
    const link = (key, href, label, icon) => `<a href="${href}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
    nav = `<nav class="nav" aria-label="Primary">${link('dashboard', '/dashboard.html', 'Get a number')}${link('wallet', '/wallet.html', 'Wallet')}${link('history', '/history.html', 'History')}</nav>`;
    right = `<a class="balance-chip" id="balanceChip" href="/wallet.html" hidden aria-label="Wallet balance">${icons.wallet('icon-sm')}<span id="balanceText">₦0.00</span></a>
             <button class="icon-btn" id="logoutBtn" type="button" aria-label="Sign out" title="Sign out">${icons.logout('icon-sm')}</button>`;
  }

  header.innerHTML = `<div class="topbar-inner">${brand}${nav}<div class="header-actions">${right}</div></div>`;
  const out = document.getElementById('logoutBtn');
  if (out) out.addEventListener('click', logout);
}

function mountTabbar(active) {
  if (document.querySelector('.tabbar')) return;
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Primary');
  const tab = (key, href, label, icon) => `<a href="${href}" ${active === key ? 'aria-current="page"' : ''}>${icon('icon')}<span>${label}</span></a>`;
  nav.innerHTML = tab('dashboard', '/dashboard.html', 'Get number', icons.phone) + tab('wallet', '/wallet.html', 'Wallet', icons.wallet) + tab('history', '/history.html', 'History', icons.clock);
  document.body.appendChild(nav);
  document.body.classList.add('has-tabbar');
}
const mountFooter = mountTabbar; // backwards-compatible name

function requireAuthPage() {
  if (!store.token) { window.location.replace('/login.html'); return false; }
  return true;
}

async function logout() {
  try { await apiCall(API.auth, { method: 'POST', body: { action: 'logout' }, retry: false }); } catch {}
  store.token = null; store.refreshToken = null; window.location.href = '/login.html';
}

const balance = { value: null };
async function refreshBalanceChip() {
  const chip = document.getElementById('balanceChip');
  if (!store.token) return null;
  try {
    const data = await apiCall(API.wallet, { query: { action: 'balance' } });
    balance.value = Number(data.balance || 0);
    if (chip) { document.getElementById('balanceText').textContent = naira(balance.value); chip.hidden = false; }
    document.dispatchEvent(new CustomEvent('splug:balance', { detail: balance.value }));
    return balance.value;
  } catch { if (chip) chip.hidden = true; return null; }
}

/* ---------- small helpers ---------- */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (btn) {
    const old = btn.innerHTML; btn.innerHTML = `${icons.check('icon-sm')} Copied`;
    clearTimeout(btn._t); btn._t = setTimeout(() => (btn.innerHTML = old), 1500);
  }
}

function toast(message, type = 'success') {
  let el = document.getElementById('splugToast');
  if (!el) { el = document.createElement('div'); el.id = 'splugToast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.textContent = message; el.className = `toast show ${type}`;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4200);
}

function setLoading(btn, on, text) {
  if (on) { btn._idle = btn.innerHTML; btn.disabled = true; btn.classList.add('is-loading'); if (text) btn.textContent = text; }
  else { btn.disabled = false; btn.classList.remove('is-loading'); if (btn._idle) btn.innerHTML = btn._idle; }
}

/* Promise-based confirm dialog: confirmDialog({ title, rows: [[label, value]], warning, confirmText, danger }) */
function confirmDialog({ title, rows = [], warning = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    if (typeof HTMLDialogElement === 'undefined') {
      resolve(window.confirm([title, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'))); return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    dlg.innerHTML = `
      <form method="dialog">
        <div class="dlg-body">
          <h2 id="dlgTitle">${esc(title)}</h2>
          ${rows.length ? `<dl class="dlg-rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          ${warning ? `<p class="dlg-warn">${esc(warning)}</p>` : ''}
        </div>
        <div class="dlg-actions">
          <button class="btn btn-secondary" value="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" autofocus>${esc(confirmText)}</button>
        </div>
      </form>`;
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'ok'; dlg.remove(); resolve(ok); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/* Searchable list picker: replaces the old "search box + <select>" pair */
function createPicker(root, { placeholder = 'Search…', label = 'Options', onSelect = () => {} } = {}) {
  root.classList.add('picker');
  const uid = 'pk' + Math.random().toString(36).slice(2, 8);
  root.innerHTML = `
    <div class="picker-search">${icons.search('icon-sm')}<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" aria-controls="${uid}" /></div>
    <ul class="picker-list" id="${uid}" role="listbox" aria-label="${esc(label)}"></ul>`;
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  const MAX = 250;
  let items = [], query = '', value = '', message = 'Loading…', locked = true;

  function visible() {
    const q = query.trim().toLowerCase();
    return q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
  }
  function render() {
    root.classList.toggle('is-disabled', locked);
    input.disabled = locked;
    if (locked || !items.length) { list.innerHTML = `<li class="picker-note">${esc(message || 'Nothing to show')}</li>`; return; }
    const rows = visible();
    if (!rows.length) { list.innerHTML = `<li class="picker-note">No match for “${esc(query)}”</li>`; return; }
    list.innerHTML = rows.slice(0, MAX).map((it) => {
      const sel = String(it.id) === value;
      return `<li role="presentation"><button type="button" class="picker-opt" role="option" aria-selected="${sel}" data-id="${esc(it.id)}"><span>${esc(it.name)}</span>${sel ? icons.check('icon-sm') : ''}</button></li>`;
    }).join('') + (rows.length > MAX ? `<li class="picker-more">Showing ${MAX} of ${rows.length}. Keep typing to narrow the list.</li>` : '');
  }
  function choose(id) {
    const it = items.find((x) => String(x.id) === String(id));
    if (!it) return;
    value = String(it.id); render(); onSelect(it);
  }
  input.addEventListener('input', () => { query = input.value; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { const f = list.querySelector('.picker-opt'); if (f) { e.preventDefault(); f.focus(); } }
    if (e.key === 'Enter') { e.preventDefault(); const first = visible()[0]; if (first && query.trim()) choose(first.id); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.picker-opt'); if (b) choose(b.dataset.id); });
  list.addEventListener('keydown', (e) => {
    const b = e.target.closest('.picker-opt'); if (!b) return;
    const all = [...list.querySelectorAll('.picker-opt')]; const i = all.indexOf(b);
    if (e.key === 'ArrowDown') { e.preventDefault(); (all[i + 1] || b).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); i === 0 ? input.focus() : all[i - 1].focus(); }
  });
  render();
  return {
    setItems(next) { items = next || []; value = ''; query = ''; input.value = ''; locked = false; message = 'Nothing available'; render(); },
    lock(msg) { items = []; value = ''; query = ''; input.value = ''; locked = true; message = msg; render(); },
    get value() { return value; },
    get selected() { return items.find((x) => String(x.id) === value) || null; },
  };
}

/* ---------- shared list renderers ---------- */
const TXN = {
  deposit: { label: 'Deposit', dir: 'in', icon: 'down' },
  refund: { label: 'Refund', dir: 'in', icon: 'undo' },
  purchase: { label: 'Purchase', dir: 'out', icon: 'cart' },
  withdrawal: { label: 'Withdrawal', dir: 'out', icon: 'up' },
};
function txnRow(t) {
  const meta = TXN[t.type] || { label: titleCase(t.type), dir: 'in', icon: 'down' };
  const out = meta.dir === 'out';
  const status = String(t.status || '').toLowerCase();
  return `
    <li class="row txn">
      <div class="txn-ico ${out ? '' : 'in'}">${icons[meta.icon]('icon-sm')}</div>
      <div>
        <div class="row-title">${esc(meta.label)}</div>
        <div class="row-sub">${esc(t.description || t.reference || '')}</div>
        <div class="row-sub">${esc(fmtDate(t.created_at))}</div>
      </div>
      <div class="row-end">
        <span class="amount ${out ? 'neg' : 'pos'}">${out ? '−' : '+'}${naira(t.amount)}</span>
        <span class="badge ${esc(status)}">${esc(titleCase(status))}</span>
      </div>
    </li>`;
}
const skeleton = (n = 4) => `<div class="skeleton" aria-hidden="true">${'<i></i>'.repeat(n)}</div>`;
function emptyState({ icon = 'inbox', title, text, href, cta }) {
  return `<div class="empty"><div class="empty-ico">${icons[icon]('icon')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${href ? `<a class="btn btn-primary btn-sm" href="${href}">${esc(cta)}</a>` : ''}</div>`;
}
