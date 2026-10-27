/* SPLUG — history: orders (numbers + OTPs) & transactions */
(async function () {
  if (!requireAuthPage()) return;
  mountHeader('history'); mountTabbar('history'); refreshBalanceChip();

  const $ = (id) => document.getElementById(id);
  let orders = [], filter = 'all';

  /* ---------- tabs ---------- */
  function showTab(which) {
    const isOrders = which === 'orders';
    $('tabOrders').setAttribute('aria-selected', String(isOrders));
    $('tabTxns').setAttribute('aria-selected', String(!isOrders));
    $('ordersPanel').hidden = !isOrders; $('txnsPanel').hidden = isOrders;
  }
  $('tabOrders').addEventListener('click', () => showTab('orders'));
  $('tabTxns').addEventListener('click', () => showTab('txns'));

  /* ---------- orders ---------- */
  const matches = (o) => filter === 'all' || (filter === 'closed' ? ['cancelled', 'expired'].includes(o.status) : o.status === filter);

  function orderRow(o) {
    const status = String(o.status || 'pending').toLowerCase();
    return `
      <li class="row">
        <div>
          <div class="row-title">${esc(o.service)} <span class="sep">·</span> ${esc(o.country)}</div>
          <div class="row-sub">${o.phone_number ? `<button class="copy-inline" type="button" data-copy="${esc(o.phone_number)}" title="Copy number">${esc(o.phone_number)}</button> · ` : ''}${esc(fmtDate(o.created_at))}</div>
        </div>
        ${o.otp
          ? `<button class="otp-pill has-code copy-inline" type="button" data-copy="${esc(o.otp)}" title="Copy code">${esc(o.otp)}</button>`
          : '<div class="otp-pill" title="No code received">––––</div>'}
        <div class="row-end"><span class="badge ${esc(status)}">${esc(titleCase(status))}</span><span class="amount neg">${naira(o.price)}</span></div>
      </li>`;
  }

  function renderOrders() {
    const rows = orders.filter(matches);
    if (!orders.length) {
      $('orderFilters').hidden = true;
      $('ordersList').innerHTML = emptyState({ icon: 'phone', title: 'No orders yet', text: 'Buy your first number and it will be listed here with its code.', href: '/dashboard.html', cta: 'Get a number' });
      return;
    }
    $('orderFilters').hidden = false;
    $('ordersList').innerHTML = rows.length
      ? `<ul class="list">${rows.map(orderRow).join('')}</ul>`
      : emptyState({ icon: 'inbox', title: 'Nothing in this view', text: 'Try a different filter.' });
  }

  document.querySelectorAll('#orderFilters .chip').forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    document.querySelectorAll('#orderFilters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderOrders();
  }));

  // tap a number or code to copy it
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-copy]'); if (!el) return;
    copyText(el.dataset.copy).then(() => toast('Copied'));
  });

  try {
    const data = await apiCall(API.history, { query: { action: 'orders' } });
    orders = data.orders || []; renderOrders();
  } catch (err) {
    $('ordersList').innerHTML = emptyState({ icon: 'alert', title: 'Could not load orders', text: err.message });
  }

  /* ---------- transactions ---------- */
  try {
    const data = await apiCall(API.history, { query: { action: 'transactions' } });
    const txns = data.transactions || [];
    $('txnsList').innerHTML = txns.length
      ? `<ul class="list">${txns.map(txnRow).join('')}</ul>`
      : emptyState({ icon: 'wallet', title: 'No transactions yet', text: 'Fund your wallet to get started.', href: '/wallet.html', cta: 'Add funds' });
  } catch (err) {
    $('txnsList').innerHTML = emptyState({ icon: 'alert', title: 'Could not load transactions', text: err.message });
  }
})();
