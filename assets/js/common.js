/* SPLUG by Nifelux — shared shell, API client, session, formatting, catalogue helpers, dialogs and pickers */

const API = {
  auth: '/api/auth', numbers: '/api/numbers', wallet: '/api/wallet', history: '/api/history',
};

const store = {
  get token() { return localStorage.getItem('splug_token'); },
  set token(v) { v ? localStorage.setItem('splug_token', v) : localStorage.removeItem('splug_token'); },
  get refreshToken() { return localStorage.getItem('splug_refresh_token'); },
  set refreshToken(v) { v ? localStorage.setItem('splug_refresh_token', v) : localStorage.removeItem('splug_refresh_token'); },
};

/* ---------- icons ---------- */
const svg = (d, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const icons = {
  home: (c) => svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', c),
  wallet: (c) => svg('<path d="M20 7H5a2 2 0 0 1 0-4h13v4z"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>', c),
  clock: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c),
  logout: (c) => svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>', c),
  copy: (c) => svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', c),
  check: (c) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', c),
  search: (c) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', c),
  eye: (c) => svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', c),
  eyeOff: (c) => svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4"/><path d="M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', c),
  down: (c) => svg('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>', c),
  up: (c) => svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>', c),
  cart: (c) => svg('<path d="M5 7h14l-1.2 11a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 7a3 3 0 0 1 6 0"/>', c),
  undo: (c) => svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', c),
  alert: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>', c),
  phone: (c) => svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>', c),
  inbox: (c) => svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>', c),
  menu: (c) => svg('<path d="M4 6h16M4 12h16M4 18h16"/>', c),
  close: (c) => svg('<path d="M6 6l12 12M18 6 6 18"/>', c),
  support: (c) => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>', c),
  bolt: (c) => svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', c),
  star: (c) => svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>', c),
  shield: (c) => svg('<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>', c),
  refresh: (c) => svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>', c),
  plus: (c) => svg('<path d="M12 5v14M5 12h14"/>', c),
  info: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>', c),
  lock: (c) => svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', c),
  globe: (c) => svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', c),
  arrow: (c) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', c),
  external: (c) => svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', c),
};
const brandMark = '<svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true"><defs><linearGradient id="bmg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs><rect width="28" height="28" rx="8" fill="url(#bmg)"/><path d="M10 6v5M18 6v5M8 11h12v3a6 6 0 0 1-12 0v-3zM14 20v3" stroke="#03130a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

