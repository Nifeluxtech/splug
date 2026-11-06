// SPLUG — rewards paid after a deposit is confirmed: deposit cashback and referral bonuses.
// Every payout has a unique reference checked first, so a repeated callback never pays twice.
const supabase = require('./supabase');
const settings = require('./settings');

async function paid(reference) {
  const rows = await supabase.selectAdmin('transactions', { reference: `eq.${reference}`, limit: '1', select: 'id' });
  return !!(rows && rows.length);
}
async function pay(user, amount, type, reference, description) {
  if (!(amount > 0) || await paid(reference)) return 0;
  await supabase.rpc('credit_wallet', { p_user: user, p_amount: amount, p_type: type, p_reference: reference, p_description: description });
  return amount;
}

async function onDepositConfirmed(txn) {
  if (!txn || txn.type !== 'deposit') return;
  const s = await settings.load();
  const run = async (label, fn) => { try { await fn(); } catch (e) { console.error(`[splug] ${label} failed:`, e.message); } };

  await run('cashback', () => pay(txn.user_id, settings.cashbackFor(txn.amount), 'cashback', `CB-${txn.reference}`, `Deposit cashback (${s.cashback_percent}%)`));

  if (!s.referral_enabled) return;
  await run('referral', async () => {
    const me = await supabase.selectAdmin('profiles', { id: `eq.${txn.user_id}`, select: 'id,username,referred_by', limit: '1' });
    const referrer = me && me[0] && me[0].referred_by;
    if (!referrer || referrer === txn.user_id) return;
    const deposits = await supabase.selectAdmin('transactions', { user_id: `eq.${txn.user_id}`, type: 'eq.deposit', status: 'eq.success', select: 'id', limit: '1000' });
    const n = (deposits || []).length; // includes this deposit
    if (!(s.referral_deposit_limit > 0) || n <= s.referral_deposit_limit) {
      await pay(referrer, settings.referralFor(txn.amount), 'referral', `REF-${txn.reference}`,
        `Referral bonus — ${me[0].username || 'your invitee'} funded ₦${Number(txn.amount).toLocaleString()}`);
    }
    if (n === 1 && s.referral_welcome_bonus > 0 && Number(txn.amount) >= Number(s.referral_welcome_min_deposit || 0)) {
      await pay(txn.user_id, Number(s.referral_welcome_bonus), 'referral', `WEL-${txn.reference}`, 'Welcome bonus — joined with a referral');
    }
  });
}

module.exports = { onDepositConfirmed };
