// SPLUG — payment partner deposit callbacks (Korapay webhook + Afrstar collection callback)
// POST /api/gateway
//   Korapay: sent automatically (each charge carries notification_url = SITE_URL/api/gateway). Signed with
//            x-korapay-signature; the charge is then re-checked with Korapay before the wallet is credited.
//   Afrstar: the Collection callback URL in the Afrstar portal (kept so older Afrstar deposits still settle).
// Wallet is fund-only: payouts/withdrawals are not supported, so only deposit transactions are handled here.
// Verifies the MD5 signature, matches the stored order, applies the result once, and replies with plain text "success".

const supabase = require('../lib/supabase');
const afrstar = require('../lib/afrstar');
const { checkoutTotal } = require('../lib/fees');

const korapay = require('../lib/korapay');
const { settleKorapayDeposit } = require('../lib/deposits');

const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
const text = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain'); res.end(body); };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return text(res, 405, 'method not allowed');
  try {
    let ev = req.body || {};
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = {}; } }

    // ---- Korapay webhook ----
    const kSig = req.headers['x-korapay-signature'];
    if (kSig || (typeof ev.event === 'string' && ev.data && typeof ev.data === 'object')) {
      if (!korapay.verifySignature(ev, kSig)) return json(res, 401, { ok: false });
      const event = String(ev.event || '').toLowerCase();
      if (!event.startsWith('charge.')) return json(res, 200, { ok: true, ignored: true }); // SPLUG makes no payouts
      await settleKorapayDeposit(ev.data.reference || ev.data.payment_reference);
      return json(res, 200, { ok: true });
    }

    const reference = ev.order_sn;
    if (!reference || !ev.platform_osn) return text(res, 400, 'missing order');
    if (ev.merchant_sn && ev.merchant_sn !== afrstar.merchantSn()) return text(res, 400, 'merchant mismatch');

    const rows = await supabase.selectAdmin('transactions', { reference: `eq.${reference}`, limit: '1', select: '*' });
    const txn = rows && rows[0];
    if (!txn) return text(res, 404, 'unknown order');

    const status = Number(ev.status);
    if (txn.type !== 'deposit') return text(res, 400, 'unsupported transaction type');

    // signature uses the ORIGINAL checkout amount (wallet credit + service fee for DPF- deposits)
    const charged = checkoutTotal(txn);
    if (!afrstar.verifyCollectionCallback(ev, charged)) return text(res, 401, 'invalid signature');

    // idempotent: already settled → just acknowledge
    if (txn.status !== 'pending') return text(res, 200, 'success');

    if (status === 1) {
      const paid = Number(ev.amount_paid ?? ev.amount);
      if (!(paid >= charged)) return text(res, 200, 'success'); // underpaid: do not credit automatically
      await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: true });
      await require('../lib/rewards').onDepositConfirmed(txn);
    }
    return text(res, 200, 'success');
  } catch (e) {
    console.error('[splug] payment callback failed:', e.message);
    return text(res, 500, 'error'); // non-success so the gateway retries
  }
};