/* ---------- formatting ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nairaShort = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || ''; } };
const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const wordsCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const normKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/* ---------- service catalogue: logos + friendly names ---------- */
// [match regex, local icon slug (assets/img/brands/<slug>.svg) or '', friendly label]
const SERVICE_BRANDS = [
  [/whats ?app/i, 'whatsapp', 'WhatsApp'],
  [/telegram/i, 'telegram', 'Telegram'],
  [/messenger/i, 'messenger', 'Messenger'],
  [/facebook|^fb$/i, 'facebook', 'Facebook'],
  [/instagram/i, 'instagram', 'Instagram'],
  [/threads/i, 'threads', 'Threads'],
  [/gmail/i, 'gmail', 'Gmail'],
  [/youtube/i, 'youtube', 'YouTube'],
  [/gemini/i, 'googlegemini', 'Gemini'],
  [/google|^go$/i, 'google', 'Google'],
  [/tik ?tok|douyin/i, 'tiktok', 'TikTok'],
  [/^x$|twitter|^x[ .(/]/i, 'x', 'X (Twitter)'],
  [/snapchat/i, 'snapchat', 'Snapchat'],
  [/discord/i, 'discord', 'Discord'],
  [/openai|chat ?gpt/i, '', 'OpenAI / ChatGPT'],
  [/claude|anthropic/i, 'claude', 'Claude'],
  [/deepseek/i, 'deepseek', 'DeepSeek'],
  [/perplexity/i, 'perplexity', 'Perplexity'],
  [/apple|icloud/i, 'apple', 'Apple'],
  [/microsoft|outlook|hotmail|skype/i, '', 'Microsoft'],
  [/amazon/i, '', 'Amazon'],
  [/aliexpress/i, 'aliexpress', 'AliExpress'],
  [/alibaba|alipay/i, 'alibabadotcom', 'Alibaba'],
  [/paypal/i, 'paypal', 'PayPal'],
  [/payoneer/i, 'payoneer', 'Payoneer'],
  [/^wise$|transferwise/i, 'wise', 'Wise'],
  [/revolut/i, 'revolut', 'Revolut'],
  [/cash ?app/i, 'cashapp', 'Cash App'],
  [/venmo/i, 'venmo', 'Venmo'],
  [/binance/i, 'binance', 'Binance'],
  [/coinbase/i, 'coinbase', 'Coinbase'],
  [/kucoin/i, 'kucoin', 'KuCoin'],
  [/okx/i, 'okx', 'OKX'],
  [/bybit/i, '', 'Bybit'],
  [/uber/i, 'uber', 'Uber'],
  [/lyft/i, 'lyft', 'Lyft'],
  [/^bolt|taxify/i, '', 'Bolt'],
  [/grab/i, 'grab', 'Grab'],
  [/gojek/i, 'gojek', 'Gojek'],
  [/doordash/i, 'doordash', 'DoorDash'],
  [/airbnb/i, 'airbnb', 'Airbnb'],
  [/netflix/i, 'netflix', 'Netflix'],
  [/spotify/i, 'spotify', 'Spotify'],
  [/steam/i, 'steam', 'Steam'],
  [/twitch/i, 'twitch', 'Twitch'],
  [/kick/i, 'kick', 'Kick'],
  [/epic ?games/i, 'epicgames', 'Epic Games'],
  [/roblox/i, 'roblox', 'Roblox'],
  [/playstation|psn/i, 'playstation', 'PlayStation'],
  [/nvidia/i, 'nvidia', 'NVIDIA'],
  [/viber/i, 'viber', 'Viber'],
  [/wechat|weixin/i, 'wechat', 'WeChat'],
  [/^line|line messenger/i, 'line', 'LINE'],
  [/signal/i, 'signal', 'Signal'],
  [/kakao/i, 'kakaotalk', 'KakaoTalk'],
  [/naver/i, 'naver', 'Naver'],
  [/zalo/i, 'zalo', 'Zalo'],
  [/tinder/i, 'tinder', 'Tinder'],
  [/badoo/i, 'badoo', 'Badoo'],
  [/bumble/i, '', 'Bumble'],
  [/linkedin/i, '', 'LinkedIn'],
  [/reddit/i, 'reddit', 'Reddit'],
  [/pinterest/i, 'pinterest', 'Pinterest'],
  [/tumblr/i, 'tumblr', 'Tumblr'],
  [/quora/i, 'quora', 'Quora'],
  [/bluesky/i, 'bluesky', 'Bluesky'],
  [/vkontakte|^vk$|^vk /i, 'vk', 'VK'],
  [/proton/i, 'protonmail', 'Proton Mail'],
  [/yahoo/i, '', 'Yahoo'],
  [/zoom/i, 'zoom', 'Zoom'],
  [/shopee/i, 'shopee', 'Shopee'],
  [/ebay/i, 'ebay', 'eBay'],
  [/^wish$/i, 'wish', 'Wish'],
];
const POPULAR_SERVICES = ['WhatsApp', 'Telegram', 'Google', 'TikTok', 'Facebook', 'Instagram', 'X (Twitter)', 'Snapchat', 'Discord', 'OpenAI / ChatGPT', 'Apple', 'Microsoft', 'Amazon', 'PayPal', 'Uber', 'Netflix', 'Binance', 'Tinder'];

function serviceInfo(raw) {
  const name = String(raw || '').trim();
  const hit = SERVICE_BRANDS.find(([re]) => re.test(name));
  const isKey = name === name.toLowerCase() && !/\s/.test(name); // 5sim ids such as "whatsapp"
  const label = hit && (isKey || normKey(hit[2]) === normKey(name)) ? hit[2] : (isKey ? wordsCase(name) : name);
  return { label: label || 'Service', slug: hit ? hit[1] : '', brand: hit ? hit[2] : '' };
}
function letterColor(s) {
  let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 34%), hsl(${(h + 40) % 360} 60% 24%))`;
}
function serviceLogo(raw, cls = '') {
  const info = serviceInfo(raw);
  if (info.slug) return `<span class="svc-logo ${cls}"><img src="/assets/img/brands/${info.slug}.svg" alt="" loading="lazy" decoding="async" data-letter="${esc(info.label.charAt(0).toUpperCase())}" /></span>`;
  return `<span class="svc-logo letter ${cls}" style="background:${letterColor(info.label)}" aria-hidden="true">${esc(info.label.charAt(0).toUpperCase() || '?')}</span>`;
}
// any brand image that fails to load falls back to its letter avatar
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.letter) return;
  const box = img.parentElement; box.classList.add('letter'); box.style.background = letterColor(img.dataset.letter); box.textContent = img.dataset.letter;
}, true);

/* ---------- countries: flags + friendly names ---------- */
// [ISO2, display name, ...aliases (5sim keys / SMSPool spellings)]
const COUNTRY_TABLE = [
  ['NG', 'Nigeria'], ['GH', 'Ghana'], ['KE', 'Kenya'], ['ZA', 'South Africa', 'southafrica'], ['EG', 'Egypt'], ['MA', 'Morocco'], ['DZ', 'Algeria'], ['TN', 'Tunisia'],
  ['CM', 'Cameroon'], ['CI', 'Côte d’Ivoire', 'ivorycoast', 'ivory coast', 'cote divoire'], ['SN', 'Senegal'], ['BJ', 'Benin'], ['TG', 'Togo'], ['BF', 'Burkina Faso', 'burkinafaso'],
  ['ML', 'Mali'], ['NE', 'Niger'], ['TD', 'Chad'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau', 'guineabissau'], ['GQ', 'Equatorial Guinea', 'equatorialguinea'], ['SL', 'Sierra Leone', 'sierraleone'],
  ['LR', 'Liberia'], ['GM', 'Gambia'], ['CV', 'Cape Verde', 'capeverde', 'cabo verde'], ['MR', 'Mauritania'], ['ET', 'Ethiopia'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['RW', 'Rwanda'],
  ['BI', 'Burundi'], ['DJ', 'Djibouti'], ['SO', 'Somalia'], ['SD', 'Sudan'], ['SS', 'South Sudan', 'southsudan'], ['AO', 'Angola'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'], ['MW', 'Malawi'],
  ['MZ', 'Mozambique'], ['MG', 'Madagascar'], ['MU', 'Mauritius'], ['SC', 'Seychelles'], ['KM', 'Comoros'], ['NA', 'Namibia'], ['BW', 'Botswana'], ['LS', 'Lesotho'], ['SZ', 'Eswatini', 'swaziland'],
  ['GA', 'Gabon'], ['CG', 'Congo', 'republic of the congo'], ['CD', 'DR Congo', 'drcongo', 'congo dr', 'democratic republic of the congo'], ['CF', 'Central African Republic', 'centralafricanrepublic'], ['LY', 'Libya'], ['RE', 'Réunion', 'reunion'],
  ['US', 'United States', 'usa', 'united states of america', 'us'], ['CA', 'Canada'], ['MX', 'Mexico'], ['GB', 'United Kingdom', 'england', 'uk', 'great britain'], ['IE', 'Ireland'], ['FR', 'France'],
  ['DE', 'Germany'], ['NL', 'Netherlands', 'holland'], ['BE', 'Belgium'], ['LU', 'Luxembourg'], ['CH', 'Switzerland'], ['AT', 'Austria'], ['IT', 'Italy'], ['ES', 'Spain'], ['PT', 'Portugal'],
  ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'], ['IS', 'Iceland'], ['PL', 'Poland'], ['CZ', 'Czechia', 'czech', 'czech republic'], ['SK', 'Slovakia'], ['HU', 'Hungary'],
  ['RO', 'Romania'], ['BG', 'Bulgaria'], ['GR', 'Greece'], ['CY', 'Cyprus'], ['MT', 'Malta'], ['HR', 'Croatia'], ['SI', 'Slovenia'], ['RS', 'Serbia'], ['BA', 'Bosnia & Herzegovina', 'bih', 'bosnia and herzegovina', 'bosnia'],
  ['ME', 'Montenegro'], ['MK', 'North Macedonia', 'northmacedonia', 'macedonia'], ['AL', 'Albania'], ['XK', 'Kosovo'], ['MD', 'Moldova'], ['UA', 'Ukraine'], ['BY', 'Belarus'], ['RU', 'Russia', 'russian federation'],
  ['EE', 'Estonia'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['GE', 'Georgia'], ['AM', 'Armenia'], ['AZ', 'Azerbaijan'], ['TR', 'Türkiye', 'turkey'], ['GI', 'Gibraltar'],
  ['KZ', 'Kazakhstan'], ['UZ', 'Uzbekistan'], ['KG', 'Kyrgyzstan'], ['TJ', 'Tajikistan'], ['TM', 'Turkmenistan'], ['MN', 'Mongolia'], ['AF', 'Afghanistan'], ['PK', 'Pakistan'], ['IN', 'India'],
  ['BD', 'Bangladesh'], ['LK', 'Sri Lanka', 'srilanka'], ['NP', 'Nepal'], ['BT', 'Bhutan', 'bhutane'], ['MV', 'Maldives'], ['MM', 'Myanmar', 'burma'], ['TH', 'Thailand'], ['LA', 'Laos'], ['KH', 'Cambodia'],
  ['VN', 'Vietnam', 'viet nam'], ['MY', 'Malaysia'], ['SG', 'Singapore'], ['ID', 'Indonesia'], ['PH', 'Philippines'], ['TL', 'Timor-Leste', 'easttimor', 'east timor'], ['BN', 'Brunei'], ['CN', 'China'],
  ['HK', 'Hong Kong', 'hongkong'], ['MO', 'Macau', 'macao'], ['TW', 'Taiwan'], ['JP', 'Japan'], ['KR', 'South Korea', 'southkorea', 'korea'], ['AU', 'Australia'], ['NZ', 'New Zealand', 'newzealand'],
  ['PG', 'Papua New Guinea', 'papuanewguinea'], ['FJ', 'Fiji'], ['SB', 'Solomon Islands', 'solomonislands'], ['WS', 'Samoa'], ['NC', 'New Caledonia', 'newcaledonia'],
  ['SA', 'Saudi Arabia', 'saudiarabia'], ['AE', 'United Arab Emirates', 'uae', 'emirates', 'unitedarabemirates'], ['QA', 'Qatar'], ['KW', 'Kuwait'], ['BH', 'Bahrain'], ['OM', 'Oman'], ['YE', 'Yemen'],
  ['JO', 'Jordan'], ['LB', 'Lebanon'], ['SY', 'Syria'], ['IQ', 'Iraq'], ['IR', 'Iran'], ['IL', 'Israel'], ['PS', 'Palestine'],
  ['BR', 'Brazil'], ['AR', 'Argentina'], ['CL', 'Chile'], ['CO', 'Colombia'], ['PE', 'Peru'], ['VE', 'Venezuela'], ['EC', 'Ecuador'], ['BO', 'Bolivia'], ['PY', 'Paraguay'], ['UY', 'Uruguay'],
  ['GY', 'Guyana'], ['SR', 'Suriname'], ['GF', 'French Guiana', 'frenchguiana'], ['PA', 'Panama'], ['CR', 'Costa Rica', 'costarica'], ['NI', 'Nicaragua'], ['HN', 'Honduras'], ['SV', 'El Salvador', 'salvador', 'elsalvador'],
  ['GT', 'Guatemala'], ['BZ', 'Belize'], ['CU', 'Cuba'], ['DO', 'Dominican Republic', 'dominicana', 'dominicanrepublic'], ['HT', 'Haiti'], ['JM', 'Jamaica'], ['PR', 'Puerto Rico', 'puertorico'],
  ['TT', 'Trinidad & Tobago', 'tit', 'trinidad and tobago', 'trinidad'], ['BB', 'Barbados'], ['BS', 'Bahamas'], ['AG', 'Antigua & Barbuda', 'antiguaandbarbuda', 'antigua and barbuda'], ['DM', 'Dominica'],
  ['LC', 'Saint Lucia', 'saintlucia'], ['KN', 'Saint Kitts & Nevis', 'saintkittsandnevis'], ['VC', 'Saint Vincent & Grenadines', 'saintvincentandgrenadines'], ['GD', 'Grenada'], ['AW', 'Aruba'],
  ['GP', 'Guadeloupe'], ['MQ', 'Martinique'], ['MS', 'Montserrat'], ['KY', 'Cayman Islands', 'caymanislands'], ['BM', 'Bermuda'],
];
const COUNTRY_INDEX = (() => {
  const map = new Map();
  for (const [iso, name, ...aliases] of COUNTRY_TABLE) {
    const rec = { iso, name };
    [name, iso, ...aliases].forEach((k) => { const key = normKey(k); if (key && !map.has(key)) map.set(key, rec); });
  }
  return map;
})();
const flagEmoji = (iso) => (/^[A-Z]{2}$/i.test(iso || '') ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '🌐');
function countryInfo(row) {
  const r = typeof row === 'object' && row ? row : { name: row };
  let iso = '';
  if (typeof r.iso === 'string') iso = r.iso;
  else if (r.iso && typeof r.iso === 'object') iso = Object.keys(r.iso)[0] || '';
  if (!iso && /^[A-Z]{2}$/i.test(r.short_name || '')) iso = r.short_name;
  const rec = COUNTRY_INDEX.get(normKey(r.name)) || COUNTRY_INDEX.get(normKey(r.id)) || (iso ? COUNTRY_INDEX.get(normKey(iso)) : null);
  if (!iso && rec) iso = rec.iso;
  const raw = String(r.name || r.id || '');
  const name = rec ? rec.name : (raw === raw.toLowerCase() ? wordsCase(raw) : raw);
  return { iso: iso.toUpperCase(), name, flag: flagEmoji(iso) };
}

/* ---------- API client ---------- */
async function apiCall(url, { method = 'GET', body, query = {}, retry = true } = {}) {
  const qs = new URLSearchParams(query).toString();
  let res;
  try {
    res = await fetch(`${url}${qs ? '?' + qs : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
  } catch {
    throw new Error('You appear to be offline. Check your connection and try again.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const authFailure = res.status === 401 || /invalid jwt|token is expired|session expired|not authenticated/i.test(json.message || '');
    if (authFailure && retry && url !== API.auth && store.refreshToken) {
      try {
        const refreshed = await apiCall(API.auth, { method: 'POST', body: { action: 'refresh', refresh_token: store.refreshToken }, retry: false });
        store.token = refreshed.access_token;
        if (refreshed.refresh_token) store.refreshToken = refreshed.refresh_token;
        return apiCall(url, { method, body, query, retry: false });
      } catch {}
    }
    if (authFailure && url !== API.auth) {
      store.token = null; store.refreshToken = null;
      window.location.replace('/login.html');
    }
    throw new Error(json.message || 'Something went wrong. Please try again.');
  }
  return json.data;
}

