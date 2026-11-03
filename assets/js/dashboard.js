/* SPLUG — Buy a number: route → service grid → country picker → price → confirm → live order ticket */
(async function () {
  if (!requireAuthPage()) return;
  mountHeader('dashboard'); refreshBalanceChip(); sweepExpired();

  const $ = (id) => document.getElementById(id);
  const ORDER_WINDOW_MS = 20 * 60 * 1000; // typical activation window; the provider decides the real expiry
  const POLL_MS = 6000;
  const state = {
    provider: 'cheap', services: [], countries: [], service: null, quote: null, quoteKey: null,
    order: null, pollTimer: null, tickTimer: null, loadId: 0, search: '', recent: [],
  };
  const providerApi = () => (state.provider === 'cheap' ? 'fivesim' : 'smspool');
  const routeName = (p = state.provider) => (p === 'cheap' ? 'Budget' : 'Priority');
  const orderRoute = (o) => (String(o?.smspool_order_id || '').startsWith('5sim:') ? 'Budget' : 'Priority');

  /* ---------- normalisers ---------- */
  const popularRank = (label) => { const i = POPULAR_SERVICES.indexOf(label); return i === -1 ? 999 : i; };
  function normServices(list) {
    return (list || [])
      .map((r) => {
        const id = String(r.id ?? r.ID ?? r.short_name ?? '');
        const raw = String(r.name ?? r.short_name ?? '').trim();
        const info = serviceInfo(raw);
        return { id, raw, name: info.label, price: Number(r.price || 0) || null };
      })
      .filter((r) => r.id && r.raw)
      .sort((a, b) => popularRank(a.name) - popularRank(b.name) || a.name.localeCompare(b.name));
  }
  function normCountries(list) {
    return (list || [])
      .map((r) => {
        const id = String(r.id ?? r.ID ?? r.short_name ?? '');
        const info = countryInfo(r);
        return { id, raw: String(r.name ?? ''), name: info.name, flag: info.flag, iso: info.iso };
      })
      .filter((r) => r.id && r.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ---------- step 2: service grid ---------- */
  const MAX_TILES = 120;
  function renderServices(message) {
    const grid = $('svcGrid');
    if (message) { grid.innerHTML = `<div class="grid-note">${esc(message)}</div>`; return; }
    const q = state.search.trim().toLowerCase();
    const rows = q ? state.services.filter((s) => s.name.toLowerCase().includes(q) || s.raw.toLowerCase().includes(q)) : state.services;
    if (!rows.length) { grid.innerHTML = `<div class="grid-note">No service matches “${esc(state.search)}”. Try another name or switch route.</div>`; return; }
    grid.innerHTML = rows.slice(0, MAX_TILES).map((s) => `
      <button type="button" class="svc-btn" data-id="${esc(s.id)}" aria-pressed="${state.service?.id === s.id}" title="${esc(s.name)}">
        ${serviceLogo(s.raw)}<span class="nm">${esc(s.name)}</span>${s.price ? `<span class="pr">from ${nairaShort(s.price)}</span>` : ''}
      </button>`).join('') + (rows.length > MAX_TILES ? `<div class="grid-note">Showing ${MAX_TILES} of ${rows.length} services. Search to find the rest.</div>` : '');
    $('svcCount').textContent = `${state.services.length.toLocaleString()} services`;
  }
  $('svcSearch').addEventListener('input', (e) => { state.search = e.target.value; renderServices(); });
  $('svcGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.svc-btn'); if (!b) return;
    const s = state.services.find((x) => x.id === b.dataset.id); if (!s) return;
    state.service = s;
    $('svcGrid').querySelectorAll('.svc-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onServiceSelected();
  });

  /* ---------- step 3: country picker ---------- */
  const countryPicker = createPicker($('countryPicker'), {
    placeholder: 'Search country, e.g. United States',
    label: 'Countries',
    onSelect: onCountrySelected,
    renderItem: (c) => `<span class="flag" aria-hidden="true">${c.flag}</span><span class="grow">${esc(c.name)}</span>${c.iso ? `<span class="muted mono" style="font-size:12px">${esc(c.iso)}</span>` : ''}`,
    searchText: (c) => `${c.name} ${c.raw} ${c.iso}`,
  });
  countryPicker.lock('Choose a service first');

  function markSteps() {
    const svc = state.service, ctry = countryPicker.selected;
    $('stepService').classList.toggle('is-done', !!svc);
    $('stepCountry').classList.toggle('is-done', !!ctry);
    $('stepCountry').classList.toggle('is-locked', !svc);
    $('serviceValue').textContent = svc ? svc.name : '';
    $('countryValue').textContent = ctry ? `${ctry.flag} ${ctry.name}` : '';
  }

  function resetQuote(message = 'Pick a service and a country to see the exact price.') {
    state.quote = null; state.quoteKey = null;
    $('quote').classList.add('is-empty');
    $('priceValue').textContent = '—'; $('priceMeta').textContent = message;
    $('buyBtn').disabled = true;
  }

  async function loadServices() {
    const myLoad = ++state.loadId;
    state.service = null; state.services = []; state.countries = [];
    renderServices('Loading services…'); countryPicker.lock('Choose a service first'); resetQuote(); markSteps();
    $('svcCount').textContent = '';
    try {
      const data = await apiCall(API.numbers, { query: { action: 'services', provider: providerApi() } });
      if (myLoad !== state.loadId) return; // route changed while loading
      state.services = normServices(data.services);
      // priority route ships its country list with the services; budget route loads it on demand
      state.countries = state.provider === 'premium' ? normCountries(data.countries) : [];
      renderServices(state.services.length ? '' : 'No services are available on this route right now.');
    } catch (err) {
      if (myLoad !== state.loadId) return;
      renderServices('Could not load services. Switch route or refresh the page.');
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
        state.countries = normCountries(data.countries);
      }
      countryPicker.setItems(state.countries); markSteps();
      if (window.matchMedia('(max-width: 960px)').matches) $('stepCountry').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) { countryPicker.lock('Could not load countries.'); toast(err.message, 'error'); }
  }

  async function onCountrySelected() {
    markSteps();
    const service = state.service?.id, country = countryPicker.value;
    if (!service || !country) return;
    const key = `${providerApi()}|${service}|${country}`;
    state.quoteKey = key; state.quote = null;
    $('buyBtn').disabled = true; $('quote').classList.add('is-empty');
    $('priceValue').textContent = '…'; $('priceMeta').textContent = 'Checking the live price…';
    try {
      const quote = await apiCall(API.numbers, { query: { action: 'quote', provider: providerApi(), service, country } });
      if (state.quoteKey !== key) return; // selection changed
      state.quote = quote;
      $('quote').classList.remove('is-empty');
      $('priceValue').textContent = naira(quote.price);
      $('priceMeta').textContent = `${state.service.name} · ${countryPicker.selected?.name || ''}. Nothing is charged until you confirm.`;
      $('buyBtn').disabled = false;
      if (window.matchMedia('(max-width: 960px)').matches) $('quote').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      if (state.quoteKey !== key) return;
      resetQuote(err.message); toast(err.message, 'error');
    }
  }

  /* ---------- step 1: route ---------- */
  async function switchProvider(provider) {
    state.provider = provider;
    document.querySelectorAll('.route-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.provider === provider)));
    $('routeBadge').className = `badge ${provider === 'cheap' ? 'budget' : 'priority'}`;
    $('routeBadge').textContent = `${routeName()} route`;
    $('svcSearch').value = ''; state.search = '';
    await loadServices();
  }
  document.querySelectorAll('.route-opt').forEach((b) => b.addEventListener('click', () => { if (b.dataset.provider !== state.provider) switchProvider(b.dataset.provider); }));

  /* ---------- purchase ---------- */
  $('buyBtn').addEventListener('click', async () => {
    if (!state.quote || !state.service) return;
    const service = state.service.id, country = countryPicker.value;
    const serviceName = state.service.name, countryName = countryPicker.selected?.name || country;
    const price = state.quote.price;
    if (balance.value == null) await refreshBalanceChip();
    const short = balance.value != null && balance.value < price;

    if (short) {
      const go = await confirmDialog({
        title: 'Fund your wallet to continue',
        rows: [['Price', naira(price)], ['Your balance', naira(balance.value)], ['Amount needed', naira(price - balance.value)]],
        confirmText: 'Fund wallet', cancelText: 'Not now',
      });
      if (go) window.location.href = `/wallet.html?need=${Math.ceil(price - balance.value)}`;
      return;
    }
    const ok = await confirmDialog({
      title: 'Confirm your number',
      rows: [['Service', serviceName], ['Country', `${countryPicker.selected?.flag || ''} ${countryName}`.trim()], ['Route', routeName()], ['Total', naira(price)]],
      warning: 'This amount is taken from your wallet now. If no code arrives, cancel the number for a wallet refund.',
      confirmText: `Pay ${naira(price)}`,
    });
    if (!ok) return;

    const btn = $('buyBtn'); setLoading(btn, true, 'Buying…');
    try {
      const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'purchase' }, body: { provider: providerApi(), service, country, serviceName, countryName, operator: state.quote.operator } });
      state.order = data.order || null; refreshBalanceChip();
      if (state.order) { renderTicket(); startPolling(); } else { await resumePending(); }
      toast(`Number ready — ${naira(data.charged)} charged`);
      loadRecent();
      if (window.matchMedia('(max-width: 960px)').matches) $('ticket').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false); btn.disabled = !state.quote;
  });

  /* ---------- active order ticket ---------- */
  const NOTE = {
    idle: 'Your number and code will appear here once you buy.',
    pending: 'Use this number on the app now. The code appears here automatically — keep this page open.',
    received: 'Code received. Copy it and finish your verification.',
    cancelled: 'This number was cancelled. The refund is in your wallet.',
    expired: 'This number expired before a code arrived, so the full price has been refunded to your wallet.',
  };
  const effStatus = (o) => {
    if (!o) return 'idle';
    let s = String(o.status || 'pending').toLowerCase();
    if (s === 'canceled') s = 'cancelled';
    if (s === 'received' && !o.otp) s = 'pending'; // never claim a code we don't have
    return s;
  };
  function renderOtp(code) {
    const chars = code ? [...String(code)] : Array(6).fill('–');
    $('otpCode').innerHTML = chars.map((c) => `<span>${esc(c)}</span>`).join('');
  }
  function renderTicket() {
    const o = state.order;
    const status = effStatus(o);
    const t = $('ticket'); t.dataset.state = status;
    $('orderStatus').className = `badge ${status === 'idle' ? 'neutral' : status}`;
    $('orderStatusText').textContent = status === 'idle' ? 'No active order' : (ORDER_STATUS[status] || titleCase(status));
    $('orderLogo').innerHTML = o ? serviceLogo(o.service) : '';
    $('orderService').textContent = o ? `${o.service} · ${o.country}` : 'Nothing yet';
    $('orderRoute').hidden = !o;
    if (o) { const r = orderRoute(o); $('orderRoute').className = `badge ${r === 'Budget' ? 'budget' : 'priority'}`; $('orderRoute').textContent = r; }
    $('orderNumber').textContent = o?.phone_number || '—';
    $('copyNumber').disabled = !o?.phone_number;
    renderOtp(status === 'received' ? o.otp : null);
    $('copyOtp').hidden = status !== 'received';
    $('cancelBtn').hidden = status !== 'pending';
    $('checkBtn').hidden = status !== 'pending';
    $('newBtn').hidden = !['received', 'cancelled', 'expired'].includes(status);
    $('fullSms').hidden = !(status === 'received' && o.full_sms);
    $('fullSms').textContent = o?.full_sms || '';
    $('ticketNote').textContent = NOTE[status] || '';
    $('statActive').textContent = status === 'pending' ? 'Waiting for code' : status === 'received' ? 'Code received' : 'None';
    tick();
  }

  function tick() {
    const o = state.order, timer = $('timer');
    if (!o || effStatus(o) !== 'pending' || !o.created_at) { timer.hidden = true; clearInterval(state.tickTimer); state.tickTimer = null; return; }
    timer.hidden = false;
    const left = new Date(o.created_at).getTime() + ORDER_WINDOW_MS - Date.now();
    const pct = Math.max(0, Math.min(100, (left / ORDER_WINDOW_MS) * 100));
    $('timerBar').style.width = pct + '%';
    timer.classList.toggle('low', left < 3 * 60 * 1000);
    if (left > 0) {
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $('timerText').textContent = `${m}:${String(s).padStart(2, '0')}`;
      $('timerLabel').textContent = 'Time left (approx.)';
    } else {
      $('timerText').textContent = '0:00';
      $('timerLabel').textContent = 'Checking final status…';
    }
    if (!state.tickTimer) state.tickTimer = setInterval(tick, 1000);
  }

  function stopPolling() { if (state.pollTimer) clearInterval(state.pollTimer); state.pollTimer = null; }
  async function checkOnce() {
    if (!state.order) return;
    try {
      const data = await apiCall(API.numbers, { query: { action: 'check', orderId: state.order.id } });
      const prev = effStatus(state.order);
      state.order = { ...state.order, ...data.order };
      renderTicket();
      const now = effStatus(state.order);
      if (now !== 'pending') {
        stopPolling();
        if (now === 'received' && prev !== 'received') { toast('Code received'); try { navigator.vibrate && navigator.vibrate(120); } catch {} }
        if (now === 'expired' || now === 'cancelled') refreshBalanceChip();
        loadRecent();
      }
    } catch {}
  }
  function startPolling() {
    stopPolling();
    checkOnce();
    state.pollTimer = setInterval(() => { if (!document.hidden) checkOnce(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.pollTimer) checkOnce(); });

  $('copyNumber').addEventListener('click', () => copyText(state.order?.phone_number || '', $('copyNumber')));
  $('copyOtp').addEventListener('click', () => copyText(state.order?.otp || '', $('copyOtp')));
  $('otpCode').addEventListener('click', () => { if (effStatus(state.order) === 'received') copyText(state.order.otp, $('copyOtp')); });
  $('checkBtn').addEventListener('click', async () => { const b = $('checkBtn'); b.disabled = true; await checkOnce(); b.disabled = false; });
  $('newBtn').addEventListener('click', () => { stopPolling(); state.order = null; renderTicket(); $('stepService').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('cancelBtn').addEventListener('click', async () => {
    if (!state.order) return;
    const ok = await confirmDialog({ title: 'Cancel this number?', rows: [['Number', state.order.phone_number || '—'], ['Refund to wallet', naira(state.order.price)]], warning: 'Only cancel if you have not received a code. Some numbers can only be cancelled after a short wait.', confirmText: 'Cancel and refund', cancelText: 'Keep waiting', danger: true });
    if (!ok) return;
    const btn = $('cancelBtn'); setLoading(btn, true, 'Cancelling…');
    try {
      const data = await apiCall(API.numbers, { method: 'POST', query: { action: 'cancel', orderId: state.order.id } });
      stopPolling(); state.order.status = 'cancelled'; renderTicket(); refreshBalanceChip(); loadRecent();
      toast(`Cancelled. ${naira(data.refunded)} returned to your wallet.`);
    } catch (err) { toast(err.message, 'error'); }
    setLoading(btn, false);
  });

  /* ---------- recent orders + resume a waiting order after refresh ---------- */
  function renderRecent() {
    const list = $('recentList');
    const rows = state.recent.slice(0, 5);
    $('statCodes').textContent = String(state.recent.filter((o) => o.otp).length);
    if (!rows.length) { list.innerHTML = '<p class="muted" style="font-size:14px;margin:0">No numbers yet. Your recent orders will show here.</p>'; return; }
    list.innerHTML = `<ul class="list">${rows.map((o) => {
      const st = effStatus(o);
      return `<li class="row" style="grid-template-columns:1fr auto">
        <div class="row-lead">${serviceLogo(o.service)}<div style="min-width:0"><div class="row-title" style="font-size:14px">${esc(o.service)} <span class="sep">·</span> ${esc(o.country)}</div><div class="row-sub mono">${esc(o.phone_number || '')}</div></div></div>
        <div class="row-end">${o.otp ? `<button type="button" class="otp-pill has-code" data-copy="${esc(o.otp)}" title="Copy code">${esc(o.otp)}</button>` : `<span class="badge ${st}">${esc(ORDER_STATUS[st] || titleCase(st))}</span>`}</div>
      </li>`;
    }).join('')}</ul>`;
  }
  $('recentList').addEventListener('click', (e) => { const el = e.target.closest('[data-copy]'); if (el) copyText(el.dataset.copy).then(() => toast('Code copied')); });

  async function loadRecent() {
    try {
      const data = await apiCall(API.history, { query: { action: 'orders' } });
      state.recent = data.orders || []; renderRecent();
      return state.recent;
    } catch { return []; }
  }
  async function resumePending() {
    const orders = await loadRecent();
    const recent = orders.find((o) => effStatus(o) === 'pending' && Date.now() - new Date(o.created_at).getTime() < 30 * 60 * 1000);
    if (recent) { state.order = recent; renderTicket(); startPolling(); }
  }

  renderOtp(null); renderTicket();
  await switchProvider('cheap');
  resumePending();
})();
