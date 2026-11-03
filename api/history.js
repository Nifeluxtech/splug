// SPLUG API #4/5 — history
// GET /api/history?action=orders        → last 50 orders (numbers + OTPs)
// GET /api/history?action=transactions  → last 50 wallet transactions

const supabase = require('../lib/supabase');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');
const { publicOrder } = require('../lib/orders');

module.exports = handler(async (req, res) => {
  const { user, token } = await requireUser(req);
  const action = req.query.action;

  if (action === 'orders') {
    const orders = await supabase.select('orders', {
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: '50',
      select: '*',
    }, token);
    return ok({ orders: (orders || []).map(publicOrder) });
  }

  if (action === 'transactions') {
    const transactions = await supabase.select('transactions', {
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: '50',
      select: '*',
    }, token);
    const clean = (t) => String(t || '').replace(/\s*via afrstar/ig, '').replace(/^(fivesim|smspool)( purchase failed)? — refund$/i, 'Refund — number purchase failed').replace(/^(FIVESIM|SMSPOOL)-/, 'SPLUG-');
    return ok({ transactions: (transactions || []).map((t) => ({ ...t, description: clean(t.description), reference: clean(t.reference) })) });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
