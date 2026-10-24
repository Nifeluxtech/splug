// SPLUG API #2/5 — OTP numbers (SMSPool), naira pricing
// GET  /api/numbers?action=services            → catalogue
// POST /api/numbers?action=purchase            → buy number (debits wallet)
// GET  /api/numbers?action=check&orderId=...   → poll for OTP
// POST /api/numbers?action=cancel&orderId=...  → cancel + refund

const supabase = require('../lib/supabase');
const smspool = require('../lib/smspool');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

module.exports = handler(async (req, res) => {
  const { user, token } = await requireUser(req);
  const action = req.query.action;

  // ---- catalogue (services + countries) ----
  if (action === 'services') {
    const [services, countries] = await Promise.all([
      smspool.services(),
      smspool.countries(),
    ]);
    return ok({ services, countries });
  }

  // ---- purchase a number ----
  if (action === 'purchase') {
    const { country, service, countryName = '', serviceName = '' } = req.body || {};
    if (!country || !service) {
      const e = new Error('Country and service are required'); e.status = 400; throw e;
    }

    // 1) price in USD from SMSPool → ₦ (x1400, x1.5 margin)
    let priceNgn;
    try {
      const pricing = await smspool.pricing(service, country);
      priceNgn = smspool.toNaira(pricing?.price ?? pricing?.cost ?? pricing?.[0]?.price ?? 0);
    } catch {
      const e = new Error('Could not fetch price — try another service/country'); e.status = 502; throw e;
    }

    // 2) atomic wallet debit (fails cleanly when balance is short)
    await supabase.rpc('debit_wallet', {
      p_user: user.id,
      p_amount: priceNgn,
      p_type: 'purchase',
      p_reference: `ORD-${Date.now()}`,
      p_description: `${serviceName || 'Number'} • ${countryName || country}`,
      p_pending: false,
    });

    // 3) buy from SMSPool — auto-refund if it fails
    let purchased;
    try {
      purchased = await smspool.purchaseSms(country, service);
    } catch (err) {
      await supabase.rpc('credit_wallet', {
        p_user: user.id, p_amount: priceNgn, p_type: 'refund',
        p_reference: 'SMSPOOL-FAIL', p_description: 'Refund — number purchase failed',
      });
      throw err;
    }

    // 4) persist the order
    const row = await supabase.insert('orders', {
      user_id: user.id,
      smspool_order_id: purchased.order_id,
      country: countryName || String(country),
      country_id: String(country),
      service: serviceName || String(service),
      service_id: String(service),
      phone_number: purchased.cc
        ? `+${purchased.cc}${purchased.phonenumber}`
        : String(purchased.phonenumber),
      status: 'pending',
      price: priceNgn,
    });

    return ok({ order: Array.isArray(row) ? row[0] : row, charged: priceNgn });
  }

  // ---- poll an order for OTP ----
  if (action === 'check') {
    const { orderId } = req.query;
    const rows = await supabase.select('orders',
      { id: `eq.${orderId}`, select: '*', limit: '1' }, token);
    const order = rows && rows[0];
    if (!order || order.user_id !== user.id) {
      const e = new Error('Order not found'); e.status = 404; throw e;
    }
    if (order.status !== 'pending') return ok({ order });

    const r = await smspool.checkSms(order.smspool_order_id);
    let status = 'pending';
    let otp = null, fullSms = null;
    if (r.sms) {
      status = 'received'; otp = r.sms; fullSms = r.full_sms || null;
    } else if ([4, 6, 7].includes(Number(r.status))) {
      status = 'expired';
    }
    if (status !== 'pending') {
      await supabase.update('orders', { id: `eq.${order.id}` }, { status, otp, full_sms: fullSms });
    }
    return ok({ order: { ...order, status, otp, full_sms: fullSms } });
  }

  // ---- cancel an order (refund) ----
  if (action === 'cancel') {
    const { orderId } = req.query;
    const rows = await supabase.select('orders',
      { id: `eq.${orderId}`, select: '*', limit: '1' }, token);
    const order = rows && rows[0];
    if (!order || order.user_id !== user.id) {
      const e = new Error('Order not found'); e.status = 404; throw e;
    }
    if (order.status !== 'pending') {
      const e = new Error('Only pending orders can be cancelled'); e.status = 400; throw e;
    }

    await smspool.cancelSms(order.smspool_order_id);
    await supabase.update('orders', { id: `eq.${order.id}` }, { status: 'cancelled' });
    await supabase.rpc('credit_wallet', {
      p_user: user.id, p_amount: order.price, p_type: 'refund',
      p_reference: order.smspool_order_id, p_description: 'Refund — order cancelled',
    });

    return ok({ cancelled: true, refunded: order.price });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
