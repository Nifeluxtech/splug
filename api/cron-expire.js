// SPLUG — scheduled sweep (Vercel Cron): refunds numbers that expired unused,
// even if the buyer never came back to the dashboard.
// Protect with CRON_SECRET: Vercel sends it as "Authorization: Bearer <CRON_SECRET>".
const supabase = require('../lib/supabase');
const orders = require('../lib/orders');
const { handler, ok } = require('../lib/respond');

module.exports = handler(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    const e = new Error('Not authorised'); e.status = 401; throw e;
  }
  const cutoff = new Date(Date.now() - 25 * 60 * 1000).toISOString();
  const pending = await supabase.selectAdmin('orders', {
    status: 'eq.pending', created_at: `lt.${cutoff}`,
    select: '*', order: 'created_at.asc', limit: '200',
  });
  return ok(await orders.sweep(pending || []));
});
