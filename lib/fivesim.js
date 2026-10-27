// SPLUG — 5sim provider integration.
// 5sim is the cheap route: the UI selects service first, then country.

const BASE = 'https://5sim.net';
const TOKEN = process.env.FIVESIM_API_KEY || process.env.FIVESIM_TOKEN;
const NGN_PER_USD = parseFloat(process.env.NGN_PER_USD || '1400');
const PRICE_MARGIN = parseFloat(process.env.FIVESIM_PRICE_MARGIN || '1.8');

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function toNaira(usd) {
  return Math.max(50, Math.ceil(money(usd) * NGN_PER_USD * PRICE_MARGIN));
}

async function request(path, { auth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) {
    if (!TOKEN) throw new Error('5sim is not configured');
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  const res = await fetch(`${BASE}${path}`, { headers });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok || data?.error) {
    const error = new Error(data?.message || data?.error || `5sim error (${res.status})`);
    error.status = res.status === 401 ? 502 : 502;
    throw error;
  }
  return data;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return value && typeof value === 'object' ? Object.entries(value).map(([key, item]) => ({ key, ...(item || {}) })) : [];
}

function countryRows(raw) {
  return asArray(raw).map((row) => {
    const id = row.key || row.iso || row.code || row.name;
    const name = row.name || row.title || row.key || row.iso || 'Unknown';
    return id ? { id: String(id).toLowerCase(), name: String(name), prefix: row.prefix || '' } : null;
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function numeric(node, keys) {
  for (const key of keys) {
    if (node && node[key] != null && money(node[key]) > 0) return money(node[key]);
  }
  return 0;
}

function flattenOffers(node, path = [], output = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => flattenOffers(item, [...path, String(index)], output));
    return output;
  }
  if (!node || typeof node !== 'object') return output;

  const price = numeric(node, ['cost', 'price', 'Price', 'rate']);
  if (price > 0) {
    output.push({
      product: node.product || node.service || path[Math.max(0, path.length - 2)] || '',
      operator: node.operator || node.Operator || path[path.length - 1] || 'any',
      usd: price,
      stock: Number(node.count ?? node.qty ?? node.quantity ?? node.Qty ?? 0),
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object') flattenOffers(value, [...path, key], output);
  }
  return output;
}

async function countries() {
  return countryRows(await request('/v1/guest/countries'));
}

async function priceRows(country, product) {
  const query = new URLSearchParams();
  if (country) query.set('country', country);
  if (product) query.set('product', product);
  const raw = await request(`/v1/guest/prices?${query}`);
  const rows = flattenOffers(raw);
  return rows.filter((row) => !product || String(row.product).toLowerCase() === String(product).toLowerCase());
}

async function services(country) {
  const rows = await priceRows(country);
  const grouped = new Map();
  for (const row of rows) {
    const product = String(row.product || '').trim();
    if (!product) continue;
    const current = grouped.get(product);
    if (!current || row.usd < current.usd) grouped.set(product, { id: product, name: product, usd: row.usd, price: toNaira(row.usd), operator: row.operator, stock: row.stock });
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function quote(country, product) {
  const rows = await priceRows(country, product);
  const available = rows.filter((row) => row.usd > 0 && (row.stock === 0 || row.stock > 0));
  if (!available.length) {
    const error = new Error('5sim has no available number for this country and service');
    error.status = 409;
    throw error;
  }
  available.sort((a, b) => a.usd - b.usd);
  const cheapest = available[0];
  const virtual8 = available.find((row) => String(row.operator).toLowerCase() === 'virtual8');
  const selected = virtual8 || cheapest;
  return { ...selected, price: toNaira(selected.usd), currency: 'NGN', provider: 'fivesim' };
}

async function purchase(country, operator, product) {
  return request(`/v1/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(operator || 'any')}/${encodeURIComponent(product)}`, { auth: true });
}

async function check(id) {
  return request(`/v1/user/check/${encodeURIComponent(id)}`, { auth: true });
}

async function cancel(id) {
  return request(`/v1/user/cancel/${encodeURIComponent(id)}`, { auth: true });
}

module.exports = { countries, services, quote, purchase, check, cancel, toNaira, NGN_PER_USD, PRICE_MARGIN };
