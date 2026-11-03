// SPLUG — Afrstar collection (deposit) callback
// POST /api/gateway   — set this URL as the Collection callback in the Afrstar merchant portal.
// Wallet is fund-only: payouts/withdrawals are not supported, so only deposit transactions are handled here.
// Verifies the MD5 signature, matches the stored order, applies the result once, and replies with plain text "success".

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');

const text = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain'); res.end(body); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return text(res, 405, 'method not allowed');
  try {
    let ev = req.body || {};
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = {}; } }

    const reference = ev.order_sn;
    if (!reference || !ev.platform_osn) return text(res, 400, 'missing order');
    if (ev.merchant_sn && ev.merchant_sn !== afrstar.merchantSn()) return text(res, 400, 'merchant mismatch');

    const rows = await supabase.selectAdmin('transactions', { reference: `eq.${reference}`, limit: '1', select: '*' });
    const txn = rows && rows[0];
    if (!txn) return text(res, 404, 'unknown order');

    const status = Number(ev.status);
    if (txn.type !== 'deposit') return text(res, 400, 'unsupported transaction type');

    // signature (deposit signs with the ORIGINAL order amount we stored)
    if (!afrstar.verifyCollectionCallback(ev, txn.amount)) return text(res, 401, 'invalid signature');

    // idempotent: already settled → just acknowledge
    if (txn.status !== 'pending') return text(res, 200, 'success');

    if (status === 1) {
      const paid = Number(ev.amount_paid ?? ev.amount);
      if (!(paid >= Number(txn.amount))) return text(res, 200, 'success'); // underpaid: do not credit automatically
      await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: true });
    }
    return text(res, 200, 'success');
  } catch (e) {
    return text(res, 500, 'error'); // non-success so Afrstar retries
  }
};
