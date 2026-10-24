// SPLUG API #1/5 — authentication
// POST /api/auth  { action: register | login | logout, ... }
// GET  /api/auth?action=me  (Bearer token)

const supabase = require('../lib/supabase');
const { handler, ok } = require('../lib/respond');

module.exports = handler(async (req, res) => {
  const action = req.query.action || (req.body && req.body.action);
  const { email, password, username } = req.body || {};

  // register → creates auth user + profile row (via SQL trigger)
  if (action === 'register') {
    if (!username || !email || !password) {
      const e = new Error('Username, email and password are required'); e.status = 400; throw e;
    }
    if (password.length < 6) {
      const e = new Error('Password must be at least 6 characters'); e.status = 400; throw e;
    }
    const result = await supabase.signUp(email.trim().toLowerCase(), password, { username: username.trim() });
    return ok({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      user: { id: result.user?.id, email, username: username.trim() },
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
