// SPLUG API #3/5 — wallet (Afrstar gateway, naira)
// GET  /api/wallet?action=balance                  → balance
// POST /api/wallet?action=deposit                  → create Afrstar deposit order (min ₦1,000)
// POST /api/wallet?action=withdraw                 → create Afrstar bank payout (min ₦1,000)
// GET  /api/wallet?action=banks                    → Nigerian payout bank list

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');
const { BANKS, bankByCode } = require('../lib/banks');

const MIN_DEPOSIT = 1000;   // ₦
const MIN_WITHDRAWAL = 1000; // ₦

module.exports = handler(async (req, res) => {
  const { user, token } = await requireUser(req);
  const action = req.query.action;

  // ---- balance ----
  if (action === 'balance') {
    const profile = await supabase.selectOne('profiles', { select: '*' }, token);
    return ok({
      balance: profile?.balance ?? 0,
      username: profile?.username || user.user_metadata?.username || '',
    });
  }

  // ---- bank list for payouts ----
  if (action === 'banks') {
    return ok({ banks: BANKS });
  }

  // ---- deposit (Afrstar hosted checkout) ----
  if (action === 'deposit') {
    const amount = parseFloat(req.body?.amount);
    if (!amount || amount < MIN_DEPOSIT) {
      const e = new Error(`Minimum deposit is ₦${MIN_DEPOSIT.toLocaleString()}`); e.status = 400; throw e;
    }
    const reference = `DEP-${user.id.slice(0, 8)}-${Date.now()}`;
    const site = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const profile = await supabase.selectOne('profiles', { select: '*' }, token).catch(() => null);
    const name = profile?.username || user.user_metadata?.username || (user.email || 'SPLUG user').split('@')[0];

    const gateway = await afrstar.createDeposit({
      reference,
      amount,
      name,
      email: user.email || '',
      phone: process.env.AFRSTAR_DEFAULT_PHONE || '08000000000',
      redirectUrl: `${site}/wallet.html?deposit=done`,
    });

    // record as pending; the callback at /api/gateway credits the wallet once Afrstar confirms payment
    await supabase.insert('transactions', {
      user_id: user.id,
      type: 'deposit',
      amount: Number(amount.toFixed(2)),
      status: 'pending',
      reference,
      description: 'Wallet deposit via Afrstar',
    });

    return ok({ reference, paymentUrl: gateway.pay_url || null });
  }

  // ---- withdraw to bank (Afrstar payout) ----
  if (action === 'withdraw') {
    const { amount, bankCode, accountNumber, accountName } = req.body || {};
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_WITHDRAWAL) {
      const e = new Error(`Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}`); e.status = 400; throw e;
    }
    const bank = bankByCode(bankCode);
    if (!bank) { const e = new Error('Choose a bank from the list'); e.status = 400; throw e; }
    if (!/^\d{10}$/.test(String(accountNumber || ''))) { const e = new Error('Account number must be 10 digits'); e.status = 400; throw e; }
    if (!String(accountName || '').trim()) { const e = new Error('Enter the account name'); e.status = 400; throw e; }

    const reference = `WDL-${user.id.slice(0, 8)}-${Date.now()}`;

    // hold the funds atomically (pending transaction)
    await supabase.rpc('debit_wallet', {
      p_user: user.id,
      p_amount: amt,
      p_type: 'withdrawal',
      p_reference: reference,
      p_description: `Withdrawal to ${bank.name} ${String(accountNumber).slice(-4).padStart(10, '•')}`,
      p_pending: true,
    });

    try {
      const gateway = await afrstar.createWithdrawal({
        reference, amount: amt, bankCode: bank.code, accountNumber: String(accountNumber), accountName: String(accountName).trim(),
      });
      return ok({ reference, status: gateway.status || 'processing' });
    } catch (err) {
      // payout rejected instantly → give the money back
      await supabase.rpc('credit_wallet', {
        p_user: user.id, p_amount: amt, p_type: 'refund',
        p_reference: reference, p_description: 'Withdrawal failed — funds returned',
      });
      throw err;
    }
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
