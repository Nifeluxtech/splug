// SPLUG API #3/5 — wallet (payment partner gateway, naira)
// GET  /api/wallet?action=balance                  → balance
// POST /api/wallet?action=deposit                  → create deposit order (min ₦500, plus 3% service fee)
// POST /api/wallet?action=confirm {reference}      → re-check a Korapay deposit after returning from checkout
// Gateway: Korapay (YOLOTASK's Korapay account) once KORAPAY_SECRET_KEY is set. PAYMENT_GATEWAY=afrstar switches back.
// Wallet is fund-only: balances are spent on numbers and are not withdrawable.

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const korapay = require('../lib/korapay');
const { settleKorapayDeposit } = require('../lib/deposits');
// Korapay whenever its key is set (unless PAYMENT_GATEWAY=afrstar); Afrstar until then, so funding never breaks mid-switch.
const GATEWAY = (process.env.PAYMENT_GATEWAY || '').trim().toLowerCase() === 'afrstar' || !korapay.isConfigured() ? 'afrstar' : 'korapay';
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

  // ---- deposit (hosted checkout: Korapay, or Afrstar when PAYMENT_GATEWAY=afrstar) ----
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

    const redirectUrl = `${site}/wallet.html?deposit=done&ref=${encodeURIComponent(reference)}`;

    // record as pending first, so a fast webhook always finds the row; the callback at /api/gateway credits the wallet
    await supabase.insert('transactions', {
      user_id: user.id,
      type: 'deposit',
      amount: credit,
      status: 'pending',
      reference,
      description: `Wallet deposit (₦${credit.toLocaleString()} + ₦${fee.toLocaleString()} service fee)`,
    });

    let gateway;
    try {
      gateway = GATEWAY === 'afrstar'
        ? await afrstar.createDeposit({ reference, amount: total, name, email: user.email || '', phone: process.env.AFRSTAR_DEFAULT_PHONE || '08000000000', redirectUrl })
        : await korapay.createDeposit({ reference, amount: total, name, email: user.email || '', redirectUrl, notificationUrl: `${site}/api/gateway` });
    } catch (err) {
      // checkout never opened: close the pending row so it does not sit in the admin queue
      const rows = await supabase.selectAdmin('transactions', { reference: `eq.${reference}`, limit: '1', select: 'id' }).catch(() => null);
      if (rows && rows[0]) await supabase.rpc('finalize_txn', { p_txn: rows[0].id, p_success: false }).catch(() => null);
      throw err;
    }

    return ok({ reference, amount: credit, fee, total, paymentUrl: gateway.pay_url || null });
  }

  // ---- confirm a Korapay deposit when the customer comes back from checkout ----
  if (action === 'confirm') {
    const reference = String(req.body?.reference || req.query.reference || '').trim();
    if (!/^D(PF|EP)-[A-Za-z0-9-]+$/.test(reference)) { const e = new Error('Unknown payment reference'); e.status = 400; throw e; }
    if (GATEWAY !== 'korapay') return ok({ reference, status: 'pending', amount: null });
    let result;
    try { result = await settleKorapayDeposit(reference, user.id); }
    catch (err) { console.error('[splug] deposit confirm failed:', reference, err.message); result = { status: 'pending' }; }
    return ok({ reference, status: result.status, amount: result.amount ?? null });
  }

  // referral programme: my code, link, invitees and earnings
  if (action === 'referrals') {
    const cfg = await settings.load();
    const me = await supabase.selectAdmin('profiles', { id: `eq.${user.id}`, select: 'referral_code', limit: '1' });
    const invited = await supabase.selectAdmin('profiles', { referred_by: `eq.${user.id}`, select: 'username,created_at', order: 'created_at.desc', limit: '200' });
    const rewards = await supabase.selectAdmin('transactions', { user_id: `eq.${user.id}`, type: 'eq.referral', reference: 'like.REF-*', select: 'amount,description,created_at', order: 'created_at.desc', limit: '200' });
    const site = (process.env.PUBLIC_SITE_URL || 'https://splug.nifelux.com').replace(/\/$/, '');
    const code = me?.[0]?.referral_code || '';
    const mask = (u) => { const s = String(u || 'user'); return s.length <= 3 ? s[0] + '**' : s.slice(0, 2) + '***' + s.slice(-1); };
    return ok({
      enabled: !!cfg.referral_enabled, percent: cfg.referral_percent, min_deposit: cfg.referral_min_deposit,
      max_per_deposit: cfg.referral_max_per_deposit, deposit_limit: cfg.referral_deposit_limit,
      welcome_bonus: cfg.referral_welcome_bonus, welcome_min_deposit: cfg.referral_welcome_min_deposit,
      code, link: code ? `${site}/register?ref=${code}` : '',
      invited: (invited || []).map((p) => ({ name: mask(p.username), joined: p.created_at })),
      earned: (rewards || []).reduce((a, t) => a + Number(t.amount || 0), 0),
      rewards: (rewards || []).slice(0, 30),
    });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
