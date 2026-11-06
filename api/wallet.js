// SPLUG API #3/5 — wallet (payment partner gateway, naira)
// GET  /api/wallet?action=balance                  → balance
// POST /api/wallet?action=deposit                  → create deposit order (min ₦500, plus 3% service fee)
// Wallet is fund-only: balances are spent on numbers and are not withdrawable.

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

const { serviceFee } = require('../lib/fees');
const settings = require('../lib/settings');

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

  // ---- deposit (Afrstar hosted checkout) ----
  if (action === 'deposit') {
    const cfg = await settings.load();
    if (cfg.maintenance_mode) { const e = new Error(cfg.maintenance_message || 'SPLUG is under maintenance.'); e.status = 503; e.safe = true; throw e; }
    if (!cfg.deposits_enabled) { const e = new Error('Wallet funding is paused right now. Please try again later.'); e.status = 409; throw e; }
    const amount = parseFloat(req.body?.amount);
    if (!amount || amount < cfg.min_deposit) {
      const e = new Error(`Minimum deposit is ₦${Number(cfg.min_deposit).toLocaleString()}`); e.status = 400; throw e;
    }
    if (cfg.max_deposit > 0 && amount > cfg.max_deposit) {
      const e = new Error(`Maximum deposit is ₦${Number(cfg.max_deposit).toLocaleString()}`); e.status = 400; throw e;
    }
    const credit = Number(amount.toFixed(2));
    const fee = serviceFee(credit, cfg.deposit_fee_percent);
    const total = Number((credit + fee).toFixed(2));
    // DPF- marks a deposit whose checkout total includes the service fee (wallet is credited the amount only).
    const reference = `DPF-${user.id.slice(0, 8)}-${Date.now()}-F${fee}`;
    const site = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
    const profile = await supabase.selectOne('profiles', { select: '*' }, token).catch(() => null);
    const name = profile?.username || user.user_metadata?.username || (user.email || 'SPLUG user').split('@')[0];

    const gateway = await afrstar.createDeposit({
      reference,
      amount: total,
      name,
      email: user.email || '',
      phone: process.env.AFRSTAR_DEFAULT_PHONE || '08000000000',
      redirectUrl: `${site}/wallet.html?deposit=done`,
    });

    // record as pending; the callback at /api/gateway credits the wallet once Afrstar confirms payment
    await supabase.insert('transactions', {
      user_id: user.id,
      type: 'deposit',
      amount: credit,
      status: 'pending',
      reference,
      description: `Wallet deposit (₦${credit.toLocaleString()} + ₦${fee.toLocaleString()} service fee)`,
    });

    return ok({ reference, amount: credit, fee, total, paymentUrl: gateway.pay_url || null });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
