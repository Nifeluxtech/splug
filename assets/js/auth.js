/* SPLUG — login & register pages */
function nextUrl() { const n = new URLSearchParams(location.search).get('next') || ''; return /^\/[a-z0-9/_-]*$/i.test(n) ? n : '/dashboard.html'; }
(function () {
  const isRegister = document.body.dataset.mode === 'register';
  // referral code from ?ref= (kept for 30 days so a later sign-up still counts)
  try {
    const q = new URLSearchParams(location.search).get('ref');
    if (q) localStorage.setItem('splug_ref', JSON.stringify({ code: q.trim().toUpperCase().slice(0, 12), at: Date.now() }));
    const saved = JSON.parse(localStorage.getItem('splug_ref') || 'null');
    const el = document.getElementById('ref');
    if (el && saved && Date.now() - saved.at < 30 * 864e5) el.value = saved.code;
  } catch {}
  mountHeader(isRegister ? 'register' : 'login');
  // already signed in → straight to the dashboard
  if (store.token) { window.location.replace(nextUrl()); return; }

  const form = document.getElementById('authForm');
  const submitBtn = form.querySelector('button[type=submit]');
  const errBox = document.getElementById('formError');
  const errText = document.getElementById('formErrorText');

  const showError = (msg) => { errText.textContent = msg; errBox.hidden = false; };
  const clearError = () => { errBox.hidden = true; };

  document.querySelectorAll('[data-toggle="password"]').forEach((btn) => {
    const input = btn.parentElement.querySelector('input');
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? icons.eyeOff('icon-sm') : icons.eye('icon-sm');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
  form.addEventListener('input', clearError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    const username = isRegister ? form.username.value.trim() : '';

    if (isRegister && username.length < 3) { showError('Choose a username with at least 3 characters.'); form.username.focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { showError('Enter a valid email address.'); form.email.focus(); return; }
    if (!password || (isRegister && password.length < 6)) { showError(isRegister ? 'Your password needs at least 6 characters.' : 'Enter your password.'); form.password.focus(); return; }
    if (isRegister && form.agree && !form.agree.checked) { showError('Please agree to the Terms of Service, Privacy Policy and Refund Policy to continue.'); form.agree.focus(); return; }

    setLoading(submitBtn, true, isRegister ? 'Creating account…' : 'Signing in…');
    try {
      const body = { action: isRegister ? 'register' : 'login', email, password };
      if (isRegister) { body.username = username; const r = (form.ref?.value || '').trim(); if (r) body.ref = r; }
      const data = await apiCall(API.auth, { method: 'POST', body });
      store.token = data.access_token;
      store.refreshToken = data.refresh_token;
      if (isRegister) { trackPixel('CompleteRegistration', { content_name: 'SPLUG account', status: true }); await new Promise((r) => setTimeout(r, 400)); }
      window.location.href = nextUrl();
    } catch (err) {
      showError(err.message);
      setLoading(submitBtn, false);
    }
  });
})();
