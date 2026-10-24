// SPLUG — Afrstar NGN gateway wrapper (deposit & withdrawal).
//
// DOC: https://ngn.afrstar.com/doc/v2api.htm
// NOTE: that page blocks automated reading, so the endpoint paths and
// signature scheme below follow a conventional v2 merchant layout.
// ADJUST `PATHS`, `call()` and `verifySignature()` to match the exact
// doc once you have it open — the rest of SPLUG stays unchanged.

const crypto = require('crypto');

const BASE = process.env.AFRSTAR_BASE_URL || 'https://ngn.afrstar.com';
const MERCHANT = process.env.AFRSTAR_MERCHANT_ID;
const SECRET = process.env.AFRSTAR_SECRET_KEY;

const PATHS = {
  deposit: '/api/v2/deposit/create',     // ← ADJUST to official doc
  withdraw: '/api/v2/withdrawal/create', // ← ADJUST to official doc
  status: '/api/v2/transaction/status',  // ← ADJUST to official doc
};

function sign(payload) {
  return crypto.createHmac('sha512', SECRET)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}

async function call(path, payload) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Id': MERCHANT,
      'X-Signature': sign(payload),
    },
    body: JSON.stringify(payload),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok || (data && (data.status === false || data.success === 0))) {
    const e = new Error(data?.message || `Afrstar gateway error (${res.status})`);
    e.status = 502;
    throw e;
  }
  return data;
}

module.exports = {
  // returns payment url / reference for the user to pay
  createDeposit: ({ reference, amount, redirectUrl }) =>
    call(PATHS.deposit, {
      merchant_id: MERCHANT,
      reference,
      amount,
      currency: 'NGN',
      callback_url: `${process.env.SITE_URL || ''}/api/gateway`,
      redirect_url: redirectUrl,
    }),

  // bank transfer payout
  createWithdrawal: ({ reference, amount, bankCode, accountNumber, accountName }) =>
    call(PATHS.withdraw, {
      merchant_id: MERCHANT,
      reference,
      amount,
      currency: 'NGN',
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
    }),

  checkStatus: (reference) =>
    call(PATHS.status, { merchant_id: MERCHANT, reference }),

  verifySignature: (rawBody, signature) => {
    try {
      const expected = sign(rawBody);
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
    } catch {
      return false;
    }
  },
};
