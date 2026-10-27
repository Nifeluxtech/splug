/* SPLUG — login & register pages */

(function () {
  // already logged in → straight to dashboard
  if (store.token) { window.location.replace('/dashboard.html'); return; }

  const isRegister = document.body.dataset.mode === 'register';
  const form = document.getElementById('authForm');
  const submitBtn = form.querySelector('button[type=submit]');
  const idleText = submitBtn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait…';

    try {
      const body = {
        action: isRegister ? 'register' : 'login',
        email: form.email.value.trim().toLowerCase(),
        password: form.password.value,
      };
      if (isRegister) body.username = form.username.value.trim();

      const data = await apiCall(API.auth, { method: 'POST', body });
      store.token = data.access_token;
      store.refreshToken = data.refresh_token;
      window.location.href = '/dashboard.html';
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = idleText;
    }
  });
})();
