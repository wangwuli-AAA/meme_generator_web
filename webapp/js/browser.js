const Browser = {
  state: {
    search: '',
    tag: '',
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
    tagSelect: null,
    tagList: null,
    memeCount: null,
  },

  init() {
    this.elements.grid = document.getElementById('meme-grid');
    this.elements.pagination = document.getElementById('pagination');
    this.elements.searchInput = document.getElementById('search-input');
    this.elements.tagSelect = document.getElementById('tag-select');
    this.elements.tagList = document.getElementById('tag-list');
    this.elements.memeCount = document.getElementById('meme-count');

    this.elements.searchInput.addEventListener(
      'input',
      Utils.debounce(() => this.onSearch(), 300)
    );

    this.elements.tagSelect.addEventListener('change', () => {
      this.state.tag = this.elements.tagSelect.value;
      this.state.page = 1;
      this.loadMemes();
      this.highlightTag(this.state.tag);
    });

    this.loadTags();
    this.loadMemes();
  },

  async loadTags() {
    try {
      const tags = await API.getTags();
      this.renderTags(tags);
      this.renderTagSelect(tags);
    } catch (e) {
      console.error('Failed to load tags:', e);
    }
  },

  renderTags(tags) {
    const el = this.elements.tagList;
    el.innerHTML = '';
    const allItem = document.createElement('div');
    allItem.className = 'tag-item active';
    allItem.dataset.tag = '';
    allItem.innerHTML = '<span>全部</span>';
    allItem.addEventListener('click', () => this.selectTag(''));
    el.appendChild(allItem);

    for (const { tag, count } of tags) {
      const item = document.createElement('div');
      item.className = 'tag-item';
      item.dataset.tag = tag;
      item.innerHTML = `<span>${tag}</span><span class="tag-count">${count}</span>`;
      item.addEventListener('click', () => this.selectTag(tag));
      el.appendChild(item);
    }
  },

  renderTagSelect(tags) {
    const sel = this.elements.tagSelect;
    sel.innerHTML = '<option value="">全部标签</option>';
    for (const { tag, count } of tags) {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = `${tag} (${count})`;
      sel.appendChild(opt);
    }
  },

  selectTag(tag) {
    this.state.tag = tag;
    this.state.page = 1;
    this.elements.tagSelect.value = tag;
    this.highlightTag(tag);
    this.loadMemes();
  },

  highlightTag(tag) {
    const items = this.elements.tagList.querySelectorAll('.tag-item');
    items.forEach((el) => {
      el.classList.toggle('active', el.dataset.tag === tag);
    });
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
        tag: this.state.tag,
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
