const Form = {
  currentMeme: null,
  currentBlob: null,

  elements: {
    section: null,
    title: null,
    close: null,
    imageGroup: null,
    imageCount: null,
    imageArea: null,
    textGroup: null,
    textInputs: null,
    argsGroup: null,
    argsInputs: null,
    btnPreview: null,
    btnGenerate: null,
    btnDownload: null,
    resultArea: null,
    resultImage: null,
  },

  init() {
    this.elements.section = document.getElementById('meme-form-section');
    this.elements.title = document.getElementById('form-title');
    this.elements.close = document.getElementById('form-close');
    this.elements.imageGroup = document.getElementById('image-group');
    this.elements.imageCount = document.getElementById('image-count');
    this.elements.imageArea = document.getElementById('image-upload-area');
    this.elements.textGroup = document.getElementById('text-group');
    this.elements.textInputs = document.getElementById('text-inputs');
    this.elements.argsGroup = document.getElementById('args-group');
    this.elements.argsInputs = document.getElementById('args-inputs');
    this.elements.btnPreview = document.getElementById('btn-preview');
    this.elements.btnGenerate = document.getElementById('btn-generate');
    this.elements.btnDownload = document.getElementById('btn-download');
    this.elements.resultArea = document.getElementById('result-area');
    this.elements.resultImage = document.getElementById('result-image');

    this.elements.close.addEventListener('click', () => this.close());
    this.elements.btnPreview.addEventListener('click', () => this.preview());
    this.elements.btnGenerate.addEventListener('click', () => this.generate());
    this.elements.btnDownload.addEventListener('click', () => this.download());
  },

  async loadMeme(key) {
    try {
      const info = await API.getMemeInfo(key);
      this.currentMeme = info;
      this.currentBlob = null;
      this.render(info);
      this.elements.section.style.display = 'block';
      this.elements.resultArea.style.display = 'none';
      this.elements.btnDownload.disabled = true;
      this.elements.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      Utils.toast('加载表情信息失败: ' + e.message, 'error');
    }
  },

  render(info) {
    this.elements.title.textContent = info.key + ' — ' + info.keywords.join('/');

    // Images
    const { min_images, max_images } = info.params_type;
    if (max_images > 0) {
      this.elements.imageGroup.style.display = 'block';
      this.elements.imageCount.textContent = min_images === max_images
        ? `需要 ${min_images} 张`
        : `需要 ${min_images} ~ ${max_images} 张`;
      this.renderImageSlots(max_images);
    } else {
      this.elements.imageGroup.style.display = 'none';
    }

    // Texts
    const { min_texts, max_texts, default_texts } = info.params_type;
    if (max_texts > 0) {
      this.elements.textGroup.style.display = 'block';
      this.renderTextInputs(max_texts, default_texts);
    } else {
      this.elements.textGroup.style.display = 'none';
    }

    // Args
    if (info.params_type.args_type) {
      this.elements.argsGroup.style.display = 'block';
      this.renderArgsInputs(info.params_type.args_type);
    } else {
      this.elements.argsGroup.style.display = 'none';
    }
  },

  renderImageSlots(count) {
    const area = this.elements.imageArea;
    area.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const slot = document.createElement('div');
      slot.className = 'image-slot';
      slot.dataset.index = i;
      slot.innerHTML = `
        <div class="image-slot-placeholder">+</div>
        <div class="image-slot-label">图片 ${i + 1}</div>
        <input type="file" accept="image/*">
      `;

      const input = slot.querySelector('input');
      input.addEventListener('change', (e) => this.onImageSelected(e, slot));

      // Drag & drop
      slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.style.borderColor = 'var(--primary)'; });
      slot.addEventListener('dragleave', () => { slot.style.borderColor = ''; });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.style.borderColor = '';
        if (e.dataTransfer.files.length) {
          input.files = e.dataTransfer.files;
          this.onImageSelected({ target: input }, slot);
        }
      });

      area.appendChild(slot);
    }
  },

  onImageSelected(e, slot) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      slot.classList.add('has-image');
      slot.innerHTML = `
        <img src="${ev.target.result}" alt="预览">
        <button class="image-slot-remove" title="移除">&times;</button>
        <input type="file" accept="image/*">
      `;
      const newInput = slot.querySelector('input');
      newInput.files = e.target.files;
      newInput.addEventListener('change', (ev2) => this.onImageSelected(ev2, slot));
      slot.querySelector('.image-slot-remove').addEventListener('click', (ev3) => {
        ev3.stopPropagation();
        this.clearSlot(slot);
      });
    };
    reader.readAsDataURL(file);
  },

  clearSlot(slot) {
    slot.classList.remove('has-image');
    const idx = slot.dataset.index;
    slot.innerHTML = `
      <div class="image-slot-placeholder">+</div>
      <div class="image-slot-label">图片 ${parseInt(idx) + 1}</div>
      <input type="file" accept="image/*">
    `;
    slot.querySelector('input').addEventListener('change', (e) => this.onImageSelected(e, slot));
  },

  renderTextInputs(count, defaults) {
    const container = this.elements.textInputs;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('div');
      row.className = 'text-input-row';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `文字 ${i + 1}`;
      input.dataset.index = i;
      if (defaults && defaults[i]) input.value = defaults[i];
      row.appendChild(input);
      container.appendChild(row);
    }
  },

  renderArgsInputs(argsType) {
    const container = this.elements.argsInputs;
    container.innerHTML = '';

    // Use parser_options for rendering (they have user-friendly names)
    if (argsType.parser_options && argsType.parser_options.length > 0) {
      for (const opt of argsType.parser_options) {
        this.renderParserOption(container, opt);
      }
    } else if (argsType.args_model && argsType.args_model.properties) {
      // Fallback: render from JSON schema
      for (const [name, schema] of Object.entries(argsType.args_model.properties)) {
        if (name === 'user_infos') continue; // Internal field
        this.renderSchemaField(container, name, schema);
      }
    }
  },

  renderParserOption(container, opt) {
    // Get the first arg's type info if available
    const arg = opt.args && opt.args[0];
    const row = document.createElement('div');
    row.className = 'args-row';

    const label = document.createElement('label');
    label.textContent = opt.help_text || opt.names.join('/');
    row.appendChild(label);

    if (opt.action && opt.action.type === 'store_true') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.argName = opt.names[0].replace(/^--/, '');
      input.dataset.argType = 'bool';
      if (opt.default === true) input.checked = true;
      row.appendChild(input);
    } else if (arg && arg.value === 'float') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.dataset.argName = opt.names[0].replace(/^--/, '');
      input.dataset.argType = 'float';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    } else if (arg && arg.value === 'int') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.dataset.argName = opt.names[0].replace(/^--/, '');
      input.dataset.argType = 'int';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.argName = opt.names[0].replace(/^--/, '');
      input.dataset.argType = 'str';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    }

    container.appendChild(row);
  },

  renderSchemaField(container, name, schema) {
    const row = document.createElement('div');
    row.className = 'args-row';

    const label = document.createElement('label');
    label.textContent = schema.title || name;
    row.appendChild(label);

    if (schema.type === 'boolean') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.argName = name;
      input.dataset.argType = 'bool';
      if (schema.default) input.checked = true;
      row.appendChild(input);
    } else if (schema.type === 'integer') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.dataset.argName = name;
      input.dataset.argType = 'int';
      if (schema.default !== undefined) input.value = schema.default;
      row.appendChild(input);
    } else if (schema.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.dataset.argName = name;
      input.dataset.argType = 'float';
      if (schema.default !== undefined) input.value = schema.default;
      row.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.argName = name;
      input.dataset.argType = 'str';
      if (schema.default !== undefined) input.value = schema.default;
      row.appendChild(input);
    }

    container.appendChild(row);
  },

  collectFormData() {
    if (!this.currentMeme) return null;
    const info = this.currentMeme;
    const fd = new FormData();

    // Images
    const slots = this.elements.imageArea.querySelectorAll('.image-slot');
    for (const slot of slots) {
      const input = slot.querySelector('input[type="file"]');
      if (input && input.files[0]) {
        fd.append('images', input.files[0]);
      }
    }

    // Texts
    const textInputs = this.elements.textInputs.querySelectorAll('input');
    const texts = [];
    for (const input of textInputs) {
      if (input.value.trim()) texts.push(input.value.trim());
    }
    if (texts.length > 0) {
      fd.append('texts', texts);
    }

    // Args
    const argsRows = this.elements.argsInputs.querySelectorAll('.args-row [data-arg-name]');
    const args = {};
    for (const el of argsRows) {
      const name = el.dataset.argName;
      const type = el.dataset.argType;
      if (type === 'bool') {
        args[name] = el.checked;
      } else if (type === 'int') {
        args[name] = parseInt(el.value) || 0;
      } else if (type === 'float') {
        args[name] = parseFloat(el.value) || 0;
      } else {
        args[name] = el.value;
      }
    }
    if (Object.keys(args).length > 0) {
      fd.append('args', JSON.stringify(args));
    }

    return fd;
  },

  async preview() {
    if (!this.currentMeme) return;
    this.elements.btnPreview.disabled = true;
    try {
      const url = API.getPreviewUrl(this.currentMeme.key);
      this.elements.resultImage.src = url;
      this.elements.resultArea.style.display = 'block';
    } catch (e) {
      Utils.toast('预览失败: ' + e.message, 'error');
    } finally {
      this.elements.btnPreview.disabled = false;
    }
  },

  async generate() {
    if (!this.currentMeme) return;
    const info = this.currentMeme;

    // Validate minimum images
    const slots = this.elements.imageArea.querySelectorAll('.image-slot');
    let imageCount = 0;
    for (const slot of slots) {
      if (slot.querySelector('input').files[0]) imageCount++;
    }
    if (imageCount < info.params_type.min_images) {
      Utils.toast(`至少需要 ${info.params_type.min_images} 张图片`, 'error');
      return;
    }

    const fd = this.collectFormData();
    if (!fd) return;

    this.elements.btnGenerate.disabled = true;
    Utils.toast('正在生成...', 'info', 2000);

    try {
      const blob = await API.generate(info.key, fd);
      this.currentBlob = blob;
      const url = URL.createObjectURL(blob);
      this.elements.resultImage.src = url;
      this.elements.resultArea.style.display = 'block';
      this.elements.btnDownload.disabled = false;
      Utils.toast('生成成功！', 'success', 2000);
    } catch (e) {
      Utils.toast('生成失败: ' + e.message, 'error');
    } finally {
      this.elements.btnGenerate.disabled = false;
    }
  },

  download() {
    if (!this.currentBlob || !this.currentMeme) return;
    const ext = this.currentBlob.type.includes('gif') ? 'gif' : 'png';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(this.currentBlob);
    a.download = `${this.currentMeme.key}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  close() {
    this.elements.section.style.display = 'none';
    this.currentMeme = null;
    this.currentBlob = null;
    Browser.state.selectedKey = null;
    Browser.elements.grid.querySelectorAll('.meme-card').forEach((c) => c.classList.remove('active'));
  },
};
