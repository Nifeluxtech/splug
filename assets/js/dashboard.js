/* SPLUG — dashboard: buy numbers, poll for OTP, cancel + refund (v2) */

(async function () {
  if (!requireAuthPage()) return;
  mountFooter('dashboard');
  refreshBalanceChip();

  const $ = (id) => document.getElementById(id);
  let activeOrder = null;
  let pollTimer = null;

  /* ---------- catalogue (cached in sessionStorage) ---------- */
  const pick = (item, keys) => {
    for (const k of keys) if (item && item[k] != null && item[k] !== '') return item[k];
    return null;
  };

  async function loadCatalog() {
    // try cache first
    try {
      const cached = JSON.parse(sessionStorage.getItem('splug_catalog') || 'null');
      if (cached && cached.services.length && cached.countries.length) return cached;
    } catch {}

    try {
      const data = await apiCall(API.numbers, { query: { action: 'services' } });
      const cat = {
        services: (data.services || [])
          .map((s) => ({
            id: pick(s, ['ID', 'id', 'service_id', 'serviceID']),
            name: pick(s, ['Name', 'name', 'service_name']) || 'Unknown',
          }))
          .filter((s) => s.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
        countries: (data.countries || [])
          .map((c) => ({
            id: pick(c, ['ID', 'id', 'country_id', 'countryID']),
            name: pick(c, ['Name', 'name', 'country_name']) || 'Unknown',
          }))
          .filter((c) => c.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
      if (!cat.services.length || !cat.countries.length) {
        throw new Error('Catalogue came back empty — check your SMSPool key/balance');
      }
      try { sessionStorage.setItem('splug_catalog', JSON.stringify(cat)); } catch {}
      return cat;
    } catch (err) {
      toast(`Couldn't load services: ${err.message}`, 'error');
      addRetryButton();
      throw err;
    }
  }

  function addRetryButton() {
    if ($('retryBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'retryBtn';
    btn.className = 'btn btn-ghost';
    btn.style.marginTop = '10px';
    btn.textContent = '↻ Retry loading services';
    btn.addEventListener('click', () => window.location.reload());
    $('buyBtn').after(btn);
  }

  const cat = await loadCatalog();

  function renderServices() {
    const q = ($('serviceFilter').value || '').toLowerCase();
    const visible = cat.services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 100);
    $('serviceSelect').innerHTML =
      visible.map((s) => `<option value="${s.id}">${s.name}</option>`).join('') ||
      '<option value="">No service found</option>';
  }
  $('serviceFilter').addEventListener('input', renderServices);
  renderServices();
  $('countrySelect').innerHTML = cat.countries
    .map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

  /* ---------- purchase ---------- */
  $('buyBtn').addEventListener('click', async () => {
    const serviceId = $('serviceSelect').value;
    const countryId = $('countrySelect').value;
    if (!serviceId || !countryId) { toast('Select a service and a country', 'error'); return; }

    const btn = $('buyBtn');
    btn.disabled = true;
    btn.textContent = 'Purchasing…';
    try {
      const data = await apiCall(API.numbers, {
        method: 'POST',
        query: { action: 'purchase' },
        body: {
          country: countryId,
          service: serviceId,
          countryName: $('countrySelect').selectedOptions[0].textContent,
          serviceName: $('serviceSelect').selectedOptions[0].textContent,
        },
      });
      activeOrder = data.order;
      showOrder();
      startPolling();
      refreshBalanceChip();
      toast(`Number purchased — ${naira(data.charged)} charged`);
    } catch (err) {
      toast(err.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Purchase number';
  });

  /* ---------- active order UI ---------- */
  function showOrder() {
    if (!activeOrder) return;
    $('orderCard').hidden = false;
    $('orderService').textContent = `${activeOrder.service} • ${activeOrder.country}`;
    $('orderNumber').textContent = activeOrder.phone_number || '';
    $('otpBox').hidden = true;
    setBadge(activeOrder.status);
  }

  function setBadge(status) {
    const b = $('orderStatus');
    b.textContent = status;
    b.className = 'badge ' + status;
  }

  /* ---------- OTP polling (every 10s) ---------- */
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const data = await apiCall(API.numbers, {
          query: { action: 'check', orderId: activeOrder.id },
        });
        activeOrder = data.order;
        setBadge(activeOrder.status);
        if (activeOrder.status === 'received') {
          $('otpCode').textContent = activeOrder.otp;
          $('otpBox').hidden = false;
          $('otpBox').scrollIntoView({ behavior: 'smooth' });
          stopPolling();
          toast('OTP received! 🎉');
        } else if (activeOrder.status !== 'pending') {
          stopPolling();
        }
      } catch {}
    }, 10000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /* ---------- copy / cancel ---------- */
  $('copyNumber').addEventListener('click', () => copyText($('orderNumber').textContent, $('copyNumber')));
  $('copyOtp').addEventListener('click', () => copyText($('otpCode').textContent, $('copyOtp')));

  $('cancelBtn').addEventListener('click', async () => {
    try {
      const data = await apiCall(API.numbers, {
        method: 'POST',
        query: { action: 'cancel', orderId: activeOrder.id },
      });
      stopPolling();
      activeOrder.status = 'cancelled';
      setBadge('cancelled');
      $('otpBox').hidden = true;
      refreshBalanceChip();
      toast(`Cancelled — ${naira(data.refunded)} refunded`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
})();
