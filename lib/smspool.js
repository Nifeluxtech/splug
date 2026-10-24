// SPLUG — SMSPool API wrapper + naira pricing.
// Docs: https://api.smspool.net/docs  (form-encoded POST, api key auth)
//
// Pricing: customer pays SMSPool's USD price converted at
//   NGN_PER_USD (default ₦1400/$) with PRICE_MARGIN (default x1.5).
//   Example: $1.00 number → 1.00 × 1400 × 1.5 = ₦2,100.

const BASE = 'https://api.smspool.net';

const NGN_PER_USD = parseFloat(process.env.NGN_PER_USD || '1400');
const PRICE_MARGIN = parseFloat(process.env.PRICE_MARGIN || '1.5');

// USD → naira (with margin), rounded up to the nearest naira.
function toNaira(usd) {
  const price = Math.ceil(Number(usd || 0) * NGN_PER_USD * PRICE_MARGIN);
  return Math.max(price, 50); // never cheaper than ₦50
}

async function call(path, params = {}) {
  const body = new URLSearchParams({ key: process.env.SMSPOOL_API_KEY, ...params });
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body });
  let data = null;
  try { data = await res.json(); } catch { data = null; }

  // SMSPool answers 200 with success:0 + message when a request is refused.
  if (!res.ok || (data && (data.success === 0 || data.error))) {
    const e = new Error(data?.message || data?.error?.message || `SMSPool error (${res.status})`);
    e.status = 502;
    throw e;
  }
  return data;
}

module.exports = {
  // pricing
  toNaira,
  NGN_PER_USD,
  PRICE_MARGIN,

  // catalogue
  services: () => call('/service/retrieve_all'),
  countries: () => call('/country/retrieve_all'),
  pricing: (service, country) => call('/request/pricing', { service, country }),

  // numbers
  purchaseSms: (country, service) => call('/purchase/sms', { country, service }),
  // check: status 1 = pending, 3 = received (sms field set), 6 = expired, 7 = cancelled
  checkSms: (orderId) => call('/sms/check', { orderid: orderId }),
  cancelSms: (orderId) => call('/sms/cancel', { orderid: orderId }),
};
