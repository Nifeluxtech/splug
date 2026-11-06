// SPLUG API — admin panel + public site config.
// GET  /api/admin?action=public                       → public settings (no auth)
// Everything else needs a signed-in user whose email is in public.admins (or env ADMIN_EMAILS).
//   GET  me | stats | users | user | orders | transactions | settings | admins
//   POST balance | ban | settings | admins | txn | order

const supabase = require('../lib/supabase');
const settings = require('../lib/settings');
const orders = require('../lib/orders');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; throw e; };

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(SB_URL + path, { method, headers: prefer ? { ...H, Prefer: prefer } : H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) bad(data?.msg || data?.message || `Database error (${res.status})`, res.status >= 500 ? 500 : 400);
  return { data, range: res.headers.get('content-range') };
}
const count = async (table, filter = '') => {
  const { range } = await rest(`/rest/v1/${table}?select=id${filter ? '&' + filter : ''}&limit=1`, { prefer: 'count=exact' });
  return Number(String(range || '').split('/')[1] || 0);
};
const rows = async (table, qs) => (await rest(`/rest/v1/${table}?${qs}`)).data || [];
const sum = (list, f = 'amount') => list.reduce((a, r) => a + Number(r[f] || 0), 0);

async function adminEmails() {
  const env = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  const list = await rows('admins', 'select=email,added_by,created_at&order=created_at.asc').catch(() => []);
  return { env, list };
}
async function requireAdmin(req) {
  const { user } = await requireUser(req);
  const email = String(user.email || '').toLowerCase();
  const { env, list } = await adminEmails();
  if (!email || !(env.includes(email) || list.some((a) => a.email === email))) bad('Admins only', 403);
  return user;
}

