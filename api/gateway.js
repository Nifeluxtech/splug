// SPLUG API #5/5 — Afrstar webhook
// POST /api/gateway
// The gateway calls this when a deposit/withdrawal completes.
// Verifies the HMAC signature, then credits / refunds via SQL RPC.

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const { handler, ok } = require('../lib/respond');

module.exports = handler(async (req, res) => {
  // raw body (string when possible) for signature verification
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signature = req.headers['x-signature'] || req.headers['signature'];

  if (!afrstar.verifySignature(raw, signature)) {
    const e = new Error('Invalid signature'); e.status = 401; throw e;
  }

  const event = req.body || {};
  const reference = event.reference || event.transaction_id || event.order_id;
  const status = String(event.status || event.status_code || '').toLowerCase();

  if (!reference) { const e = new Error('Missing reference'); e.status = 400; throw e; }

  const rows = await supabase.select('transactions',
    { reference: `eq.${reference}`, limit: '1', select: '*' });
  const txn = rows && rows[0];
  if (!txn) { const e = new Error('Unknown reference'); e.status = 404; throw e; }

  // success / completed → finalize (deposit credits wallet here)
  if (status === 'success' || status === 'completed' || status === '1') {
    await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: true });
    return ok({ received: true });
  }

  // failed / cancelled → refund withdrawal holds, close failed deposits
  if (status === 'failed' || status === 'cancelled' || status === 'rejected') {
    await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: false });
    return ok({ received: true });
  }

  // still pending — nothing to do
  return ok({ received: true, ignored: status });
});
