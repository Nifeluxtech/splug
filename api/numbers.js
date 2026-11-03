// SPLUG API — OTP numbers from 5sim (cheap) or SMSPool (premium).
const supabase = require('../lib/supabase');
const smspool = require('../lib/smspool');
const fivesim = require('../lib/fivesim');
const { requireUser } = require('../lib/auth');
const { handler, ok } = require('../lib/respond');
const orders = require('../lib/orders');

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
    let saved = Array.isArray(row) ? row[0] : row;
    if (!saved) {
      saved = await supabase.selectOne('orders', { user_id: `eq.${user.id}`, order: 'created_at.desc', limit: '1', select: '*' }, token);
    }
    return ok({
      order: saved,
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
    if (action === 'check') {
      return ok({ order: await orders.syncOrder(order) });
    }
    const refunded = await orders.cancelOrder(order);
    return ok({ cancelled: true, refunded });
  }

  // Check this user's waiting numbers older than 5 minutes and auto-refund any that expired unused.
  if (action === 'sweep') {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const pending = await supabase.select('orders', {
      user_id: `eq.${user.id}`, status: 'eq.pending', created_at: `lt.${cutoff}`,
      select: '*', order: 'created_at.asc', limit: '20',
    }, token);
    return ok(await orders.sweep(pending || []));
  }

  const e = new Error('Unknown action'); e.status = 400; throw e;
});
