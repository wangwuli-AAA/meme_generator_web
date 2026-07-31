const loginForm = document.getElementById('login-form');
const loginSubmit = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  loginSubmit.disabled = true;

  const formData = new FormData(loginForm);
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || '登录失败');
    window.location.replace('/');
  } catch (error) {
    showLoginError(error.message);
    loginSubmit.disabled = false;
  }
});
