document.addEventListener('DOMContentLoaded', () => {
  Form.init();
  Browser.init();
  document.getElementById('btn-logout').addEventListener('click', async () => {
    const button = document.getElementById('btn-logout');
    button.disabled = true;
    try {
      await API.logout();
    } finally {
      window.location.reload();
    }
  });
});
