// SPLUG — settle a Korapay deposit after asking Korapay for the charge's real status.
// Used by the webhook (/api/gateway) and by the wallet page when the customer returns from checkout.
// Safe to call any number of times: only a pending deposit is ever finalised, and rewards are keyed by reference.

const supabase = require('./supabase');
const korapay = require('./korapay');
const { checkoutTotal } = require('./fees');

async function settleKorapayDeposit(reference, userId = null) {
  if (!reference) return { status: 'unknown' };
  const filter = { reference: `eq.${reference}`, limit: '1', select: '*' };
  if (userId) filter.user_id = `eq.${userId}`;
  const rows = await supabase.selectAdmin('transactions', filter);
  const txn = rows && rows[0];
  if (!txn || txn.type !== 'deposit') return { status: 'unknown' };
  if (txn.status !== 'pending') return { status: txn.status, amount: Number(txn.amount) };

  const charge = await korapay.verifyCharge(reference);
  const charged = checkoutTotal(txn);

  if (charge.status === 'success') {
    if (charge.currency !== 'NGN' || !(charge.paid >= charged - 0.001)) {
      console.error('[splug] korapay deposit underpaid or wrong currency, left pending:', reference, charge.paid, charge.currency, 'expected', charged);
      return { status: 'pending' };
    }
    await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: true });
    await require('./rewards').onDepositConfirmed(txn);
    return { status: 'success', amount: Number(txn.amount) };
  }
  if (charge.status === 'failed') {
    await supabase.rpc('finalize_txn', { p_txn: txn.id, p_success: false });
    return { status: 'failed', amount: Number(txn.amount) };
  }
  return { status: 'pending', amount: Number(txn.amount) };
}

module.exports = { settleKorapayDeposit };
