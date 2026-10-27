// SPLUG — SMSPool API wrapper + naira pricing. v2 (catalogue fix)
//
// Pricing: customer pays SMSPool's USD price converted at
//   NGN_PER_USD (default ₦1400/$) with PRICE_MARGIN (default x1.5).

const BASE = 'https://api.smspool.net';
const KEY = process.env.SMSPOOL_API_KEY;

const NGN_PER_USD = parseFloat(process.env.NGN_PER_USD || '1400');
const PRICE_MARGIN = parseFloat(process.env.PRICE_MARGIN || '1.5');

// USD → naira (with margin), rounded up to the nearest naira.
function toNaira(usd) {
  const price = Math.ceil(Number(usd || 0) * NGN_PER_USD * PRICE_MARGIN);
  return Math.max(price, 50); // never cheaper than ₦50
}

async function request(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok || (data && (data.success === 0 || data.error))) {
    const msg =
      data?.message ||
      data?.error?.message ||
      (res.status === 429 ? 'SMSPool rate limit — try again in a moment' : `SMSPool error (${res.status})`);
    const e = new Error(msg);
    e.status = 502;
    throw e;
  }
  return data;
}

// catalogue endpoints are GET (key passed as query param)
function get(path, params = {}) {
  const qs = new URLSearchParams({ key: KEY, ...params }).toString();
  return request(`${BASE}${path}?${qs}`, { method: 'GET' });
}

// purchase/check/cancel are documented as POST (form-encoded)
function post(path, params = {}) {
  return request(`${BASE}${path}`, {
    method: 'POST',
    body: new URLSearchParams({ key: KEY, ...params }),
  });
}

// tolerate both raw arrays and { success: 1, data: [...] } shapes
const asArray = (x) =>
  Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : [];

// SMSPool returns { ID, name, short_name }; the UI expects { id, name }
const rows = (list) =>
  asArray(list)
    .map((r) => ({ ...r, id: String(r.id ?? r.ID ?? r.short_name ?? ''), name: String(r.name ?? r.short_name ?? '').trim() }))
    .filter((r) => r.id && r.name)
    .sort((a, b) => a.name.localeCompare(b.name));

// Quote: SMSPool's documented endpoint is /request/price (country + service → { price }).
// Falls back to /request/pricing tiers (cheapest) if that returns nothing.
async function price(service, country) {
  let lastErr;
  const tries = [
    () => post('/request/price', { country, service }),
    () => get('/request/price', { country, service }),
  ];
  for (const attempt of tries) {
    try {
      const d = await attempt();
      const p = Number(d?.price ?? d?.cost);
      if (p > 0) return { price: p };
    } catch (e) { lastErr = lastErr || e; }
  }
  try {
    const d = await get('/request/pricing', { service, country });
    const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [d];
    const prices = list.map((x) => Number(x?.price ?? x?.cost)).filter((n) => n > 0);
    if (prices.length) return { price: Math.min(...prices) };
  } catch (e) { lastErr = lastErr || e; }
  throw lastErr || new Error('No price was found for this service and country');
}

module.exports = {
  price,
  // pricing
  toNaira,
  NGN_PER_USD,
  PRICE_MARGIN,

  // catalogue
  services: async () => rows(await get('/service/retrieve_all')),
  countries: async () => rows(await get('/country/retrieve_all')),
  pricing: (service, country) => get('/request/pricing', { service, country }),

  // numbers
  purchaseSms: (country, service) => post('/purchase/sms', { country, service, pricing_option: '1' }),
  // check: status 1 = pending, 3 = received (sms field set), 6 = expired, 7 = cancelled
  checkSms: (orderId) => post('/sms/check', { orderid: orderId }),
  cancelSms: (orderId) => post('/sms/cancel', { orderid: orderId }),
};
