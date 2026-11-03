// SPLUG — order status sync + automatic refunds for numbers that expire unused.
// Every status change is a conditional update (only if the row still has the
// status we read), so a refund can never be paid twice even when the dashboard,
// history page and the daily sweep check the same order at the same time.
const supabase = require('./supabase');
const smspool = require('./smspool');
const fivesim = require('./fivesim');

function providerOrder(raw) {
  const value = String(raw || '');
  if (value.startsWith('5sim:')) return { provider: 'fivesim', id: value.slice(5) };
  return { provider: 'smspool', id: value };
}

function fivesimOrderResponse(order, fallback) {
  const sms = Array.isArray(order?.sms) ? order.sms[order.sms.length - 1] : order?.sms;
  const status = String(order?.status || '').toLowerCase();
  const otp = sms?.code || sms?.text?.match(/\d{4,8}/)?.[0] || null;
  // Budget supplier's "RECEIVED" status means the PHONE NUMBER was issued, not that an SMS arrived.
  let normalized = 'pending';
  if (otp) normalized = 'received';
  else if (['timeout', 'expired'].includes(status)) normalized = 'expired';
  else if (['canceled', 'cancelled', 'banned'].includes(status)) normalized = 'cancelled';
  else if (status === 'finished') normalized = 'expired';
  return {
    phone_number: order?.phone || order?.phone_number || fallback.phone_number,
    status: normalized,
    otp,
    full_sms: sms?.text || null,
  };
}

// Atomically move an order out of the status we read. Returns the updated row,
// or null if someone else already changed it.
async function transition(order, patch) {
  const rows = await supabase.update('orders', { id: `eq.${order.id}`, status: `eq.${order.status}` }, patch);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function refund(order, reason) {
  await supabase.rpc('credit_wallet', {
    p_user: order.user_id,
    p_amount: order.price,
    p_type: 'refund',
    p_reference: `${reason}:${order.id}`,
    p_description: reason === 'expired' ? 'Refund — number expired unused' : 'Refund — order cancelled',
  });
}

// Ask the supplier for the latest state of a pending order and save it.
// Expired (or supplier-cancelled) numbers with no code are refunded automatically.
async function syncOrder(order) {
  const stuck = order.status === 'received' && !order.otp;
  if (order.status !== 'pending' && !stuck) return order;

  const selected = providerOrder(order.smspool_order_id);
  let next;
  if (selected.provider === 'fivesim') {
    next = fivesimOrderResponse(await fivesim.check(selected.id), order);
  } else {
    const remote = await smspool.checkSms(selected.id);
    next = { status: 'pending', otp: null, full_sms: null };
    if (remote.sms) next = { status: 'received', otp: remote.sms, full_sms: remote.full_sms || null };
    else if ([4, 6, 7].includes(Number(remote.status))) next = { status: 'expired', otp: null, full_sms: null };
  }
  if (next.status === 'pending') return { ...order, ...next };

  const unused = !next.otp && ['expired', 'cancelled'].includes(next.status);
  const patch = { status: next.status, otp: next.otp, full_sms: next.full_sms };
  if (unused) patch.refunded = true;
  let saved;
  try {
    saved = await transition(order, patch);
  } catch (err) {
    // Older databases may not have the "refunded" column yet.
    if (unused && /refunded/i.test(err.message || '')) {
      delete patch.refunded;
      saved = await transition(order, patch);
    } else throw err;
  }
  if (!saved) {
    const rows = await supabase.selectAdmin('orders', { id: `eq.${order.id}`, select: '*', limit: '1' });
    return (rows && rows[0]) || { ...order, ...next };
  }
  if (unused) {
    await refund(order, 'expired');
    return { ...saved, refunded_amount: order.price };
  }
  return saved;
}

// User cancels a waiting number: cancel with the supplier, then refund once.
async function cancelOrder(order) {
  if (order.status !== 'pending') {
    const e = new Error('Only pending orders can be cancelled'); e.status = 400; throw e;
  }
  const selected = providerOrder(order.smspool_order_id);
  if (selected.provider === 'fivesim') await fivesim.cancel(selected.id);
  else await smspool.cancelSms(selected.id);
  let saved;
  try { saved = await transition(order, { status: 'cancelled', refunded: true }); }
  catch (err) {
    if (/refunded/i.test(err.message || '')) saved = await transition(order, { status: 'cancelled' });
    else throw err;
  }
  if (!saved) {
    const e = new Error('This order was already closed. Check your wallet for the refund.'); e.status = 409; throw e;
  }
  await refund(order, 'cancelled');
  return order.price;
}

// Check a batch of pending orders (oldest first). Errors on one order never stop the rest.
async function sweep(orders) {
  let refunded = 0, refundedAmount = 0, checked = 0;
  for (const order of orders) {
    try {
      const out = await syncOrder(order);
      checked++;
      if (out.refunded_amount) { refunded++; refundedAmount += Number(out.refunded_amount) || 0; }
    } catch { /* supplier hiccup: try again next sweep */ }
  }
  return { checked, refunded, refunded_amount: refundedAmount };
}

// What a user may see: the route, never the supplier or its order id.
function publicOrder(order) {
  if (!order) return order;
  const { smspool_order_id: supplierId, ...rest } = order;
  return { ...rest, route: String(supplierId || '').startsWith('5sim:') ? 'budget' : 'priority' };
}

module.exports = { providerOrder, syncOrder, cancelOrder, sweep, publicOrder };
