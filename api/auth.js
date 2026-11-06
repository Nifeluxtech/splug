// SPLUG API #1/5 — authentication
// POST /api/auth  { action: register | login | logout, ... }
// GET  /api/auth?action=me  (Bearer token)

const supabase = require('../lib/supabase');
const { handler, ok } = require('../lib/respond');
const settings = require('../lib/settings');

module.exports = handler(async (req, res) => {
  const action = req.query.action || (req.body && req.body.action);
  const { email, password, username, ref } = req.body || {};

  // register → creates auth user + profile row (via SQL trigger)
  if (action === 'register') {
    if (!(await settings.load()).registration_enabled) { const e = new Error('New sign-ups are paused right now. Please check back soon.'); e.status = 403; throw e; }
    if (!username || !email || !password) {
      const e = new Error('Username, email and password are required'); e.status = 400; throw e;
    }
    if (password.length < 6) {
      const e = new Error('Password must be at least 6 characters'); e.status = 400; throw e;
    }
    const cleanEmail = email.trim().toLowerCase();
    // Create the account already confirmed (no email confirmation step), then sign straight in.
    let created;
    try {
      created = await supabase.createConfirmedUser(cleanEmail, password, { username: username.trim(), ...(ref ? { ref: String(ref).trim().toUpperCase().slice(0, 12) } : {}) });
    } catch (err) {
      if (/already|registered|exists/i.test(err.message || '')) {
        const e = new Error('An account with this email already exists. Please sign in.'); e.status = 409; throw e;
      }
      throw err;
    }
    const session = await supabase.signIn(cleanEmail, password);
    return ok({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: { id: created?.id || session.user?.id, email: cleanEmail, username: username.trim() },
    });
  }

  // login → Supabase password grant
  if (action === 'login') {
    if (!email || !password) {
      const e = new Error('Email and password are required'); e.status = 400; throw e;
    }
    const session = await supabase.signIn(email.trim().toLowerCase(), password);
    return ok({ access_token: session.access_token, refresh_token: session.refresh_token });
  }

  // refresh → rotate an expired access token without forcing a login
  if (action === 'refresh') {
    const refreshToken = req.body?.refresh_token;
    if (!refreshToken) {
      const e = new Error('Session expired — login again'); e.status = 401; throw e;
    }
    try {
      const session = await supabase.refresh(refreshToken);
      return ok({ access_token: session.access_token, refresh_token: session.refresh_token });
    } catch {
      const e = new Error('Session expired — login again'); e.status = 401; throw e;
    }
  }

  // me → current session
  if (action === 'me') {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    const user = await supabase.getUser(token);
    return ok({ id: user.id, email: user.email, username: user.user_metadata?.username || '' });
  }

  // logout → revoke the token server-side
  if (action === 'logout') {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '');
    if (token) await supabase.signOut(token);
    return ok({ loggedOut: true });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
