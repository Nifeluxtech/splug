// SPLUG — session guard. Verifies the Supabase JWT sent by the browser.

const supabase = require('./supabase');

async function requireUser(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    const e = new Error('Not authenticated'); e.status = 401; throw e;
  }
  let user;
  try {
    user = await supabase.getUser(token);
  } catch {
    const e = new Error('Session expired — login again'); e.status = 401; throw e;
  }
  if (!user || !user.id) {
    const e = new Error('Session expired — login again'); e.status = 401; throw e;
  }
  return { user, token };
}

module.exports = { requireUser };
