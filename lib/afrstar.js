// SPLUG — Afrstar Nigeria Payment API v2 (https://ngn.afrstar.com/doc/v2api.htm)
// All calls are JSON POSTs. Signatures are md5(concatenated field values, no separators).
// Success = response { code: 0 }. Amounts are always signed/sent with two decimals ("500.00").

const crypto = require('crypto');

const BASE = (process.env.AFRSTAR_BASE_URL || 'https://ngn.afrstar.com').replace(/\/$/, '');
const SN = process.env.AFRSTAR_MERCHANT_SN || process.env.AFRSTAR_MERCHANT_ID;      // merchant_sn (merchant code)
const AK = process.env.AFRSTAR_MERCHANT_AK || process.env.AFRSTAR_API_KEY;          // merchant_ak
const SK = process.env.AFRSTAR_MERCHANT_SK || process.env.AFRSTAR_SECRET_KEY;       // merchant_sk

const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
const amt = (n) => Number(n).toFixed(2);

function assertConfigured() {
  const missing = [];
  if (!SN) missing.push('AFRSTAR_MERCHANT_SN');
  if (!AK) missing.push('AFRSTAR_MERCHANT_AK');
  if (!SK) missing.push('AFRSTAR_MERCHANT_SK');
  if (missing.length) {
    const e = new Error('Payments are not set up yet. Add these environment variables on the server: ' + missing.join(', '));
    e.status = 503; throw e;
  }
}

async function call(path, payload) {
  assertConfigured();
  let res;
  try {
    res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    const e = new Error('Could not reach the payment gateway. Try again in a moment.'); e.status = 502; throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || Number(data.code) !== 0) {
    const e = new Error(data?.message || `Payment gateway error (${res.status})`);
    e.status = 502; throw e;
  }
  return data.data || {};
}

module.exports = {
  // Collection → { platform_osn, pay_url }
  createDeposit: ({ reference, amount, name, email, phone, redirectUrl }) => {
    assertConfigured();
    const a = amt(amount);
    return call('/gateway/payin/', {
      merchant_sn: SN, order_sn: reference, amount: a,
      name, email, phone, remark: 'SPLUG wallet deposit', redirect_url: redirectUrl,
      sign: md5(AK + reference + a + SK),
    });
  },

  // Collection callback signature uses the ORIGINAL stored order amount.
  verifyCollectionCallback: (ev, storedAmount) => {
    assertConfigured();
    return md5(AK + ev.platform_osn + ev.status + amt(storedAmount) + SK) === String(ev.sign || '').toLowerCase();
  },
  merchantSn: () => SN,
  amt,
};