/* ---------- shell ---------- */
// Pages ship their header/sidebar/footer as static HTML. These functions wire them up.
function wirePublicHeader() {
  const header = document.querySelector('.site-header');
  if (!header || header.dataset.wired) return;
  header.dataset.wired = '1';
  const toggle = header.querySelector('.menu-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = open ? icons.close() : icons.menu();
  });
  if (store.token) {
    document.querySelectorAll('[data-guest]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('[data-member]').forEach((el) => { el.hidden = false; });
  }
}

function wireAppShell() {
  const body = document.body;
  if (body.dataset.shellWired) return;
  body.dataset.shellWired = '1';
  const openBtn = document.getElementById('navOpen');
  const backdrop = document.querySelector('.side-backdrop');
  const setOpen = (on) => { body.classList.toggle('nav-open', on); if (openBtn) openBtn.setAttribute('aria-expanded', String(on)); };
  if (openBtn) openBtn.addEventListener('click', () => setOpen(!body.classList.contains('nav-open')));
  if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', logout));
  if (document.querySelector('.tabbar')) body.classList.add('has-tabbar');
}

function mountHeader(active = '') {
  if (['public', 'login', 'register'].includes(active)) wirePublicHeader();
  else wireAppShell();
}
function mountTabbar() { wireAppShell(); }
const mountFooter = mountTabbar; // backwards-compatible name

