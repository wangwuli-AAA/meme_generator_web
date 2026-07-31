const Browser = {
  state: {
    search: '',
    page: 1,
    pageSize: 24,
    total: 0,
    items: [],
    selectedKey: null,
  },

  elements: {
    grid: null,
    pagination: null,
    searchInput: null,
    memeCount: null,
  },

  init() {
    this.elements.grid = document.getElementById('meme-grid');
    this.elements.pagination = document.getElementById('pagination');
    this.elements.searchInput = document.getElementById('search-input');
    this.elements.memeCount = document.getElementById('meme-count');

    this.elements.searchInput.addEventListener(
      'input',
      Utils.debounce(() => this.onSearch(), 300)
    );

    this.loadMemes();
  },

  onSearch() {
    this.state.search = this.elements.searchInput.value.trim();
    this.state.page = 1;
    this.loadMemes();
  },

  async loadMemes() {
    Utils.showLoading(true);
    try {
      const data = await API.listMemes({
        search: this.state.search,
        page: this.state.page,
        pageSize: this.state.pageSize,
      });
      this.state.total = data.total;
      this.state.items = data.items;
      this.elements.memeCount.textContent = data.total;
      this.renderGrid(data.items);
      this.renderPagination(data.total, data.page, data.page_size);
    } catch (e) {
      Utils.toast('加载表情列表失败: ' + e.message, 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  renderGrid(items) {
    const grid = this.elements.grid;
    grid.innerHTML = '';
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'meme-card';
      if (item.key === this.state.selectedKey) card.classList.add('active');
      card.dataset.key = item.key;

      const img = document.createElement('img');
      img.className = 'meme-card-preview';
      img.src = API.getPreviewUrl(item.key);
      img.alt = item.key;
      img.loading = 'lazy';
      img.onerror = function () {
        this.style.display = 'none';
      };

      const info = document.createElement('div');
      info.className = 'meme-card-info';
      info.innerHTML = `
        <div class="meme-card-name" title="${item.key}">${item.key}</div>
        <div class="meme-card-keywords" title="${item.keywords.join('/')}">${item.keywords.join('/')}</div>
      `;

      card.appendChild(img);
      card.appendChild(info);
      card.addEventListener('click', () => this.selectMeme(item.key));
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
