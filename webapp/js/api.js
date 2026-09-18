const API = {
  checkAuth(response) {
    if (response.status === 401) {
      if (window.location.pathname === '/') {
        window.location.reload();
      } else {
        window.location.replace('/');
      }
      throw new Error('登录状态已过期');
    }
    return response;
  },

  async logout() {
    const resp = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  },

  async listMemes({ search = '', page = 1, pageSize = 24, signal } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('page', page);
    params.set('page_size', pageSize);
    const resp = this.checkAuth(await fetch(`/memes/list?${params}`, { signal }));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getMemeInfo(key, signal) {
    const resp = this.checkAuth(await fetch(`/memes/${encodeURIComponent(key)}/info`, { signal }));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  getPreviewUrl(key) {
    return `/memes/${encodeURIComponent(key)}/preview`;
  },

  async getPreview(key, signal) {
    const resp = this.checkAuth(await fetch(this.getPreviewUrl(key), { signal }));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.blob();
  },

  async generate(key, formData, signal) {
    const resp = this.checkAuth(await fetch(`/memes/${encodeURIComponent(key)}/`, {
      method: 'POST',
      body: formData,
      signal,
    }));
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.blob();
  },
};
