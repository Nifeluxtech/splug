// SPLUG — site settings, editable from the admin panel (table public.app_settings, key 'site').
// Cached briefly per function instance. Falls back to defaults if the table is missing.
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULTS = {
  // deposits
  deposits_enabled: true,
  min_deposit: 500,
  max_deposit: 1000000,
  deposit_fee_percent: 3,
  bank_notice: 'OPay and PalmPay are currently unavailable for deposits. Please pay with any other bank.',
  // deposit cashback (credited to the wallet after a confirmed deposit)
  cashback_enabled: false,
  cashback_percent: 0,
  cashback_min_deposit: 1000,
  cashback_max: 0,             // ₦ cap per deposit, 0 = no cap
  // referrals (referrer earns a % of each confirmed deposit their invitee makes)
  referral_enabled: true,
  referral_percent: 5,
  referral_min_deposit: 500,     // invitee deposits below this earn nothing
  referral_max_per_deposit: 0,   // ₦ cap per deposit, 0 = no cap
  referral_deposit_limit: 0,     // how many of each invitee's deposits pay a reward, 0 = all
  referral_welcome_bonus: 0,     // ₦ credited to the invitee on their first confirmed deposit
  referral_welcome_min_deposit: 1000,
  // pricing
  ngn_per_usd: parseFloat(process.env.NGN_PER_USD || '1400'),
  budget_margin: parseFloat(process.env.FIVESIM_PRICE_MARGIN || '1.8'),
  priority_margin: parseFloat(process.env.PRICE_MARGIN || '1.5'),
  min_price: 50,
  // routes
  budget_enabled: true,
  priority_enabled: true,
  // site
  registration_enabled: true,
  maintenance_mode: false,
  maintenance_message: 'SPLUG is undergoing maintenance. Buying and funding are paused for a short while.',
  announcement: '',
  support_email: 'contact@nifelux.com',
  support_whatsapp: '',
};

const TYPES = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, typeof v]));
let cache = { at: 0, value: { ...DEFAULTS } };

async function load(force = false) {
  if (!force && Date.now() - cache.at < 30000) return cache.value;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/app_settings?key=eq.site&select=value`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    const rows = res.ok ? await res.json() : [];
    cache = { at: Date.now(), value: { ...DEFAULTS, ...((rows && rows[0] && rows[0].value) || {}) } };
  } catch (e) {
    console.error('[splug] settings load failed:', e.message);
    cache = { at: Date.now(), value: { ...DEFAULTS, ...cache.value } };
  }
  return cache.value;
}

const get = () => cache.value;

// Coerce and validate an admin patch against the known keys.
function clean(patch = {}) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in TYPES)) continue;
    if (TYPES[k] === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) { const e = new Error(`Invalid value for ${k}`); e.status = 400; throw e; }
      out[k] = n;
    } else if (TYPES[k] === 'boolean') out[k] = v === true || v === 'true';
    else out[k] = String(v ?? '').slice(0, 1000);
  }
  return out;
}

async function save(patch) {
  const current = await load(true);
  const value = { ...current, ...clean(patch) };
  const res = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'site', value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) { const e = new Error('Could not save settings'); e.status = 500; throw e; }
  cache = { at: Date.now(), value };
  return value;
}

// What any visitor may see.
function publicView(s = get()) {
  const keys = ['deposits_enabled', 'min_deposit', 'max_deposit', 'deposit_fee_percent', 'bank_notice', 'cashback_enabled', 'cashback_percent',
    'cashback_min_deposit', 'cashback_max', 'budget_enabled', 'priority_enabled', 'registration_enabled', 'maintenance_mode',
    'maintenance_message', 'announcement', 'support_email', 'support_whatsapp', 'referral_enabled', 'referral_percent', 'referral_min_deposit',
    'referral_max_per_deposit', 'referral_deposit_limit', 'referral_welcome_bonus', 'referral_welcome_min_deposit'];
  return Object.fromEntries(keys.map((k) => [k, s[k]]));
}

// Naira price from a supplier USD price.
function toNaira(usd, route) {
  const s = get();
  const margin = route === 'budget' ? s.budget_margin : s.priority_margin;
  return Math.max(Number(s.min_price) || 0, Math.ceil(Number(usd || 0) * Number(s.ngn_per_usd) * Number(margin)));
}

function cashbackFor(amount) {
  const s = get();
  if (!s.cashback_enabled || !(s.cashback_percent > 0) || Number(amount) < Number(s.cashback_min_deposit || 0)) return 0;
  let cb = Math.floor(Number(amount) * Number(s.cashback_percent)) / 100;
  if (s.cashback_max > 0) cb = Math.min(cb, Number(s.cashback_max));
  return Math.round(cb * 100) / 100;
}

function referralFor(amount) {
  const s = get();
  if (!s.referral_enabled || !(s.referral_percent > 0) || Number(amount) < Number(s.referral_min_deposit || 0)) return 0;
  let r = Math.floor(Number(amount) * Number(s.referral_percent)) / 100;
  if (s.referral_max_per_deposit > 0) r = Math.min(r, Number(s.referral_max_per_deposit));
  return Math.round(r * 100) / 100;
}

module.exports = { DEFAULTS, load, get, save, publicView, toNaira, cashbackFor, referralFor };
