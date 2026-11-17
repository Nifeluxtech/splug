// SPLUG — Korapay pay-ins (Checkout Redirect), using the same Korapay merchant account as YOLOTASK.
//   POST /merchant/api/v1/charges/initialize   → { checkout_url, reference }
//   GET  /merchant/api/v1/charges/{reference}  → { status, amount, amount_paid, ... }
// Webhook: header x-korapay-signature = HMAC-SHA256(JSON.stringify(body.data), secret key).
// The webhook is only a hint: the charge is always re-checked with Korapay before the wallet is credited.
// Amounts are in naira. Each charge sets its own notification_url, so YOLOTASK's dashboard webhook is untouched.

const crypto = require('crypto');

const BASE = (process.env.KORAPAY_BASE_URL || 'https://api.korapay.com').replace(/\/$/, '');
const SK = (process.env.KORAPAY_SECRET_KEY || '').trim();

function assertConfigured() {
  if (!SK) {
    const e = new Error('Payments are not set up yet. Add KORAPAY_SECRET_KEY to the server environment variables.');
    e.status = 503; throw e;
  }
}

async function call(method, path, body) {
  assertConfigured();
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    const e = new Error('Could not reach the payment gateway. Try again in a moment.'); e.status = 502; e.payment = true; throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.status !== true) {
    const e = new Error(`Korapay: ${data?.message || `HTTP ${res.status}`}`);
    e.status = 502; e.upstream = true; e.payment = true; e.http = res.status; throw e;
  }
  return data.data || {};
}

// Korapay wants a customer name; keep it to letters, digits and spaces.
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'SPLUG user';

module.exports = {
  isConfigured: () => !!SK,

  // Hosted checkout → { reference, pay_url }
  createDeposit: async ({ reference, amount, name, email, redirectUrl, notificationUrl }) => {
    const d = await call('POST', '/merchant/api/v1/charges/initialize', {
      reference,
      amount: Number(Number(amount).toFixed(2)),
      currency: 'NGN',
      redirect_url: redirectUrl,
      notification_url: notificationUrl,
      narration: 'SPLUG wallet deposit',
      merchant_bears_cost: true, // customer pays exactly the checkout total shown on SPLUG
      customer: { name: cleanName(name), email: email || 'customer@splug.nifelux.com' },
      metadata: { product: 'splug' },
    });
    if (!d.checkout_url) { const e = new Error('Korapay: no checkout link returned'); e.status = 502; e.upstream = true; e.payment = true; throw e; }
    return { reference: d.reference || reference, pay_url: d.checkout_url };
  },

  // Source of truth for a pay-in → { status, amount, paid, currency }
  verifyCharge: async (reference) => {
    const d = await call('GET', `/merchant/api/v1/charges/${encodeURIComponent(reference)}`);
    const amount = Number(d.amount);
    const paid = d.amount_paid != null ? Number(d.amount_paid) : amount;
    return { status: String(d.status || '').toLowerCase(), amount, paid, currency: String(d.currency || 'NGN').toUpperCase(), reference: d.reference || reference };
  },

  verifySignature: (body, signature) => {
    if (!SK || !body || body.data == null) return false;
    const sig = String(signature || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sig)) return false;
    const expected = crypto.createHmac('sha256', SK).update(JSON.stringify(body.data)).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  },
};