function requireAuthPage() {
  if (!store.token) { window.location.replace('/login.html'); return false; }
  return true;
}

async function logout() {
  try { await apiCall(API.auth, { method: 'POST', body: { action: 'logout' }, retry: false }); } catch {}
  store.token = null; store.refreshToken = null; window.location.href = '/login.html';
}

const balance = { value: null, username: '' };
async function refreshBalanceChip() {
  if (!store.token) return null;
  try {
    const data = await apiCall(API.wallet, { query: { action: 'balance' } });
    balance.value = Number(data.balance || 0);
    balance.username = data.username || balance.username;
    document.querySelectorAll('[data-balance]').forEach((el) => { el.textContent = naira(balance.value); });
    const chip = document.getElementById('balanceChip'); if (chip) chip.hidden = false;
    const user = document.getElementById('userChip');
    if (user && balance.username) { user.textContent = balance.username.charAt(0).toUpperCase(); user.title = balance.username; user.hidden = false; }
    document.dispatchEvent(new CustomEvent('splug:balance', { detail: balance.value }));
    return balance.value;
  } catch { return null; }
}

/* ---------- small helpers ---------- */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (btn) {
    if (btn._old == null) btn._old = btn.innerHTML;
    btn.innerHTML = `${icons.check('icon-sm')} Copied`;
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.innerHTML = btn._old; btn._old = null; }, 1500);
  }
}

