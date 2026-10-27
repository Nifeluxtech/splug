/* SPLUG — dashboard: cheap 5sim, premium SMSPool, price-first purchase */
(async function () {
  if (!requireAuthPage()) return;
  mountHeader('dashboard'); mountFooter('dashboard'); refreshBalanceChip();

  const $ = (id) => document.getElementById(id);
  const state = { provider: 'cheap', services: [], countries: [], quote: null, activeOrder: null, pollTimer: null };

  function providerApi() { return state.provider === 'cheap' ? 'fivesim' : 'smspool'; }
  function renderOptions(select, rows, placeholder) {
    select.innerHTML = `<option value="">${placeholder}</option>` + rows.map((row) => `<option value="${row.id}">${row.name}</option>`).join('');
  }
  function resetQuote(message = 'Select a service and country to see the price before purchase.') {
    state.quote = null; $('priceCard').hidden = true; $('buyBtn').disabled = true; $('selectionHint').textContent = message;
  }

  async function loadServices() {
    state.services = []; state.countries = [];
    $('serviceSelect').disabled = true; $('countrySelect').disabled = true;
    $('countrySelect').innerHTML = '<option>Choose a service first</option>';
    resetQuote('Loading services…');
    const data = await apiCall(API.numbers, { query: { action: 'services', provider: providerApi() } });
    state.services = data.services || [];
    renderOptions($('serviceSelect'), state.services, 'Choose a service');
    $('serviceSelect').disabled = false;
    if (state.provider === 'premium') {
      state.countries = data.countries || [];
    }
    $('selectionHint').textContent = state.provider === 'cheap' ? 'Service first, then country. 5sim uses the cheapest available operator.' : 'Choose a service and country to see the SMSPool price.';
  }

  async function loadCountriesForService() {
    const service = $('serviceSelect').value;
    if (!service) { $('countrySelect').disabled = true; $('countrySelect').innerHTML = '<option>Choose a service first</option>'; resetQuote(); return; }
    if (state.provider === 'cheap' && !state.countries.length) {
      const data = await apiCall(API.numbers, { query: { action: 'countries', provider: 'fivesim' } });
      state.countries = data.countries || [];
    }
    renderOptions($('countrySelect'), state.countries, 'Choose a country');
    $('countrySelect').disabled = false;
    resetQuote('Now choose a country to see the exact price.');
  }

  async function showQuote() {
    const service = $('serviceSelect').value;
    const country = $('countrySelect').value;
    if (!service || !country) return;
    $('selectionHint').textContent = 'Checking the lowest available price…';
    $('priceCard').hidden = true; $('buyBtn').disabled = true;
    try {
      state.quote = await apiCall(API.numbers, { query: { action: 'quote', provider: providerApi(), service, country } });
      $('priceValue').textContent = naira(state.quote.price);
      $('priceMeta').textContent = state.provider === 'cheap'
        ? `5sim · ${state.quote.operator || 'cheapest operator'} · no charge until you confirm`
        : 'SMSPool premium route · no charge until you confirm';
      $('priceCard').hidden = false; $('buyBtn').disabled = false; $('selectionHint').textContent = 'Review the price above, then confirm to purchase.';
    } catch (err) { resetQuote(err.message); toast(err.message, 'error'); }
  }

  async function switchProvider(provider) {
    state.provider = provider;
    document.querySelectorAll('.server-tab').forEach((button) => button.classList.toggle('active', button.dataset.provider === provider));
    const cheap = provider === 'cheap';
    $('providerTitle').textContent = cheap ? '5sim numbers' : 'SMSPool premium numbers';
    $('providerDescription').textContent = cheap ? 'Pick a service first, then choose a country. We use the lowest available 5sim operator.' : 'Choose a service and country from SMSPool’s premium catalogue.';
    $('providerPill').textContent = cheap ? 'CHEAP · 5SIM' : 'PREMIUM · SMSPOOL';
    $('serviceFilter').value = '';
    await loadServices();
  }

  document.querySelectorAll('.server-tab').forEach((button) => button.addEventListener('click', () => switchProvider(button.dataset.provider).catch((err) => toast(err.message, 'error'))));
  $('serviceFilter').addEventListener('input', () => {
    const query = $('serviceFilter').value.toLowerCase();
    renderOptions($('serviceSelect'), state.services.filter((row) => row.name.toLowerCase().includes(query)), 'Choose a service');
    $('countrySelect').disabled = true; $('countrySelect').innerHTML = '<option>Choose a service first</option>'; resetQuote();
  });
  $('serviceSelect').addEventListener('change', () => loadCountriesForService().catch((err) => toast(err.message, 'error')));
  $('countrySelect').addEventListener('change', () => showQuote());

  $('buyBtn').addEventListener('click', async () => {
    if (!state.quote) return;
    const service = $('serviceSelect').value;
    const country = $('countrySelect').value;
    const serviceName = $('serviceSelect').selectedOptions[0]?.textContent || service;
    const countryName = $('countrySelect').selectedOptions[0]?.textContent || country;
    if (!window.confirm(`Buy ${serviceName} in ${countryName} for ${naira(state.quote.price)}?`)) return;
    const button = $('buyBtn'); button.disabled = true; button.textContent = 'Purchasing…';
    try {
      const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'purchase' }, body: { provider: providerApi(), service, country, serviceName, countryName, operator: state.quote.operator } });
      state.activeOrder = data.order; showOrder(); startPolling(); refreshBalanceChip(); toast(`Number purchased for ${naira(data.charged)}`);
    } catch (err) { toast(err.message, 'error'); }
    button.disabled = false; button.textContent = 'Buy this number';
  });

  function showOrder() {
    const order = state.activeOrder; if (!order) return;
    $('orderCard').hidden = false; $('orderService').textContent = `${order.service} · ${order.country}`; $('orderNumber').textContent = order.phone_number || 'Waiting…'; $('otpBox').hidden = true; setBadge(order.status);
    $('orderCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function setBadge(status) { $('orderStatus').textContent = status; $('orderStatus').className = `badge ${status}`; }
  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }
  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        const data = await apiCall(API.numbers, { query: { action: 'check', orderId: state.activeOrder.id } });
        state.activeOrder = data.order; setBadge(state.activeOrder.status); $('orderNumber').textContent = state.activeOrder.phone_number || $('orderNumber').textContent;
        if (state.activeOrder.status === 'received') { $('otpCode').textContent = state.activeOrder.otp || '—'; $('otpBox').hidden = false; stopPolling(); toast('OTP received'); }
        else if (state.activeOrder.status !== 'pending') stopPolling();
      } catch {}
    }, 10000);
  }
  $('copyNumber').addEventListener('click', () => copyText($('orderNumber').textContent, $('copyNumber')));
  $('copyOtp').addEventListener('click', () => copyText($('otpCode').textContent, $('copyOtp')));
  $('cancelBtn').addEventListener('click', async () => {
    if (!state.activeOrder) return;
    try { const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'cancel', orderId: state.activeOrder.id } }); stopPolling(); state.activeOrder.status = 'cancelled'; setBadge('cancelled'); $('otpBox').hidden = true; refreshBalanceChip(); toast(`Cancelled — ${naira(data.refunded)} refunded`); } catch (err) { toast(err.message, 'error'); }
  });

  try { await switchProvider('cheap'); } catch (err) { toast(err.message, 'error'); }
})();
