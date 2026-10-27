/* SPLUG — history: orders (numbers + OTPs) & transactions */

(async function () {
  if (!requireAuthPage()) return;
  mountHeader('history');
  mountFooter('history');
  refreshBalanceChip();

  const $ = (id) => document.getElementById(id);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const showOrders = tab.dataset.tab === 'orders';
      $('ordersPanel').hidden = !showOrders;
      $('txnsPanel').hidden = showOrders;
    });
  });

  try {
    const data = await apiCall(API.history, { query: { action: 'orders' } });
    $('ordersList').innerHTML =
      (data.orders || [])
        .map(
          (o) => `
        <div class="list-row">
          <div>
            <strong>${o.service}</strong> <span class="muted">• ${o.country}</span><br/>
            <span class="muted small">${o.phone_number || ''} • ${fmtDate(o.created_at)}</span>
          </div>
          <div class="otp-pill">${o.otp || '—'}</div>
          <div>
            <span class="badge ${o.status}">${o.status}</span>
            <div class="muted small">${naira(o.price)}</div>
          </div>
        </div>`
        )
        .join('') || '<p class="muted">No orders yet — buy your first number on the dashboard.</p>';
  } catch (err) {
    $('ordersList').innerHTML = `<p class="muted">${err.message}</p>`;
  }

  try {
    const data = await apiCall(API.history, { query: { action: 'transactions' } });
    $('txnsList').innerHTML =
      (data.transactions || [])
        .map((t) => {
          const negative = t.type === 'withdrawal' || t.type === 'purchase';
          return `
        <div class="list-row">
          <div>
            <strong>${t.type}</strong> <span class="muted">${t.description || ''}</span><br/>
            <span class="muted small">${t.reference || ''} • ${fmtDate(t.created_at)}</span>
          </div>
          <div class="${negative ? 'neg' : 'pos'}">${negative ? '−' : '+'}${naira(t.amount)}</div>
          <div class="muted small">${t.status}</div>
        </div>`;
        })
        .join('') || '<p class="muted">No transactions yet.</p>';
  } catch (err) {
    $('txnsList').innerHTML = `<p class="muted">${err.message}</p>`;
  }
})();
