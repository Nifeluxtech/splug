// SPLUG — Supabase REST helper (zero dependencies, plain fetch).
// Uses the user's JWT for reads (RLS-enforced) and the service-role
// key for admin writes / RPC money operations.

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, { method = 'GET', body, token, service = false, query = {} } = {}) {
  const url = new URL(SB_URL + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const headers = {
    apikey: service ? SERVICE : ANON,
    'Content-Type': 'application/json',
  };
  const bearer = token || (service ? SERVICE : ANON);
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const err = new Error(
      data?.msg || data?.message || data?.error_description || `Supabase error (${res.status})`
    );
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = {
  // auth (email + password, via Supabase Auth REST API)
  signUp: (email, password, metadata) =>
    sb('/auth/v1/signup', { method: 'POST', body: { email, password, data: metadata } }),
  signIn: (email, password) =>
    sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }),
  getUser: (token) => sb('/auth/v1/user', { token }),
  signOut: (token) => sb('/auth/v1/logout', { method: 'POST', token }),

  // data (user token = RLS-scoped reads, service role = admin writes)
  select: (table, query, token) => sb(`/rest/v1/${table}`, { query, token }),
  selectOne: async (table, query, token) => {
    const rows = await sb(`/rest/v1/${table}`, { query, token });
    return Array.isArray(rows) ? rows[0] || null : rows;
  },
  insert: (table, row) =>
    sb(`/rest/v1/${table}`, { method: 'POST', body: row, service: true, query: { select: '*' } }),
  update: (table, query, patch) =>
    sb(`/rest/v1/${table}`, { method: 'PATCH', body: patch, service: true, query }),
  rpc: (fn, args) =>
    sb(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, service: true }),
};