function toast(message, type = 'success') {
  let el = document.getElementById('splugToast');
  if (!el) { el = document.createElement('div'); el.id = 'splugToast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.textContent = message; el.className = `toast show ${type}`;
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 4200);
}

function setLoading(btn, on, text) {
  if (on) { btn._idle = btn.innerHTML; btn.disabled = true; btn.classList.add('is-loading'); if (text) btn.setAttribute('aria-label', text); }
  else { btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-label'); if (btn._idle) btn.innerHTML = btn._idle; }
}

/* Promise-based confirm dialog: confirmDialog({ title, rows: [[label, value]], warning, confirmText, danger }) */
function confirmDialog({ title, rows = [], warning = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    if (typeof HTMLDialogElement === 'undefined' || !document.createElement('dialog').showModal) {
      resolve(window.confirm([title, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n'))); return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    dlg.innerHTML = `
      <form method="dialog">
        <div class="dlg-body">
          <h2 id="dlgTitle">${esc(title)}</h2>
          ${rows.length ? `<dl class="dlg-rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          ${warning ? `<p class="dlg-warn">${esc(warning)}</p>` : ''}
        </div>
        <div class="dlg-actions">
          <button class="btn btn-secondary" value="cancel">${esc(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" autofocus>${esc(confirmText)}</button>
        </div>
      </form>`;
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'ok'; dlg.remove(); resolve(ok); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close('cancel'); });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/* Searchable list picker. Optional renderItem(item) → inner HTML, searchText(item) → string to match. */
function createPicker(root, { placeholder = 'Search…', label = 'Options', onSelect = () => {}, renderItem = null, searchText = null } = {}) {
  root.classList.add('picker');
  const uid = 'pk' + Math.random().toString(36).slice(2, 8);
  root.innerHTML = `
    <div class="picker-search">${icons.search('icon-sm')}<input type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" aria-controls="${uid}" /></div>
    <ul class="picker-list" id="${uid}" role="listbox" aria-label="${esc(label)}"></ul>`;
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  const MAX = 250;
  let items = [], query = '', value = '', message = 'Loading…', locked = true;
  const text = (it) => (searchText ? searchText(it) : it.name).toLowerCase();

  function visible() {
    const q = query.trim().toLowerCase();
    return q ? items.filter((it) => text(it).includes(q)) : items;
  }
  function render() {
    root.classList.toggle('is-disabled', locked);
    input.disabled = locked;
    if (locked || !items.length) { list.innerHTML = `<li class="picker-note">${esc(message || 'Nothing to show')}</li>`; return; }
    const rows = visible();
    if (!rows.length) { list.innerHTML = `<li class="picker-note">No match for “${esc(query)}”</li>`; return; }
    list.innerHTML = rows.slice(0, MAX).map((it) => {
      const sel = String(it.id) === value;
      const inner = renderItem ? renderItem(it) : `<span class="grow">${esc(it.name)}</span>`;
      return `<li role="presentation"><button type="button" class="picker-opt" role="option" aria-selected="${sel}" data-id="${esc(it.id)}">${inner}${sel ? icons.check('icon-sm') : ''}</button></li>`;
    }).join('') + (rows.length > MAX ? `<li class="picker-more">Showing ${MAX} of ${rows.length}. Keep typing to narrow the list.</li>` : '');
  }
  function choose(id) {
    const it = items.find((x) => String(x.id) === String(id));
    if (!it) return;
    value = String(it.id); render(); onSelect(it);
  }
  input.addEventListener('input', () => { query = input.value; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { const f = list.querySelector('.picker-opt'); if (f) { e.preventDefault(); f.focus(); } }
    if (e.key === 'Enter') { e.preventDefault(); const first = visible()[0]; if (first && query.trim()) choose(first.id); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.picker-opt'); if (b) choose(b.dataset.id); });
  list.addEventListener('keydown', (e) => {
    const b = e.target.closest('.picker-opt'); if (!b) return;
    const all = [...list.querySelectorAll('.picker-opt')]; const i = all.indexOf(b);
    if (e.key === 'ArrowDown') { e.preventDefault(); (all[i + 1] || b).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); i === 0 ? input.focus() : all[i - 1].focus(); }
  });
  render();
  return {
    setItems(next) { items = next || []; value = ''; query = ''; input.value = ''; locked = false; message = 'Nothing available'; render(); },
    lock(msg) { items = []; value = ''; query = ''; input.value = ''; locked = true; message = msg; render(); },
    get value() { return value; },
    get selected() { return items.find((x) => String(x.id) === value) || null; },
  };
}

/* ---------- shared list renderers ---------- */
const TXN = {
  deposit: { label: 'Wallet funding', dir: 'in', icon: 'down' },
  refund: { label: 'Refund', dir: 'in', icon: 'undo' },
  purchase: { label: 'Number purchase', dir: 'out', icon: 'cart' },
  withdrawal: { label: 'Withdrawal (legacy)', dir: 'out', icon: 'up' }, // historical rows only; withdrawals are no longer offered
};
function txnRow(t) {
  const meta = TXN[t.type] || { label: titleCase(t.type), dir: 'in', icon: 'down' };
  const out = meta.dir === 'out';
  const status = String(t.status || '').toLowerCase();
  return `
    <li class="row txn">
      <div class="txn-ico ${out ? '' : 'in'}">${icons[meta.icon]('icon-sm')}</div>
      <div style="min-width:0">
        <div class="row-title">${esc(meta.label)}</div>
        <div class="row-sub">${esc(t.description || t.reference || '')}</div>
        <div class="row-sub">${esc(fmtDate(t.created_at))}</div>
      </div>
      <div class="row-end">
        <span class="amount ${out ? 'neg' : 'pos'}">${out ? '−' : '+'}${naira(t.amount)}</span>
        <span class="badge ${esc(status)}">${esc(titleCase(status))}</span>
      </div>
    </li>`;
}
const ORDER_STATUS = { pending: 'Waiting', received: 'Received', cancelled: 'Cancelled', canceled: 'Cancelled', expired: 'Expired' };
const skeleton = (n = 4) => `<div class="skeleton" aria-hidden="true">${'<i></i>'.repeat(n)}</div>`;
function emptyState({ icon = 'inbox', title, text, href, cta }) {
  return `<div class="empty"><div class="empty-ico">${icons[icon]('icon')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${href ? `<a class="btn btn-primary btn-sm" href="${href}">${esc(cta)}</a>` : ''}</div>`;
}

// public pages wire themselves; app pages call mountHeader() from their own script
document.addEventListener('DOMContentLoaded', () => { if (document.querySelector('.site-header')) wirePublicHeader(); });

/* ---------- auto-refund sweep: refunds numbers that expired unused while you were away ---------- */
async function sweepExpired() {
  try {
    const r = await apiCall(API.numbers, { query: { action: 'sweep' } });
    if (r && r.refunded > 0) {
      toast(`${naira(r.refunded_amount)} refunded to your wallet for ${r.refunded} expired number${r.refunded > 1 ? 's' : ''}.`);
      refreshBalanceChip();
    }
    return r;
  } catch { return null; }
}
