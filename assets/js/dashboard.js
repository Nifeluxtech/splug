/* SPLUG — dashboard: budget and priority routes, price-first purchase */
(async function () {
  if (!requireAuthPage()) return;
  mountHeader('dashboard'); mountTabbar('dashboard'); refreshBalanceChip();

  const $ = (id) => document.getElementById(id);
  const state = { provider: 'cheap', countries: [], quote: null, order: null, pollTimer: null, loadId: 0 };
  const providerApi = () => (state.provider === 'cheap' ? 'fivesim' : 'smspool');
  const routeName = () => (state.provider === 'cheap' ? 'Budget' : 'Priority');

  /* ---------- builder ---------- */
  const servicePicker = createPicker($('servicePicker'), { placeholder: 'Search services, e.g. WhatsApp', label: 'Services', onSelect: onServiceSelected });
  const countryPicker = createPicker($('countryPicker'), { placeholder: 'Search countries', label: 'Countries', onSelect: onCountrySelected });
  servicePicker.lock('Loading services…');
  countryPicker.lock('Choose a service first');

  function markSteps() {
    $('stepService').classList.toggle('is-done', !!servicePicker.selected);
    $('stepCountry').classList.toggle('is-done', !!countryPicker.selected);
    $('stepCountry').classList.toggle('is-locked', !servicePicker.selected);
    $('serviceValue').textContent = servicePicker.selected?.name || '';
    $('countryValue').textContent = countryPicker.selected?.name || '';
  }

  function resetQuote(message = 'Select a service and country to see it.') {
    state.quote = null; state.quoteKey = null;
    $('quote').classList.add('is-empty');
    $('priceValue').textContent = '—'; $('priceMeta').textContent = message;
    $('buyBtn').disabled = true;
  }

  async function loadServices() {
    const myLoad = ++state.loadId;
    servicePicker.lock('Loading services…'); countryPicker.lock('Choose a service first'); resetQuote(); markSteps();
    try {
      const data = await apiCall(API.numbers, { query: { action: 'services', provider: providerApi() } });
      if (myLoad !== state.loadId) return; // route changed while loading
      servicePicker.setItems(data.services || []);
      // priority route ships its country list with the services; budget route loads it on demand
      state.countries = state.provider === 'premium' ? (data.countries || []) : [];
    } catch (err) {
      if (myLoad !== state.loadId) return;
      servicePicker.lock('Could not load services. Try switching routes or refresh.');
      toast(err.message, 'error');
    }
  }

  async function onServiceSelected() {
    markSteps(); resetQuote('Now choose a country.');
    const myLoad = state.loadId;
    try {
      if (state.provider === 'cheap' && !state.countries.length) {
        countryPicker.lock('Loading countries…');
        const data = await apiCall(API.numbers, { query: { action: 'countries', provider: 'fivesim' } });
        if (myLoad !== state.loadId) return;
        state.countries = data.countries || [];
      }
      countryPicker.setItems(state.countries); markSteps();
    } catch (err) { countryPicker.lock('Could not load countries.'); toast(err.message, 'error'); }
  }

  async function onCountrySelected() {
    markSteps();
    const service = servicePicker.value, country = countryPicker.value;
    if (!service || !country) return;
    const key = `${providerApi()}|${service}|${country}`;
    state.quoteKey = key; state.quote = null;
    $('buyBtn').disabled = true; $('quote').classList.add('is-empty');
    $('priceValue').textContent = '…'; $('priceMeta').textContent = 'Checking the lowest available price…';
    try {
      const quote = await apiCall(API.numbers, { query: { action: 'quote', provider: providerApi(), service, country } });
      if (state.quoteKey !== key) return; // selection changed
      state.quote = quote;
      $('quote').classList.remove('is-empty');
      $('priceValue').textContent = naira(quote.price);
      $('priceMeta').textContent = `${routeName()} route. Nothing is charged until you confirm.`;
      $('buyBtn').disabled = false;
    } catch (err) {
      if (state.quoteKey !== key) return;
      resetQuote(err.message); toast(err.message, 'error');
    }
  }

  async function switchProvider(provider) {
    state.provider = provider;
    document.querySelectorAll('.route-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.provider === provider)));
    await loadServices();
  }
  document.querySelectorAll('.route-opt').forEach((b) => b.addEventListener('click', () => { if (b.dataset.provider !== state.provider) switchProvider(b.dataset.provider); }));

  /* ---------- purchase ---------- */
  $('buyBtn').addEventListener('click', async () => {
    if (!state.quote) return;
    const service = servicePicker.value, country = countryPicker.value;
    const serviceName = servicePicker.selected?.name || service, countryName = countryPicker.selected?.name || country;
    const price = state.quote.price;
    const short = balance.value != null && balance.value < price;

    if (short) {
      const go = await confirmDialog({
        title: 'Add funds to continue',
        rows: [['Price', naira(price)], ['Your balance', naira(balance.value)], ['Needed', naira(price - balance.value)]],
        confirmText: 'Fund wallet', cancelText: 'Not now',
      });
      if (go) window.location.href = '/wallet.html';
      return;
    }
    const ok = await confirmDialog({
      title: 'Confirm purchase',
      rows: [['Service', serviceName], ['Country', countryName], ['Route', routeName()], ['Total', naira(price)]],
      warning: 'The amount is taken from your wallet now. Cancel an unused number to get it back.',
      confirmText: `Pay ${naira(price)}`,
    });
    if (!ok) return;

    const btn = $('buyBtn'); setLoading(btn, true, 'Buying…');
    try {
      const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'purchase' }, body: { provider: providerApi(), service, country, serviceName, countryName, operator: state.quote.operator } });
      state.order = data.order; renderTicket(); startPolling(); refreshBalanceChip();
      toast(`Number bought for ${naira(data.charged)}`);
      if (window.matchMedia('(max-width: 960px)').matches) $('ticket').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false); btn.disabled = !state.quote;
  });

  /* ---------- ticket ---------- */
  const STATUS_TEXT = { idle: 'No active order', pending: 'Waiting for SMS', received: 'Code received', cancelled: 'Cancelled', expired: 'Expired' };
  function renderOtp(code, len = 6) {
    const chars = code ? [...String(code)] : Array(len).fill('–');
    $('otpCode').innerHTML = chars.map((c) => `<span>${esc(c)}</span>`).join('');
  }
  function renderTicket() {
    const o = state.order;
    const status = o ? (o.status || 'pending') : 'idle';
    const t = $('ticket'); t.dataset.state = status;
    document.querySelector('.side').classList.toggle('has-order', status !== 'idle');
    $('orderStatus').className = `badge ${status === 'idle' ? 'neutral' : status}`;
    $('orderStatusText').textContent = STATUS_TEXT[status] || titleCase(status);
    $('orderService').textContent = o ? `${o.service} · ${o.country}` : 'Nothing yet';
    $('orderNumber').textContent = o?.phone_number || '—';
    $('copyNumber').disabled = !o?.phone_number;
    renderOtp(status === 'received' ? o.otp : null);
    $('copyOtp').hidden = !(status === 'received' && o.otp);
    $('cancelBtn').hidden = status !== 'pending';
    $('ticketNote').textContent = {
      idle: 'Your number and code will appear here once you buy.',
      pending: 'Use this number now. Your code appears here automatically.',
      received: 'Copy the code and finish your verification.',
      cancelled: 'This order was cancelled. Any refund is already in your wallet.',
      expired: 'This number expired before a code arrived.',
    }[status] || '';
  }
  renderTicket();

  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      if (!state.order || document.hidden) return;
      try {
        const data = await apiCall(API.numbers, { query: { action: 'check', orderId: state.order.id } });
        const prev = state.order.status;
        state.order = { ...state.order, ...data.order };
        renderTicket();
        if (state.order.status !== 'pending') {
          stopPolling();
          if (state.order.status === 'received' && prev !== 'received') toast('Code received');
          if (state.order.status === 'expired') refreshBalanceChip();
        }
      } catch {}
    }, 8000);
  }

  $('copyNumber').addEventListener('click', () => copyText($('orderNumber').textContent, $('copyNumber')));
  $('copyOtp').addEventListener('click', () => copyText(state.order?.otp || '', $('copyOtp')));
  $('cancelBtn').addEventListener('click', async () => {
    if (!state.order) return;
    const ok = await confirmDialog({ title: 'Cancel this order?', rows: [['Number', state.order.phone_number || '—'], ['Refund', naira(state.order.price)]], confirmText: 'Cancel and refund', cancelText: 'Keep waiting', danger: true });
    if (!ok) return;
    const btn = $('cancelBtn'); btn.disabled = true;
    try {
      const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'cancel', orderId: state.order.id } });
      stopPolling(); state.order.status = 'cancelled'; renderTicket(); refreshBalanceChip();
      toast(`Cancelled. ${naira(data.refunded)} returned to your wallet.`);
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });

  /* ---------- resume an order that is still waiting (e.g. after a page refresh) ---------- */
  async function resumePending() {
    try {
      const data = await apiCall(API.history, { query: { action: 'orders' } });
      const recent = (data.orders || []).find((o) => o.status === 'pending' && Date.now() - new Date(o.created_at).getTime() < 30 * 60 * 1000);
      if (recent) { state.order = recent; renderTicket(); startPolling(); }
    } catch {}
  }

  await switchProvider('cheap');
  resumePending();
})();
