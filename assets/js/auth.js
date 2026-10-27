/* SPLUG — login & register pages */
(function () {
  const isRegister = document.body.dataset.mode === 'register';
  mountHeader(isRegister ? 'register' : 'login');
  // already signed in → straight to the dashboard
  if (store.token) { window.location.replace('/dashboard.html'); return; }

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

    setLoading(submitBtn, true, isRegister ? 'Creating account…' : 'Signing in…');
    try {
      const body = { action: isRegister ? 'register' : 'login', email, password };
      if (isRegister) body.username = username;
      const data = await apiCall(API.auth, { method: 'POST', body });
      store.token = data.access_token;
      store.refreshToken = data.refresh_token;
      window.location.href = '/dashboard.html';
    } catch (err) {
      showError(err.message);
      setLoading(submitBtn, false);
    }
  });
})();
