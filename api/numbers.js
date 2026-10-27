// SPLUG API — OTP numbers from 5sim (cheap) or SMSPool (premium).
const supabase = require('../lib/supabase');
const smspool = require('../lib/smspool');
const fivesim = require('../lib/fivesim');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');

function providerName(value) {
  return value === 'cheap' || value === 'fivesim' ? 'fivesim' : 'smspool';
}

function names(body = {}) {
  return {
    country: body.countryName || String(body.country || ''),
    service: body.serviceName || String(body.service || ''),
  };
}

async function premiumQuote(service, country) {
  let pricing;
  try {
    pricing = await smspool.price(service, country);
  } catch (err) {
    const e = new Error(err?.message || 'Could not fetch the priority price. Try another service or country.'); e.status = 409; throw e;
  }
  const usd = Number(pricing?.price ?? pricing?.cost ?? pricing?.[0]?.price ?? pricing?.[0]?.cost ?? 0);
  if (!usd) {
    const e = new Error('No SMSPool number is available for this selection'); e.status = 409; throw e;
  }
  return { provider: 'smspool', operator: 'any', usd, price: smspool.toNaira(usd), currency: 'NGN' };
}

async function getQuote(provider, country, service) {
  if (!country || !service) {
    const e = new Error('Choose a country and service first'); e.status = 400; throw e;
  }
  return provider === 'fivesim'
    ? fivesim.quote(country, service)
    : premiumQuote(service, country);
}

function providerOrder(raw) {
  const value = String(raw || '');
  if (value.startsWith('5sim:')) return { provider: 'fivesim', id: value.slice(5) };
  return { provider: 'smspool', id: value };
}

function fivesimOrderResponse(order, fallback) {
  const sms = Array.isArray(order?.sms) ? order.sms[order.sms.length - 1] : order?.sms;
  const status = String(order?.status || '').toLowerCase();
  return {
    id: fallback.id,
    smspool_order_id: `5sim:${order?.id || fallback.id}`,
    phone_number: order?.phone || order?.phone_number || fallback.phone_number,
    status: sms || status === 'received' ? 'received' : ['expired', 'cancelled', 'finished'].includes(status) ? status : 'pending',
    otp: sms?.code || sms?.text?.match(/\d{4,8}/)?.[0] || null,
    full_sms: sms?.text || null,
  };
}

module.exports = handler(async (req, res) => {
  const { user, token } = await requireUser(req);
  const action = req.query.action;
  const provider = providerName(req.query.provider || req.body?.provider);

  if (action === 'countries') {
    const countries = provider === 'fivesim' ? await fivesim.countries() : await smspool.countries();
    return ok({ provider, countries });
  }

  if (action === 'services') {
    const country = req.query.country;
    if (provider === 'fivesim') {
      return ok({ provider, services: await fivesim.services(country) });
    }
    return ok({ provider, services: await smspool.services(), countries: await smspool.countries() });
  }

  if (action === 'quote') {
    const quote = await getQuote(provider, req.query.country, req.query.service);
    return ok(quote);
  }

  if (action === 'purchase') {
    const { country, service, operator } = req.body || {};
    const display = names(req.body);
    const quote = await getQuote(provider, country, service);
    const reference = `${provider.toUpperCase()}-${Date.now()}`;

    await supabase.rpc('debit_wallet', {
      p_user: user.id,
      p_amount: quote.price,
      p_type: 'purchase',
      p_reference: reference,
      p_description: `${display.service} • ${display.country} • ${provider === 'fivesim' ? 'Cheap' : 'Premium'}`,
      p_pending: false,
    });

    let purchased;
    try {
      purchased = provider === 'fivesim'
        ? await fivesim.purchase(country, quote.operator || operator || 'any', service)
        : await smspool.purchaseSms(country, service);
    } catch (err) {
      await supabase.rpc('credit_wallet', {
        p_user: user.id, p_amount: quote.price, p_type: 'refund',
        p_reference: reference, p_description: `${provider} purchase failed — refund`,
      });
      throw err;
    }

    const externalId = provider === 'fivesim' ? purchased.id : purchased.order_id;
    const phone = provider === 'fivesim'
      ? purchased.phone || purchased.phone_number || ''
      : purchased.cc ? `+${purchased.cc}${purchased.phonenumber}` : String(purchased.phonenumber || '');
    const row = await supabase.insert('orders', {
      user_id: user.id,
      smspool_order_id: provider === 'fivesim' ? `5sim:${externalId}` : externalId,
      country: display.country,
      country_id: String(country),
      service: display.service,
      service_id: String(service),
      phone_number: phone,
      status: 'pending',
      price: quote.price,
    });
    return ok({
      order: Array.isArray(row) ? row[0] : row,
      charged: quote.price,
      provider,
      operator: quote.operator || operator || 'any',
    });
  }

  if (action === 'check' || action === 'cancel') {
    const { orderId } = req.query;
    const rows = await supabase.select('orders', { id: `eq.${orderId}`, select: '*', limit: '1' }, token);
    const order = rows && rows[0];
    if (!order || order.user_id !== user.id) {
      const e = new Error('Order not found'); e.status = 404; throw e;
    }
    const selected = providerOrder(order.smspool_order_id);
    if (action === 'check') {
      if (order.status !== 'pending') return ok({ order });
      if (selected.provider === 'fivesim') {
        const remote = await fivesim.check(selected.id);
        const normalized = fivesimOrderResponse(remote, order);
        if (normalized.status !== 'pending') {
          await supabase.update('orders', { id: `eq.${order.id}` }, { status: normalized.status, otp: normalized.otp, full_sms: normalized.full_sms });
        }
        return ok({ order: { ...order, ...normalized } });
      }
      const remote = await smspool.checkSms(selected.id);
      let status = 'pending';
      let otp = null, fullSms = null;
      if (remote.sms) { status = 'received'; otp = remote.sms; fullSms = remote.full_sms || null; }
      else if ([4, 6, 7].includes(Number(remote.status))) status = 'expired';
      if (status !== 'pending') await supabase.update('orders', { id: `eq.${order.id}` }, { status, otp, full_sms: fullSms });
      return ok({ order: { ...order, status, otp, full_sms: fullSms } });
    }

    if (order.status !== 'pending') {
      const e = new Error('Only pending orders can be cancelled'); e.status = 400; throw e;
    }
    if (selected.provider === 'fivesim') await fivesim.cancel(selected.id);
    else await smspool.cancelSms(selected.id);
    await supabase.update('orders', { id: `eq.${order.id}` }, { status: 'cancelled' });
    await supabase.rpc('credit_wallet', {
      p_user: user.id, p_amount: order.price, p_type: 'refund',
      p_reference: selected.id, p_description: 'Refund — order cancelled',
    });
    return ok({ cancelled: true, refunded: order.price });
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