async function authUsers(page = 1, perPage = 200) {
  const { data } = await rest(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
  return data?.users || [];
}
const isBanned = (u) => !!(u.banned_until && new Date(u.banned_until) > new Date());

module.exports = handler(async (req) => {
  const action = req.query.action || req.body?.action;
  const post = req.method === 'POST';

  if (action === 'public') return ok(settings.publicView(await settings.load()));

  const me = await requireAdmin(req);

  if (action === 'me') return ok({ email: me.email });

  // ---------- overview ----------
  if (action === 'stats') {
    const day = new Date(Date.now() - 864e5).toISOString();
    const week = new Date(Date.now() - 7 * 864e5).toISOString();
    const [users, profiles, ordersTotal, orders24, pendingOrders, txWeek, pendingDeposits, recentOrders] = await Promise.all([
      count('profiles'),
      rows('profiles', 'select=balance&limit=100000'),
      count('orders'),
      count('orders', `created_at=gte.${day}`),
      count('orders', 'status=eq.pending'),
      rows('transactions', `select=type,amount,status,created_at&created_at=gte.${week}&limit=100000`),
      count('transactions', 'type=eq.deposit&status=eq.pending'),
      rows('orders', `select=status,price,created_at&created_at=gte.${week}&limit=100000`),
    ]);
    const ok24 = (t) => t.created_at >= day;
    const dep = txWeek.filter((t) => t.type === 'deposit' && t.status === 'success');
    const pur = txWeek.filter((t) => t.type === 'purchase' && t.status === 'success');
    const ref = txWeek.filter((t) => t.type === 'refund');
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(Date.now() - (6 - i) * 864e5).toISOString().slice(0, 10);
      return {
        day: d,
        deposits: sum(dep.filter((t) => t.created_at.slice(0, 10) === d)),
        sales: sum(pur.filter((t) => t.created_at.slice(0, 10) === d)) - sum(ref.filter((t) => t.created_at.slice(0, 10) === d)),
        orders: recentOrders.filter((o) => o.created_at.slice(0, 10) === d).length,
      };
    });
    const received = recentOrders.filter((o) => o.status === 'received').length;
    return ok({
      users, wallet_total: sum(profiles, 'balance'),
      orders_total: ordersTotal, orders_24h: orders24, orders_pending: pendingOrders,
      deposits_24h: sum(dep.filter(ok24)), deposits_7d: sum(dep),
      sales_24h: sum(pur.filter(ok24)) - sum(ref.filter(ok24)), sales_7d: sum(pur) - sum(ref),
      cashback_7d: sum(txWeek.filter((t) => t.type === 'cashback')),
      referral_7d: sum(txWeek.filter((t) => t.type === 'referral')),
      pending_deposits: pendingDeposits,
      success_rate_7d: recentOrders.length ? Math.round((received / recentOrders.length) * 100) : null,
      days,
    });
  }

  // ---------- users ----------
  if (action === 'users' && !post) {
    const [au, profiles] = await Promise.all([authUsers(Number(req.query.page) || 1, 500), rows('profiles', 'select=id,username,balance,created_at,referral_code,referred_by&limit=100000')]);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const { env, list } = await adminEmails();
    const admins = new Set([...env, ...list.map((a) => a.email)]);
    const q = String(req.query.q || '').toLowerCase();
    const users = au.map((u) => ({
      id: u.id, email: u.email, username: byId.get(u.id)?.username || u.user_metadata?.username || '',
      balance: Number(byId.get(u.id)?.balance || 0), created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
      banned: isBanned(u), admin: admins.has(String(u.email || '').toLowerCase()),
      referral_code: byId.get(u.id)?.referral_code || '', referred_by: byId.get(u.id)?.referred_by || null,
      referrals: profiles.filter((p) => p.referred_by === u.id).length,
    })).filter((u) => !q || `${u.email} ${u.username} ${u.id}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return ok({ users });
  }

  if (action === 'user') {
    const id = req.query.id; if (!id) bad('Missing user id');
    const [{ data: u }, profile, ords, txns] = await Promise.all([
      rest(`/auth/v1/admin/users/${encodeURIComponent(id)}`),
      rows('profiles', `id=eq.${id}&select=*`),
      rows('orders', `user_id=eq.${id}&select=*&order=created_at.desc&limit=50`),
      rows('transactions', `user_id=eq.${id}&select=*&order=created_at.desc&limit=50`),
    ]);
    return ok({ user: { id, email: u?.email, username: profile[0]?.username, balance: Number(profile[0]?.balance || 0), created_at: u?.created_at, last_sign_in_at: u?.last_sign_in_at, banned: isBanned(u || {}) }, orders: ords, transactions: txns });
  }

  if (action === 'balance' && post) {
    const { id, amount, mode, note } = req.body || {};
    const a = Math.round(Number(amount) * 100) / 100;
    if (!id || !(a > 0)) bad('Enter a user and an amount above 0');
    const ref = `ADM-${Date.now()}`;
    const desc = `${mode === 'debit' ? 'Admin deduction' : 'Admin credit'}${note ? ' — ' + String(note).slice(0, 120) : ''}`;
    const balance = mode === 'debit'
      ? await supabase.rpc('debit_wallet', { p_user: id, p_amount: a, p_type: 'admin_debit', p_reference: ref, p_description: desc, p_pending: false })
      : await supabase.rpc('credit_wallet', { p_user: id, p_amount: a, p_type: 'admin_credit', p_reference: ref, p_description: desc });
    console.log(`[splug] admin ${me.email} ${mode || 'credit'} ${a} → ${id}`);
    return ok({ balance });
  }

  if (action === 'ban' && post) {
    const { id, banned } = req.body || {};
    if (!id) bad('Missing user id');
    if (id === me.id) bad('You cannot ban yourself');
    await rest(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body: { ban_duration: banned ? '876000h' : 'none' } });
    return ok({ id, banned: !!banned });
  }

  // ---------- orders ----------
  if (action === 'orders' && !post) {
    const f = ['select=*', 'order=created_at.desc', `limit=${Math.min(Number(req.query.limit) || 100, 500)}`];
    if (req.query.status) f.push(`status=eq.${encodeURIComponent(req.query.status)}`);
    if (req.query.user) f.push(`user_id=eq.${encodeURIComponent(req.query.user)}`);
    const list = await rows('orders', f.join('&'));
    return ok({ orders: list.map((o) => ({ ...o, route: String(o.smspool_order_id || '').startsWith('5sim:') ? 'budget' : 'priority' })) });
  }

  if (action === 'order' && post) {
    const { id, op } = req.body || {};
    const [order] = await rows('orders', `id=eq.${id}&select=*`);
    if (!order) bad('Order not found', 404);
    if (op === 'sync') return ok({ order: await orders.syncOrder(order) });
    if (op === 'cancel') return ok({ refunded: await orders.cancelOrder(order) });
    bad('Unknown order action');
  }

  // ---------- transactions ----------
  if (action === 'transactions' && !post) {
    const f = ['select=*', 'order=created_at.desc', `limit=${Math.min(Number(req.query.limit) || 100, 500)}`];
    if (req.query.type) f.push(`type=eq.${encodeURIComponent(req.query.type)}`);
    if (req.query.status) f.push(`status=eq.${encodeURIComponent(req.query.status)}`);
    if (req.query.q) f.push(`reference=ilike.*${encodeURIComponent(req.query.q)}*`);
    return ok({ transactions: await rows('transactions', f.join('&')) });
  }

  // manually approve / fail a pending deposit (e.g. paid but the callback never came)
  if (action === 'txn' && post) {
    const { id, op } = req.body || {};
    const [txn] = await rows('transactions', `id=eq.${id}&select=*`);
    if (!txn) bad('Transaction not found', 404);
    if (txn.status !== 'pending') bad('Only pending transactions can be changed');
    await supabase.rpc('finalize_txn', { p_txn: id, p_success: op === 'approve' });
    if (op === 'approve') await require('../lib/rewards').onDepositConfirmed(txn);
    return ok({ id, status: op === 'approve' ? 'success' : 'failed' });
  }

  // ---------- referrals ----------
  if (action === 'referrals') {
    const [profiles, rewards] = await Promise.all([
      rows('profiles', 'select=id,username,referral_code,referred_by,created_at&referred_by=not.is.null&order=created_at.desc&limit=1000'),
      rows('transactions', 'select=user_id,amount,reference,description,created_at&type=eq.referral&order=created_at.desc&limit=2000'),
    ]);
    const refIds = [...new Set(profiles.map((p) => p.referred_by))];
    const referrers = refIds.length ? await rows('profiles', `select=id,username,referral_code&id=in.(${refIds.join(',')})`) : [];
    const name = new Map(referrers.map((r) => [r.id, r]));
    const board = refIds.map((id) => ({
      id, username: name.get(id)?.username || '', code: name.get(id)?.referral_code || '',
      invited: profiles.filter((p) => p.referred_by === id).length,
      earned: sum(rewards.filter((t) => t.user_id === id && String(t.reference).startsWith('REF-'))),
    })).sort((a, b) => b.earned - a.earned || b.invited - a.invited);
    return ok({ total_invited: profiles.length, total_paid: sum(rewards), board, recent: rewards.slice(0, 50) });
  }

  // ---------- settings ----------
  if (action === 'settings') {
    if (post) return ok({ settings: await settings.save(req.body?.settings || {}) });
    return ok({ settings: await settings.load(true), defaults: settings.DEFAULTS });
  }

  // ---------- admins ----------
  if (action === 'admins') {
    if (post) {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) bad('Enter a valid email');
      if (req.body?.remove) {
        if (email === String(me.email).toLowerCase()) bad('You cannot remove yourself');
        await rest(`/rest/v1/admins?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
      } else {
        await rest('/rest/v1/admins?on_conflict=email', { method: 'POST', body: { email, added_by: me.email }, prefer: 'resolution=ignore-duplicates,return=minimal' });
      }
    }
    const { env, list } = await adminEmails();
    return ok({ admins: list, env });
  }

  bad('Unknown action');
});
