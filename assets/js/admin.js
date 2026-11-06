/* SPLUG — admin panel: overview, users, orders, transactions, settings, admins. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const A = (action, opts = {}) => apiCall('/api/admin', { ...opts, query: { action, ...(opts.query || {}) } });
  const post = (action, body) => A(action, { method: 'POST', body });
  const short = (s, n = 8) => String(s || '').slice(0, n);
  const ngn = (n) => naira(n);

  if (!store.token) { location.replace('/login.html?next=/admin'); return; }
  try { const me = await A('me'); $('adminWho').textContent = `Signed in as ${me.email}`; }
  catch (err) { $('adminWho').textContent = err.message; $('denied').hidden = false; return; }
  $('adminApp').hidden = false;
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true)));

  const userEmail = new Map(); // id → email, for tables
  const who = (id) => userEmail.get(id) ? `${esc(userEmail.get(id))}` : `<span class="mono">${esc(short(id))}</span>`;
  const empty = (cols, text) => `<tr><td colspan="${cols}" class="sub" style="text-align:center;padding:28px">${esc(text)}</td></tr>`;
  const loading = (cols) => empty(cols, 'Loading…');

  /* ---------- tabs ---------- */
  const loaders = {};
  const loaded = new Set();
  function show(tab) {
    document.querySelectorAll('.admin-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('.admin-panel').forEach((p) => { p.hidden = p.id !== `p-${tab}`; });
    history.replaceState(null, '', `#${tab}`);
    if (!loaded.has(tab) && loaders[tab]) { loaded.add(tab); loaders[tab](); }
  }
  document.querySelectorAll('.admin-tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

  /* ---------- overview ---------- */
  let stats = null;
  loaders.overview = async () => {
    $('kpis').innerHTML = '<div class="kpi"><span>Loading…</span></div>';
    try {
      stats = await A('stats');
      const k = (label, value, sub = '') => `<div class="kpi"><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
      $('kpis').innerHTML = [
        k('Users', stats.users.toLocaleString()),
        k('Wallet balances', ngn(stats.wallet_total), 'held for users'),
        k('Deposits (24h)', ngn(stats.deposits_24h), `7d: ${ngn(stats.deposits_7d)}`),
        k('Net sales (24h)', ngn(stats.sales_24h), `7d: ${ngn(stats.sales_7d)}`),
        k('Orders (24h)', stats.orders_24h.toLocaleString(), `${stats.orders_total.toLocaleString()} all time`),
        k('Waiting orders', stats.orders_pending.toLocaleString()),
        k('Pending deposits', stats.pending_deposits.toLocaleString(), 'awaiting payment'),
        k('Code success (7d)', stats.success_rate_7d == null ? '—' : `${stats.success_rate_7d}%`, `Cashback 7d: ${ngn(stats.cashback_7d)}`),
      ].join('');
      drawBars();
    } catch (err) { $('kpis').innerHTML = `<div class="kpi"><span>${esc(err.message)}</span></div>`; }
  };
  function drawBars() {
    if (!stats) return;
    const m = $('chartMetric').value;
    const max = Math.max(1, ...stats.days.map((d) => d[m]));
    $('bars').innerHTML = stats.days.map((d) => `<div class="bar" title="${esc(d.day)}: ${m === 'orders' ? d[m] : ngn(d[m])}"><span>${m === 'orders' ? d[m] : nairaShort(d[m])}</span><i style="height:${Math.max(2, (d[m] / max) * 100)}%"></i><span>${new Date(d.day).toLocaleDateString('en-NG', { weekday: 'short' })}</span></div>`).join('');
  }
  $('chartMetric').addEventListener('change', drawBars);

  /* ---------- users ---------- */
  let users = [];
  async function loadUsers() {
    $('userRows').innerHTML = loading(6);
    try {
      users = (await A('users')).users;
      users.forEach((u) => userEmail.set(u.id, u.email));
      renderUsers();
    } catch (err) { $('userRows').innerHTML = empty(6, err.message); }
  }
  function renderUsers() {
    const q = $('userSearch').value.trim().toLowerCase();
    const list = users.filter((u) => !q || `${u.email} ${u.username} ${u.id}`.toLowerCase().includes(q));
    $('userCount').textContent = `${list.length} of ${users.length} users`;
    $('userRows').innerHTML = list.length ? list.map((u) => `<tr>
      <td><strong>${esc(u.username || '—')}</strong>${u.admin ? ' <span class="badge received">Admin</span>' : ''}<div class="sub">${esc(u.email)}</div></td>
      <td class="num">${ngn(u.balance)}</td>
      <td class="sub">${esc(fmtDate(u.created_at))}</td>
      <td class="sub">${u.last_sign_in_at ? esc(fmtDate(u.last_sign_in_at)) : '—'}</td>
      <td>${u.banned ? '<span class="badge cancelled">Banned</span>' : '<span class="badge received">Active</span>'}</td>
      <td><button class="btn btn-secondary btn-sm" data-user="${esc(u.id)}" type="button">Manage</button></td></tr>`).join('') : empty(6, 'No users match.');
  }
  loaders.users = loadUsers;
  $('userSearch').addEventListener('input', renderUsers);
  $('userReload').addEventListener('click', loadUsers);
  $('userRows').addEventListener('click', (e) => { const b = e.target.closest('[data-user]'); if (b) openUser(b.dataset.user); });

  function modal(html) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
    document.body.appendChild(back);
    return back;
  }

  async function openUser(id) {
    const m = modal('<p>Loading…</p>');
    let d;
    try { d = await A('user', { query: { id } }); } catch (err) { m.querySelector('.modal').innerHTML = `<p>${esc(err.message)}</p><button class="btn btn-secondary" data-close>Close</button>`; return; }
    const u = d.user;
    m.querySelector('.modal').innerHTML = `
      <div class="card-head"><h2>${esc(u.username || u.email)}</h2><button class="btn btn-quiet btn-sm" data-close type="button">Close</button></div>
      <p class="sub">${esc(u.email)} · <span class="mono">${esc(u.id)}</span><br>Joined ${esc(fmtDate(u.created_at))}</p>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><span>Balance</span><strong id="mBal">${ngn(u.balance)}</strong></div><div class="kpi"><span>Orders</span><strong>${d.orders.length}</strong></div><div class="kpi"><span>Status</span><strong>${u.banned ? 'Banned' : 'Active'}</strong></div></div>
      <section class="card"><h3>Adjust balance</h3>
        <form class="toolbar" id="balForm"><select class="admin-select" id="balMode"><option value="credit">Add funds</option><option value="debit">Deduct funds</option></select><input class="input" id="balAmt" type="number" min="1" step="any" placeholder="Amount (₦)" required /><input class="input" id="balNote" type="text" placeholder="Note (optional)" /><button class="btn btn-primary btn-sm" type="submit">Apply</button></form></section>
      <div class="toolbar" style="margin-top:12px"><button class="btn ${u.banned ? 'btn-secondary' : 'btn-danger'} btn-sm" id="banBtn" type="button">${u.banned ? 'Unban user' : 'Ban user'}</button></div>
      <h3 style="margin-top:16px">Recent transactions</h3>
      <div class="tbl-wrap"><table class="tbl"><tbody>${d.transactions.slice(0, 15).map((t) => `<tr><td class="sub">${esc(fmtDate(t.created_at))}</td><td>${esc(titleCase(t.type))}<div class="sub">${esc(t.description || '')}</div></td><td class="num">${ngn(t.amount)}</td><td><span class="badge ${esc(t.status)}">${esc(titleCase(t.status))}</span></td></tr>`).join('') || empty(4, 'No transactions')}</tbody></table></div>
      <h3 style="margin-top:16px">Recent orders</h3>
      <div class="tbl-wrap"><table class="tbl"><tbody>${d.orders.slice(0, 15).map((o) => `<tr><td class="sub">${esc(fmtDate(o.created_at))}</td><td>${esc(o.service)}<div class="sub">${esc(o.country)} · ${esc(o.phone_number || '')}</div></td><td class="num">${ngn(o.price)}</td><td><span class="badge ${esc(o.status)}">${esc(titleCase(o.status))}</span></td></tr>`).join('') || empty(4, 'No orders')}</tbody></table></div>`;
    m.querySelector('#balForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mode = m.querySelector('#balMode').value, amount = Number(m.querySelector('#balAmt').value), note = m.querySelector('#balNote').value;
      const yes = await confirmDialog({ title: mode === 'debit' ? 'Deduct funds' : 'Add funds', rows: [['User', u.email], ['Amount', ngn(amount)]], confirmText: 'Apply', danger: mode === 'debit' });
      if (!yes) return;
      try { const r = await post('balance', { id, amount, mode, note }); m.querySelector('#mBal').textContent = ngn(r.balance); toast('Balance updated.'); loadUsers(); }
      catch (err) { toast(err.message, 'error'); }
    });
    m.querySelector('#banBtn').addEventListener('click', async () => {
      const yes = await confirmDialog({ title: u.banned ? 'Unban user' : 'Ban user', rows: [['User', u.email]], warning: u.banned ? '' : 'They will not be able to sign in.', confirmText: u.banned ? 'Unban' : 'Ban', danger: !u.banned });
      if (!yes) return;
      try { await post('ban', { id, banned: !u.banned }); toast(u.banned ? 'User unbanned.' : 'User banned.'); m.remove(); loadUsers(); }
      catch (err) { toast(err.message, 'error'); }
    });
  }

  /* ---------- orders ---------- */
  async function loadOrders() {
    $('orderRows').innerHTML = loading(9);
    try {
      if (!users.length) { try { users = (await A('users')).users; users.forEach((u) => userEmail.set(u.id, u.email)); } catch {} }
      const list = (await A('orders', { query: { status: $('orderStatus').value } })).orders;
      $('orderRows').innerHTML = list.length ? list.map((o) => `<tr>
        <td class="sub">${esc(fmtDate(o.created_at))}</td><td>${who(o.user_id)}</td>
        <td>${esc(o.service)}<div class="sub">${esc(o.country)}</div></td><td class="num">${esc(o.phone_number || '—')}</td>
        <td><span class="badge ${esc(o.route)}">${o.route === 'budget' ? 'Budget' : 'Priority'}</span></td><td class="num">${ngn(o.price)}</td>
        <td class="num">${esc(o.otp || '—')}</td><td><span class="badge ${esc(o.status)}">${esc(titleCase(o.status))}</span></td>
        <td style="white-space:nowrap">${o.status === 'pending' ? `<button class="btn btn-secondary btn-sm" data-order="${esc(o.id)}" data-op="sync" type="button">Check</button> <button class="btn btn-danger btn-sm" data-order="${esc(o.id)}" data-op="cancel" type="button">Cancel &amp; refund</button>` : ''}</td></tr>`).join('') : empty(9, 'No orders.');
    } catch (err) { $('orderRows').innerHTML = empty(9, err.message); }
  }
  loaders.orders = loadOrders;
  $('orderStatus').addEventListener('change', loadOrders);
  $('orderReload').addEventListener('click', loadOrders);
  $('orderRows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-order]'); if (!b) return;
    if (b.dataset.op === 'cancel' && !(await confirmDialog({ title: 'Cancel and refund', rows: [['Order', short(b.dataset.order)]], confirmText: 'Cancel order', danger: true }))) return;
    setLoading(b, true, '…');
    try { await post('order', { id: b.dataset.order, op: b.dataset.op }); toast(b.dataset.op === 'cancel' ? 'Order cancelled and refunded.' : 'Order checked.'); loadOrders(); }
    catch (err) { toast(err.message, 'error'); setLoading(b, false); }
  });

  /* ---------- transactions ---------- */
  async function loadTxns() {
    $('txnRows').innerHTML = loading(7);
    try {
      if (!users.length) { try { users = (await A('users')).users; users.forEach((u) => userEmail.set(u.id, u.email)); } catch {} }
      const list = (await A('transactions', { query: { type: $('txnType').value, status: $('txnStatus').value, q: $('txnSearch').value.trim() } })).transactions;
      $('txnRows').innerHTML = list.length ? list.map((t) => `<tr>
        <td class="sub">${esc(fmtDate(t.created_at))}</td><td>${who(t.user_id)}</td>
        <td>${esc(titleCase(t.type))}<div class="sub">${esc(t.description || '')}</div></td><td class="num">${ngn(t.amount)}</td>
        <td class="mono sub">${esc(t.reference || '')}</td><td><span class="badge ${esc(t.status)}">${esc(titleCase(t.status))}</span></td>
        <td style="white-space:nowrap">${t.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-txn="${esc(t.id)}" data-op="approve" type="button">Approve</button> <button class="btn btn-danger btn-sm" data-txn="${esc(t.id)}" data-op="fail" type="button">Fail</button>` : ''}</td></tr>`).join('') : empty(7, 'No transactions.');
    } catch (err) { $('txnRows').innerHTML = empty(7, err.message); }
  }
  loaders.transactions = loadTxns;
  ['txnType', 'txnStatus'].forEach((id) => $(id).addEventListener('change', loadTxns));
  $('txnSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadTxns(); });
  $('txnReload').addEventListener('click', loadTxns);
  $('txnRows').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-txn]'); if (!b) return;
    const approve = b.dataset.op === 'approve';
    if (!(await confirmDialog({ title: approve ? 'Approve deposit' : 'Mark as failed', warning: approve ? 'Only approve if you have confirmed the payment was received. The wallet is credited immediately.' : '', confirmText: approve ? 'Approve' : 'Mark failed', danger: !approve }))) return;
    try { await post('txn', { id: b.dataset.txn, op: b.dataset.op }); toast(approve ? 'Deposit approved and credited.' : 'Marked as failed.'); loadTxns(); }
    catch (err) { toast(err.message, 'error'); }
  });

  /* ---------- settings ---------- */
  let current = {};
  function fill(s) {
    document.querySelectorAll('[data-key]').forEach((el) => {
      const v = s[el.dataset.key];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    });
  }
  loaders.settings = async () => {
    try { current = (await A('settings')).settings; fill(current); } catch (err) { toast(err.message, 'error'); }
  };
  $('settingsReset').addEventListener('click', () => fill(current));
  $('settingsSave').addEventListener('click', async (e) => {
    const patch = {};
    document.querySelectorAll('[data-key]').forEach((el) => { patch[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value || 0) : el.value; });
    if (patch.min_deposit <= 0) { toast('Minimum deposit must be above 0.', 'error'); return; }
    if (patch.max_deposit > 0 && patch.max_deposit < patch.min_deposit) { toast('Maximum deposit must be above the minimum.', 'error'); return; }
    if (patch.ngn_per_usd <= 0 || patch.budget_margin <= 0 || patch.priority_margin <= 0) { toast('Rate and margins must be above 0.', 'error'); return; }
    setLoading(e.target, true, 'Saving…');
    try { current = (await post('settings', { settings: patch })).settings; fill(current); toast('Settings saved. Live within a minute.'); }
    catch (err) { toast(err.message, 'error'); }
    setLoading(e.target, false);
  });

  /* ---------- admins ---------- */
  function renderAdmins(d) {
    const rows = [...d.env.map((e) => ({ email: e, env: true })), ...d.admins];
    $('adminList').innerHTML = rows.map((a) => `<li class="row"><div style="min-width:0"><div class="row-title">${esc(a.email)}</div><div class="row-sub">${a.env ? 'Set in server config' : `Added ${a.added_by ? 'by ' + esc(a.added_by) : ''} ${a.created_at ? esc(fmtDate(a.created_at)) : ''}`}</div></div>${a.env ? '' : `<div class="row-end"><button class="btn btn-quiet btn-sm" data-remove="${esc(a.email)}" type="button">Remove</button></div>`}</li>`).join('');
  }
  loaders.admins = async () => { try { renderAdmins(await A('admins')); } catch (err) { toast(err.message, 'error'); } };
  $('adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { renderAdmins(await post('admins', { email: $('adminEmail').value })); $('adminEmail').value = ''; toast('Admin added.'); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('adminList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    if (!(await confirmDialog({ title: 'Remove admin', rows: [['Email', b.dataset.remove]], confirmText: 'Remove', danger: true }))) return;
    try { renderAdmins(await post('admins', { email: b.dataset.remove, remove: true })); toast('Admin removed.'); }
    catch (err) { toast(err.message, 'error'); }
  });

  const start = (location.hash || '#overview').slice(1);
  show(loaders[start] ? start : 'overview');
})();
