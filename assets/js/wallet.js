/* SPLUG — wallet: balance, deposit (Afrstar), withdraw (Afrstar bank payout) */

(async function () {
  if (!requireAuthPage()) return;
  mountFooter('wallet');

  const $ = (id) => document.getElementById(id);

  async function loadBalance() {
    try {
      const data = await apiCall(API.wallet, { query: { action: 'balance' } });
      $('balanceAmount').textContent = naira(data.balance);
    } catch {}
  }

  async function loadTxns() {
    try {
      const data = await apiCall(API.history, { query: { action: 'transactions' } });
      $('txnList').innerHTML =
        (data.transactions || [])
          .map((t) => {
            const negative = t.type === 'withdrawal' || t.type === 'purchase';
            const sign = negative ? '−' : '+';
            const cls = negative ? 'neg' : 'pos';
            return `
              <div class="list-row">
                <div>
                  <strong>${t.type}</strong> <span class="muted">${t.description || ''}</span>
                </div>
                <div class="${cls}">${sign}${naira(t.amount)}</div>
                <div class="muted small">${t.status} • ${fmtDate(t.created_at)}</div>
              </div>`;
          })
          .join('') || '<p class="muted">No transactions yet.</p>';
    } catch {}
  }

  await Promise.all([loadBalance(), loadTxns()]);

  /* ---------- deposit ---------- */
  $('depositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating order…';
    try {
      const data = await apiCall(API.wallet, {
        method: 'POST',
        query: { action: 'deposit' },
        body: { amount: $('depositAmount').value },
      });
      if (data.paymentUrl) {
        toast('Redirecting to payment…');
        window.location.href = data.paymentUrl;
      } else {
        toast(`Deposit order ${data.reference} created — complete it in your Afrstar dashboard.`);
        loadTxns();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
    btn.disabled = false; btn.textContent = 'Pay via Afrstar';
  });

  /* ---------- withdraw ---------- */
  $('withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const data = await apiCall(API.wallet, {
        method: 'POST',
        query: { action: 'withdraw' },
        body: {
          amount: $('withdrawAmount').value,
          bankCode: $('bankCode').value.trim(),
          accountNumber: $('accountNumber').value.trim(),
          accountName: $('accountName').value.trim(),
        },
      });
      toast(`Withdrawal submitted — ref ${data.reference}. Funds held until confirmed.`);
      $('withdrawForm').reset();
      loadBalance();
      loadTxns();
    } catch (err) {
      toast(err.message, 'error');
    }
    btn.disabled = false; btn.textContent = 'Withdraw';
  });
})();
