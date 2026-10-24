// SPLUG API #3/5 — wallet (Afrstar gateway, naira)
// GET  /api/wallet?action=balance                  → balance
// POST /api/wallet?action=deposit                  → create Afrstar deposit order (min ₦1,000)
// POST /api/wallet?action=withdraw                 → create Afrstar bank payout (min ₦1,000)
// GET  /api/wallet?action=status&reference=...    → query gateway status

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

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

  // ---- deposit (Afrstar) ----
  if (action === 'deposit') {
    const amount = parseFloat(req.body?.amount);
    if (!amount || amount < MIN_DEPOSIT) {
      const e = new Error(`Minimum deposit is ₦${MIN_DEPOSIT.toLocaleString()}`); e.status = 400; throw e;
    }
    const reference = `DEP-${user.id.slice(0, 8)}-${Date.now()}`;

    const gateway = await afrstar.createDeposit({
      reference,
      amount,
      redirectUrl: `${process.env.SITE_URL || ''}/wallet.html?deposit=done`,
    });

    // record as pending; the webhook at /api/gateway finalizes it
    await supabase.insert('transactions', {
      user_id: user.id,
      type: 'deposit',
      amount,
      status: 'pending',
      reference,
      description: 'Wallet deposit via Afrstar',
    });

    return ok({
      reference,
      paymentUrl: gateway.payment_url || gateway.checkout_url || gateway.link || null,
      gateway,
    });
  }

  // ---- withdraw to bank (Afrstar) ----
  if (action === 'withdraw') {
    const { amount, bankCode, accountNumber, accountName } = req.body || {};
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_WITHDRAWAL) {
      const e = new Error(`Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}`); e.status = 400; throw e;
    }
    if (!bankCode || !accountNumber || !accountName) {
      const e = new Error('Bank code, account number and account name are required'); e.status = 400; throw e;
    }

    const reference = `WDL-${user.id.slice(0, 8)}-${Date.now()}`;

    // hold the funds atomically (pending transaction)
    await supabase.rpc('debit_wallet', {
      p_user: user.id,
      p_amount: amt,
      p_type: 'withdrawal',
      p_reference: reference,
      p_description: 'Withdrawal to bank account',
      p_pending: true,
    });

    try {
      const gateway = await afrstar.createWithdrawal({
        reference, amount: amt, bankCode, accountNumber, accountName,
      });
      return ok({ reference, status: gateway.status || 'processing', gateway });
    } catch (err) {
      // payout failed instantly → give the money back
      await supabase.rpc('credit_wallet', {
        p_user: user.id, p_amount: amt, p_type: 'refund',
        p_reference: reference, p_description: 'Withdrawal failed — funds returned',
      });
      throw err;
    }
  }

  // ---- gateway status check ----
  if (action === 'status') {
    const { reference } = req.query;
    if (!reference) { const e = new Error('reference is required'); e.status = 400; throw e; }
    const result = await afrstar.checkStatus(reference);
    return ok(result);
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
