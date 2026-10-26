// SPLUG API #4/5 — history
// GET /api/history?action=orders        → last 50 orders (numbers + OTPs)
// GET /api/history?action=transactions  → last 50 wallet transactions

const supabase = require('../lib/supabase');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

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
    return ok({ orders });
  }

  if (action === 'transactions') {
    const transactions = await supabase.select('transactions', {
      user_id: `eq.${user.id}`,
      order: 'created_at.desc',
      limit: '50',
      select: '*',
    }, token);
    return ok({ transactions });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
