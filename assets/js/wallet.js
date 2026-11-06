/* SPLUG — wallet (fund-only): balance, add funds via payment partner, recent transactions.
   Wallet balance is for buying numbers on SPLUG and is not withdrawable. */
(async function () {
  const $ = (id) => document.getElementById(id);
  let MIN_DEPOSIT = 500, MAX_DEPOSIT = 0, FEE_PCT = 3, CFG = {};
  let BANK_NOTE = 'OPay and PalmPay are currently unavailable for deposits. Please pay with any other bank.';
  const feeOf = (a) => Math.ceil(a * FEE_PCT / 100);
  const cashbackOf = (a) => {
    if (!CFG.cashback_enabled || !(CFG.cashback_percent > 0) || a < Number(CFG.cashback_min_deposit || 0)) return 0;
    let c = Math.floor(a * CFG.cashback_percent) / 100;
    if (CFG.cashback_max > 0) c = Math.min(c, CFG.cashback_max);
    return c;
  };

  /* ---------- amount shortcuts (plain DOM, wired first) ---------- */
  function syncChips() {
    document.querySelectorAll('.chip[data-amt]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.amt === String($('depositAmount').value))));
  }
  document.querySelectorAll('.chip[data-amt]').forEach((chip) => chip.addEventListener('click', () => {
    $('depositAmount').value = chip.dataset.amt; syncChips(); $('depositAmount').focus();
  }));
  $('depositAmount').addEventListener('input', syncChips);
  function syncFee() {
    const a = Number($('depositAmount').value);
    const el = $('feeHint'); if (!el) return;
    const cb = cashbackOf(a);
    el.textContent = a > 0
      ? `${FEE_PCT}% service fee: ${naira(feeOf(a))} · You pay ${naira(a + feeOf(a))}${cb ? ` · Cashback ${naira(cb)}` : ''}`
      : `Minimum ${nairaShort(MIN_DEPOSIT)}.${FEE_PCT ? ` A ${FEE_PCT}% service fee is added at checkout.` : ''}`;
  }
  $('depositAmount').addEventListener('input', syncFee);
  document.querySelectorAll('.chip[data-amt]').forEach((chip) => chip.addEventListener('click', syncFee));

  // live funding rules from admin settings
  try {
    CFG = await siteConfig();
    if (CFG.min_deposit) MIN_DEPOSIT = Number(CFG.min_deposit);
    MAX_DEPOSIT = Number(CFG.max_deposit || 0);
    if (CFG.deposit_fee_percent != null) FEE_PCT = Number(CFG.deposit_fee_percent);
    if (CFG.bank_notice != null) BANK_NOTE = CFG.bank_notice;
    const n = document.getElementById('bankNotice');
    if (n) { if (BANK_NOTE) n.querySelector('span').textContent = BANK_NOTE; else n.hidden = true; }
    $('depositAmount').min = String(MIN_DEPOSIT);
    syncFee();
  } catch {}

  if (typeof requireAuthPage !== 'function') { console.error('common.js is out of date — copy the full project.'); return; }
  if (!requireAuthPage()) return;
  mountHeader('wallet');

  // coming from "fund wallet" on the buy page → prefill the shortfall (respecting the minimum)
  const params = new URLSearchParams(location.search);
  const need = Number(params.get('need'));
  if (need > 0) { $('depositAmount').value = String(Math.max(MIN_DEPOSIT, Math.ceil(need / 50) * 50)); syncChips(); syncFee(); }

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
    if (CFG.maintenance_mode || CFG.deposits_enabled === false) { toast(CFG.maintenance_mode ? (CFG.maintenance_message || 'SPLUG is under maintenance.') : 'Wallet funding is paused right now.', 'error'); return; }
    if (!amount || amount < MIN_DEPOSIT) { toast(`Minimum funding amount is ${naira(MIN_DEPOSIT)}.`, 'error'); $('depositAmount').focus(); return; }
    if (MAX_DEPOSIT > 0 && amount > MAX_DEPOSIT) { toast(`Maximum funding amount is ${naira(MAX_DEPOSIT)}.`, 'error'); $('depositAmount').focus(); return; }
    const cb = cashbackOf(amount);
    const ok = await confirmDialog({
      title: 'Fund your wallet',
      rows: [['Wallet credit', naira(amount)], [`Service fee (${FEE_PCT}%)`, naira(feeOf(amount))], ['You pay', naira(amount + feeOf(amount))], ...(cb ? [['Cashback', naira(cb)]] : [])],
      warning: `${BANK_NOTE ? BANK_NOTE + ' ' : ''}Wallet funds can only be used to buy numbers on SPLUG and cannot be withdrawn.`,
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
