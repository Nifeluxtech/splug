/* SPLUG — wallet (fund-only): balance, add funds via Afrstar, recent transactions.
   Wallet balance is for buying numbers on SPLUG and is not withdrawable. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const MIN_DEPOSIT = 1000;

  /* ---------- amount shortcuts (plain DOM, wired first) ---------- */
  function syncChips() {
    document.querySelectorAll('.chip[data-amt]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.amt === String($('depositAmount').value))));
  }
  document.querySelectorAll('.chip[data-amt]').forEach((chip) => chip.addEventListener('click', () => {
    $('depositAmount').value = chip.dataset.amt; syncChips(); $('depositAmount').focus();
  }));
  $('depositAmount').addEventListener('input', syncChips);

  if (typeof requireAuthPage !== 'function') { console.error('common.js is out of date — copy the full project.'); return; }
  if (!requireAuthPage()) return;
  mountHeader('wallet');

  // coming from "fund wallet" on the buy page → prefill the shortfall (respecting the minimum)
  const params = new URLSearchParams(location.search);
  const need = Number(params.get('need'));
  if (need > 0) { $('depositAmount').value = String(Math.max(MIN_DEPOSIT, Math.ceil(need / 50) * 50)); syncChips(); }

  async function loadBalance() {
    try {
      const value = await refreshBalanceChip();
      if (value == null) throw new Error('Please try again.');
      $('balanceAmount').textContent = naira(value);
      $('balanceNote').textContent = 'Available to spend on numbers. Wallet funds are not withdrawable.';
    } catch (err) {
      $('balanceAmount').textContent = '—';
      $('balanceNote').textContent = `Couldn't load your balance: ${err.message}`;
    }
  }

  async function loadTxns() {
    try {
      const data = await apiCall(API.history, { query: { action: 'transactions' } });
      const rows = (data.transactions || []).slice(0, 8);
      $('txnList').innerHTML = rows.length
        ? `<ul class="list">${rows.map(txnRow).join('')}</ul>`
        : emptyState({ icon: 'wallet', title: 'No transactions yet', text: 'Wallet funding, purchases and refunds will show up here.' });
    } catch (err) {
      $('txnList').innerHTML = emptyState({ icon: 'alert', title: 'Could not load transactions', text: err.message });
    }
  }

  $('depositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number($('depositAmount').value);
    if (!amount || amount < MIN_DEPOSIT) { toast(`Minimum funding amount is ${naira(MIN_DEPOSIT)}.`, 'error'); $('depositAmount').focus(); return; }
    const ok = await confirmDialog({
      title: 'Fund your wallet',
      rows: [['Amount', naira(amount)], ['Payment', 'Afrstar secure checkout']],
      warning: 'Wallet funds can only be used to buy numbers on SPLUG and cannot be withdrawn. Unused numbers you cancel are refunded to your wallet.',
      confirmText: 'Continue to payment',
    });
    if (!ok) return;
    const btn = e.target.querySelector('button[type=submit]');
    setLoading(btn, true, 'Creating payment…');
    try {
      const data = await apiCall(API.wallet, { method: 'POST', query: { action: 'deposit' }, body: { amount } });
      if (data.paymentUrl) { toast('Taking you to secure payment…'); window.location.href = data.paymentUrl; return; }
      toast(`Funding request ${data.reference} created.`);
      loadTxns();
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false);
  });

  /* ---------- returning from the payment page ---------- */
  if (params.get('deposit') === 'done') {
    history.replaceState(null, '', location.pathname);
    toast('Thanks. Your balance updates as soon as the payment is confirmed.');
    setTimeout(() => { loadBalance(); loadTxns(); }, 4000);
  }

  await Promise.all([loadBalance(), loadTxns()]);
})();
