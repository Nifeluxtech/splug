/* SPLUG — wallet: balance, deposit (Afrstar), withdraw (Afrstar bank payout) */
(async function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- tabs + amount shortcuts (plain DOM, wired first) ---------- */
  function showPane(which) {
    const dep = which === 'deposit';
    $('tabDeposit').setAttribute('aria-selected', String(dep));
    $('tabWithdraw').setAttribute('aria-selected', String(!dep));
    $('paneDeposit').hidden = !dep; $('paneWithdraw').hidden = dep;
  }
  function syncChips() {
    document.querySelectorAll('.chip[data-amt]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.amt === String($('depositAmount').value))));
  }
  $('tabDeposit').addEventListener('click', () => showPane('deposit'));
  $('tabWithdraw').addEventListener('click', () => showPane('withdraw'));
  document.querySelectorAll('.chip[data-amt]').forEach((chip) => chip.addEventListener('click', () => {
    $('depositAmount').value = chip.dataset.amt; syncChips(); $('depositAmount').focus();
  }));
  $('depositAmount').addEventListener('input', syncChips);

  if (typeof requireAuthPage !== 'function') { console.error('common.js is out of date — copy the full project.'); return; }
  if (!requireAuthPage()) return;
  mountHeader('wallet'); mountTabbar('wallet');

  async function loadBalance() {
    try {
      const data = await apiCall(API.wallet, { query: { action: 'balance' } });
      balance.value = Number(data.balance || 0);
      $('balanceAmount').textContent = naira(balance.value);
      $('balanceNote').textContent = 'Withdrawals are held until they are confirmed.';
      refreshBalanceChip();
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
        : emptyState({ icon: 'wallet', title: 'No transactions yet', text: 'Deposits, purchases and refunds will show up here.' });
    } catch (err) {
      $('txnList').innerHTML = emptyState({ icon: 'alert', title: 'Could not load transactions', text: err.message });
    }
  }

  $('depositForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number($('depositAmount').value);
    if (!amount || amount < 1000) { toast('Minimum deposit is ₦1,000.', 'error'); $('depositAmount').focus(); return; }
    const btn = e.target.querySelector('button[type=submit]');
    setLoading(btn, true, 'Creating payment…');
    try {
      const data = await apiCall(API.wallet, { method: 'POST', query: { action: 'deposit' }, body: { amount } });
      if (data.paymentUrl) { toast('Taking you to payment…'); window.location.href = data.paymentUrl; return; }
      toast(`Deposit ${data.reference} created. Complete it in your Afrstar dashboard.`);
      loadTxns();
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false);
  });

  /* ---------- withdraw ---------- */
  $('withdrawForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number($('withdrawAmount').value);
    const bankCode = $('bankCode').value.trim(), accountNumber = $('accountNumber').value.trim(), accountName = $('accountName').value.trim();
    if (!amount || amount < 1000) { toast('Minimum withdrawal is ₦1,000.', 'error'); $('withdrawAmount').focus(); return; }
    if (balance.value != null && amount > balance.value) { toast(`You can withdraw up to ${naira(balance.value)}.`, 'error'); return; }
    if (!bankCode || !/^\d{10}$/.test(accountNumber) || !accountName) { toast('Check the bank code, a 10-digit account number and the account name.', 'error'); return; }

    const ok = await confirmDialog({
      title: 'Confirm withdrawal',
      rows: [['Amount', naira(amount)], ['Account name', accountName], ['Account number', accountNumber], ['Bank code', bankCode]],
      warning: 'Bank details can’t be changed after you submit. Check them carefully.',
      confirmText: 'Withdraw',
    });
    if (!ok) return;

    const btn = e.target.querySelector('button[type=submit]');
    setLoading(btn, true, 'Submitting…');
    try {
      const data = await apiCall(API.wallet, { method: 'POST', query: { action: 'withdraw' }, body: { amount, bankCode, accountNumber, accountName } });
      toast(`Withdrawal submitted (ref ${data.reference}). Funds are held until it’s confirmed.`);
      $('withdrawForm').reset(); loadBalance(); loadTxns();
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false);
  });

  /* ---------- returning from the payment page ---------- */
  if (new URLSearchParams(location.search).get('deposit') === 'done') {
    history.replaceState(null, '', location.pathname);
    toast('Thanks. Your balance updates as soon as the payment is confirmed.');
    setTimeout(() => { loadBalance(); loadTxns(); }, 4000);
  }

  await Promise.all([loadBalance(), loadTxns()]);
})();
