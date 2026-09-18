const Browser = {
  state: {
    search: '',
    page: 1,
    pageSize: 24,
    total: 0,
    items: [],
    selectedKey: null,
    loadRequestId: 0,
    loadController: null,
  },

  elements: {
    grid: null,
    pagination: null,
    searchInput: null,
    memeCount: null,
    clearSearch: null,
  },

  init() {
    this.elements.grid = document.getElementById('meme-grid');
    this.elements.pagination = document.getElementById('pagination');
    this.elements.searchInput = document.getElementById('search-input');
    this.elements.memeCount = document.getElementById('meme-count');
    this.elements.clearSearch = document.getElementById('clear-search');

    this.elements.searchInput.addEventListener(
      'input',
      Utils.debounce(() => this.onSearch(), 300),
    );
    this.elements.clearSearch.addEventListener('click', () => {
      this.elements.searchInput.value = '';
      this.onSearch();
      this.elements.searchInput.focus();
    });

    this.loadMemes();
  },

  onSearch() {
    this.state.search = this.elements.searchInput.value.trim();
    this.state.page = 1;
    this.loadMemes();
  },

  async loadMemes() {
    const requestId = ++this.state.loadRequestId;
    if (this.state.loadController) this.state.loadController.abort();
    this.state.loadController = new AbortController();
    this.elements.clearSearch.hidden = !this.state.search;
    if (!this.state.items.length) this.renderSkeletons();
    this.elements.grid.classList.add('is-loading');
    this.elements.grid.setAttribute('aria-busy', 'true');
    Utils.showLoading(true);
    try {
      const data = await API.listMemes({
        search: this.state.search,
        page: this.state.page,
        pageSize: this.state.pageSize,
        signal: this.state.loadController.signal,
      });
      if (requestId !== this.state.loadRequestId) return;
      this.state.total = data.total;
      this.state.items = data.items;
      this.elements.memeCount.textContent = data.total;
      this.renderGrid(data.items);
      this.renderPagination(data.total, data.page, data.page_size);
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (requestId !== this.state.loadRequestId) return;
      this.renderMessage('加载失败', '请检查网络后重试。', '重试', () => this.loadMemes());
      Utils.toast('加载表情列表失败: ' + e.message, 'error');
    } finally {
      if (requestId === this.state.loadRequestId) {
        this.elements.grid.classList.remove('is-loading');
        this.elements.grid.setAttribute('aria-busy', 'false');
        Utils.showLoading(false);
      }
    }
  },

  renderSkeletons() {
    this.elements.grid.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const skeleton = document.createElement('div');
      skeleton.className = 'meme-skeleton';
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.innerHTML = '<div class="skeleton-preview"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div>';
      this.elements.grid.appendChild(skeleton);
    }
  },

  renderMessage(title, detail, actionText, action) {
    const message = document.createElement('div');
    message.className = 'grid-message';
    message.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    if (actionText && action) {
      const button = document.createElement('button');
      button.className = 'page-btn';
      button.textContent = actionText;
      button.addEventListener('click', action);
      message.appendChild(button);
    }
    this.elements.grid.innerHTML = '';
    this.elements.grid.appendChild(message);
  },

  renderGrid(items) {
    const grid = this.elements.grid;
    grid.innerHTML = '';
    if (!items.length) {
      this.renderMessage('没有找到表情包', '换个关键词或清除搜索条件试试。', '清除搜索', () => {
        this.elements.clearSearch.click();
      });
      return;
    }
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'meme-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `选择 ${item.key}`);
      if (item.key === this.state.selectedKey) card.classList.add('active');
      card.dataset.key = item.key;

      const img = document.createElement('img');
      img.className = 'meme-card-preview';
      img.src = API.getPreviewUrl(item.key);
      img.alt = item.key;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () {
        this.style.display = 'none';
      };

      const info = document.createElement('div');
      info.className = 'meme-card-info';
      const name = document.createElement('div');
      name.className = 'meme-card-name';
      name.title = item.key;
      name.textContent = item.key;

      const keywords = document.createElement('div');
      keywords.className = 'meme-card-keywords';
      keywords.title = item.keywords.join('/');
      keywords.textContent = item.keywords.join('/');

      info.appendChild(name);
      info.appendChild(keywords);

      card.appendChild(img);
      card.appendChild(info);
      card.addEventListener('click', () => this.selectMeme(item.key));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.selectMeme(item.key);
        }
      });
      grid.appendChild(card);
    }
  },

  renderPagination(total, page, pageSize) {
    const totalPages = Math.ceil(total / pageSize);
    const el = this.elements.pagination;
    el.innerHTML = '';
    if (totalPages <= 1) return;

    const addBtn = (text, p, disabled = false, active = false) => {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (active ? ' active' : '');
      btn.textContent = text;
      btn.disabled = disabled;
      if (!disabled && !active) {
        btn.addEventListener('click', () => {
          this.state.page = p;
          this.loadMemes();
        });
      }
      el.appendChild(btn);
    };

    addBtn('‹', page - 1, page <= 1);

    const range = [];
    const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
      range.push(i);
    }
    if (range[0] > 1) {
      addBtn('1', 1);
      if (range[0] > 2) {
        const dots = document.createElement('span');
        dots.className = 'page-btn';
        dots.textContent = '...';
        dots.style.border = 'none';
        dots.style.cursor = 'default';
        el.appendChild(dots);
      }
    }
    for (const p of range) {
      addBtn(String(p), p, false, p === page);
    }
    if (range[range.length - 1] < totalPages) {
      if (range[range.length - 1] < totalPages - 1) {
        const dots = document.createElement('span');
        dots.className = 'page-btn';
        dots.textContent = '...';
        dots.style.border = 'none';
        dots.style.cursor = 'default';
        el.appendChild(dots);
      }
      addBtn(String(totalPages), totalPages);
    }

    addBtn('›', page + 1, page >= totalPages);
  },

  selectMeme(key) {
    this.state.selectedKey = key;
    // Highlight selected card
    this.elements.grid.querySelectorAll('.meme-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.key === key);
    });
    // Load form
    if (typeof Form !== 'undefined') {
      Form.loadMeme(key);
    }
  },
};
