const API = {
  async listMemes({ search = '', tag = '', page = 1, pageSize = 24 } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    params.set('page', page);
    params.set('page_size', pageSize);
    const resp = await fetch(`/memes/list?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getTags() {
    const resp = await fetch('/memes/tags');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  async getMemeInfo(key) {
    const resp = await fetch(`/memes/${encodeURIComponent(key)}/info`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  },

  getPreviewUrl(key) {
    return `/memes/${encodeURIComponent(key)}/preview`;
  },

  async generate(key, formData) {
    const resp = await fetch(`/memes/${encodeURIComponent(key)}/`, {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    return resp.blob();
  },
};
