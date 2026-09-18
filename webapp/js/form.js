const Form = {
  currentMeme: null,
  currentBlob: null,
  currentResultUrl: null,
  resultController: null,
  loadRequestId: 0,
  resultRequestId: 0,
  editorVersion: 0,

  elements: {
    section: null,
    emptyState: null,
    title: null,
    close: null,
    imageGroup: null,
    imageCount: null,
    imageArea: null,
    textGroup: null,
    textCount: null,
    textInputs: null,
    argsGroup: null,
    argsInputs: null,
    btnPreview: null,
    btnGenerate: null,
    btnDownload: null,
    resultArea: null,
    resultImage: null,
    generationStatus: null,
  },

  init() {
    this.elements.section = document.getElementById('meme-form-section');
    this.elements.emptyState = document.getElementById('editor-empty-state');
    this.elements.title = document.getElementById('form-title');
    this.elements.close = document.getElementById('form-close');
    this.elements.imageGroup = document.getElementById('image-group');
    this.elements.imageCount = document.getElementById('image-count');
    this.elements.imageArea = document.getElementById('image-upload-area');
    this.elements.textGroup = document.getElementById('text-group');
    this.elements.textCount = document.getElementById('text-count');
    this.elements.textInputs = document.getElementById('text-inputs');
    this.elements.argsGroup = document.getElementById('args-group');
    this.elements.argsInputs = document.getElementById('args-inputs');
    this.elements.btnPreview = document.getElementById('btn-preview');
    this.elements.btnGenerate = document.getElementById('btn-generate');
    this.elements.btnDownload = document.getElementById('btn-download');
    this.elements.resultArea = document.getElementById('result-area');
    this.elements.resultImage = document.getElementById('result-image');
    this.elements.generationStatus = document.getElementById('generation-status');

    this.elements.close.addEventListener('click', () => this.close());
    this.elements.btnPreview.addEventListener('click', () => this.preview());
    this.elements.btnGenerate.addEventListener('click', () => this.generate());
    this.elements.btnDownload.addEventListener('click', () => this.download());
  },

  async loadMeme(key) {
    const requestId = ++this.loadRequestId;
    this.resetEditor();
    try {
      const info = await API.getMemeInfo(key);
      if (requestId !== this.loadRequestId) return;
      this.currentMeme = info;
      this.render(info);
      this.elements.section.classList.remove('is-empty');
      const firstInput = this.elements.section.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
      if (window.matchMedia('(max-width: 768px)').matches) {
        this.elements.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (e) {
      if (requestId !== this.loadRequestId) return;
      Utils.toast('加载表情信息失败: ' + e.message, 'error');
    }
  },

  resetEditor() {
    this.editorVersion++;
    this.resultRequestId++;
    this.currentMeme = null;
    if (this.resultController) {
      this.resultController.abort();
      this.resultController = null;
    }
    this.revokeImagePreviews();
    this.clearResult();

    this.elements.imageArea.innerHTML = '';
    this.elements.textInputs.innerHTML = '';
    this.elements.argsInputs.innerHTML = '';
    this.elements.imageGroup.style.display = 'none';
    this.elements.textGroup.style.display = 'none';
    this.elements.argsGroup.style.display = 'none';
    this.elements.resultArea.style.display = 'none';
    this.elements.btnPreview.disabled = false;
    this.elements.btnGenerate.disabled = false;
    this.elements.btnDownload.disabled = true;
    this.setGenerationStatus('');
    this.elements.section.classList.add('is-empty');
  },

  clearResult() {
    this.currentBlob = null;
    if (this.currentResultUrl) {
      URL.revokeObjectURL(this.currentResultUrl);
      this.currentResultUrl = null;
    }
    this.elements.resultImage.removeAttribute('src');
    this.elements.resultArea.style.display = 'none';
    this.elements.btnDownload.disabled = true;
  },

  revokeImagePreviews() {
    this.elements.imageArea.querySelectorAll('.image-slot').forEach((slot) => {
      if (slot.dataset.previewUrl) {
        URL.revokeObjectURL(slot.dataset.previewUrl);
        delete slot.dataset.previewUrl;
      }
    });
  },

  setGenerationStatus(message) {
    if (this.elements.generationStatus) {
      this.elements.generationStatus.textContent = message;
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
      this.elements.imageArea.innerHTML = '';
    }

    // Texts
    const { min_texts, max_texts, default_texts } = info.params_type;
    if (max_texts > 0) {
      this.elements.textGroup.style.display = 'block';
      this.elements.textCount.textContent = min_texts === max_texts
        ? `需要 ${min_texts} 段`
        : `需要 ${min_texts} ~ ${max_texts} 段`;
      this.renderTextInputs(max_texts, default_texts);
    } else {
      this.elements.textGroup.style.display = 'none';
      this.elements.textInputs.innerHTML = '';
    }

    // Args
    if (info.params_type.args_type) {
      this.elements.argsGroup.style.display = 'block';
      this.renderArgsInputs(info.params_type.args_type);
    } else {
      this.elements.argsGroup.style.display = 'none';
      this.elements.argsInputs.innerHTML = '';
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
    if (!file.type.startsWith('image/')) {
      Utils.toast('请选择图片文件', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      Utils.toast('图片不能超过 20 MB', 'error');
      e.target.value = '';
      return;
    }

    const editorVersion = this.editorVersion;
    const readRequestId = String((Number(slot.dataset.readRequestId) || 0) + 1);
    slot.dataset.readRequestId = readRequestId;
    if (
      editorVersion !== this.editorVersion
      || slot.dataset.readRequestId !== readRequestId
    ) return;
    if (slot.dataset.previewUrl) URL.revokeObjectURL(slot.dataset.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    slot.dataset.previewUrl = previewUrl;
    slot.classList.add('has-image');
    slot.innerHTML = '';
    const image = document.createElement('img');
    image.src = previewUrl;
    image.alt = '已选择的图片预览';
    const removeButton = document.createElement('button');
    removeButton.className = 'image-slot-remove';
    removeButton.type = 'button';
    removeButton.title = '移除图片';
    removeButton.setAttribute('aria-label', '移除图片');
    removeButton.innerHTML = '&times;';
    const replacementInput = document.createElement('input');
    replacementInput.type = 'file';
    replacementInput.accept = 'image/*';
    slot.appendChild(image);
    slot.appendChild(removeButton);
    slot.appendChild(replacementInput);
    replacementInput.files = e.target.files;
    replacementInput.addEventListener('change', (ev2) => this.onImageSelected(ev2, slot));
    removeButton.addEventListener('click', (ev3) => {
      ev3.stopPropagation();
      this.clearSlot(slot);
    });
  },

  clearSlot(slot) {
    slot.dataset.readRequestId = String((Number(slot.dataset.readRequestId) || 0) + 1);
    slot.classList.remove('has-image');
    if (slot.dataset.previewUrl) {
      URL.revokeObjectURL(slot.dataset.previewUrl);
      delete slot.dataset.previewUrl;
    }
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
      const input = document.createElement('textarea');
      input.placeholder = `文字 ${i + 1}`;
      input.dataset.textIndex = i;
      input.rows = defaults && defaults[i] && defaults[i].includes('\n') ? 3 : 1;
      if (defaults && defaults[i]) input.value = defaults[i];
      row.appendChild(input);
      container.appendChild(row);
    }
  },

  renderArgsInputs(argsType) {
    const container = this.elements.argsInputs;
    container.innerHTML = '';

    const properties = argsType.args_model && argsType.args_model.properties;
    const fields = properties
      ? Object.entries(properties).filter(([name]) => name !== 'user_infos')
      : [];

    if (fields.length > 0) {
      const enumLabels = {};
      for (const opt of argsType.parser_options || []) {
        if (!opt.action || typeof opt.action.value !== 'string') continue;
        const alias = opt.names.find((name) => !name.startsWith('-'));
        enumLabels[opt.action.value] = alias || opt.help_text || opt.action.value;
      }
      for (const [name, schema] of fields) {
        this.renderSchemaField(container, name, schema, enumLabels);
      }
      return;
    }

    // Compatibility fallback for extensions without a JSON schema.
    for (const opt of argsType.parser_options || []) {
      this.renderParserOption(container, opt);
    }
  },

  renderParserOption(container, opt) {
    const arg = opt.args && opt.args[0];
    const argName = opt.dest
      || (arg && arg.name)
      || (opt.names.find((name) => name.startsWith('--')) || opt.names[0]).replace(/^-+/, '');
    const row = document.createElement('div');
    row.className = 'args-row';

    const label = document.createElement('label');
    label.textContent = opt.help_text || opt.names.join('/');
    row.appendChild(label);

    if (opt.action && opt.action.value === true) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.argName = argName;
      input.dataset.argType = 'bool';
      if (opt.default === true) input.checked = true;
      row.appendChild(input);
    } else if (arg && arg.value === 'float') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.dataset.argName = argName;
      input.dataset.argType = 'float';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    } else if (arg && arg.value === 'int') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '1';
      input.dataset.argName = argName;
      input.dataset.argType = 'int';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.argName = argName;
      input.dataset.argType = 'str';
      if (opt.default !== undefined && opt.default !== null) input.value = opt.default;
      row.appendChild(input);
    }

    container.appendChild(row);
  },

  renderSchemaField(container, name, schema, enumLabels = {}) {
    const row = document.createElement('div');
    row.className = 'args-row';

    const label = document.createElement('label');
    label.textContent = schema.description || schema.title || name;
    row.appendChild(label);

    if (Array.isArray(schema.enum)) {
      const select = document.createElement('select');
      select.dataset.argName = name;
      select.dataset.argType = 'str';
      for (const value of schema.enum) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = enumLabels[value] || value;
        option.selected = value === schema.default;
        select.appendChild(option);
      }
      row.appendChild(select);
    } else if (schema.type === 'boolean') {
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
      if (schema.minimum !== undefined) input.min = schema.minimum;
      if (schema.maximum !== undefined) input.max = schema.maximum;
      input.dataset.argName = name;
      input.dataset.argType = 'int';
      if (schema.default !== undefined) input.value = schema.default;
      row.appendChild(input);
    } else if (schema.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      if (schema.minimum !== undefined) input.min = schema.minimum;
      if (schema.maximum !== undefined) input.max = schema.maximum;
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
    const textInputs = this.elements.textInputs.querySelectorAll('[data-text-index]');
    const texts = [];
    for (const input of textInputs) {
      if (input.value.trim()) texts.push(input.value.trim());
    }
    for (const text of texts) {
      fd.append('texts', text);
    }
    if (textInputs.length > 0 && texts.length === 0) {
      fd.append('texts', '');
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
        if (el.value === '') continue;
        if (!el.checkValidity()) throw new Error(`${name} 参数无效`);
        args[name] = Number.parseInt(el.value, 10);
      } else if (type === 'float') {
        if (el.value === '') continue;
        if (!el.checkValidity()) throw new Error(`${name} 参数无效`);
        args[name] = Number.parseFloat(el.value);
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
    const info = this.currentMeme;
    const requestId = ++this.resultRequestId;
    this.clearResult();
    this.elements.btnPreview.disabled = true;
    this.elements.btnGenerate.disabled = true;
    this.setGenerationStatus('正在加载预览…');
    try {
      const blob = await API.getPreview(info.key);
      if (requestId !== this.resultRequestId || this.currentMeme !== info) return;
      this.currentResultUrl = URL.createObjectURL(blob);
      this.elements.resultImage.src = this.currentResultUrl;
      this.elements.resultArea.style.display = 'block';
      this.setGenerationStatus('预览已更新');
    } catch (e) {
      if (requestId !== this.resultRequestId || this.currentMeme !== info) return;
      Utils.toast('预览失败: ' + e.message, 'error');
      this.setGenerationStatus('预览失败');
    } finally {
      if (requestId === this.resultRequestId) {
        this.elements.btnPreview.disabled = false;
        this.elements.btnGenerate.disabled = false;
      }
    }
  },

  async generate() {
    if (!this.currentMeme) return;
    const info = this.currentMeme;

    // Validate minimum images
    const slots = this.elements.imageArea.querySelectorAll('.image-slot');
    const imagePresence = Array.from(
      slots,
      (slot) => Boolean(slot.querySelector('input').files[0])
    );
    const imageCount = imagePresence.filter(Boolean).length;
    let foundImageGap = false;
    for (const present of imagePresence) {
      if (!present) foundImageGap = true;
      if (present && foundImageGap) {
        Utils.toast('请从第 1 个图片槽位开始连续上传', 'error');
        return;
      }
    }
    if (imageCount < info.params_type.min_images) {
      Utils.toast(`至少需要 ${info.params_type.min_images} 张图片`, 'error');
      return;
    }

    const textValues = Array.from(
      this.elements.textInputs.querySelectorAll('[data-text-index]'),
      (input) => input.value.trim()
    );
    const lastTextIndex = textValues.findLastIndex((text) => text !== '');
    if (lastTextIndex >= 0 && textValues.slice(0, lastTextIndex).some((text) => text === '')) {
      Utils.toast('文字必须从第 1 个输入框开始连续填写', 'error');
      return;
    }
    const textCount = textValues.filter(Boolean).length;
    if (textCount < info.params_type.min_texts) {
      Utils.toast(`至少需要 ${info.params_type.min_texts} 段文字`, 'error');
      return;
    }
    if (info.key === 'always_like' && textCount < imageCount) {
      Utils.toast('每张图片都需要对应的一段文字', 'error');
      return;
    }

    let fd;
    try {
      fd = this.collectFormData();
    } catch (e) {
      Utils.toast(e.message, 'error');
      return;
    }
    if (!fd) return;

    const requestId = ++this.resultRequestId;
    this.clearResult();
    this.elements.btnGenerate.disabled = true;
    this.elements.btnPreview.disabled = true;
    this.resultController = new AbortController();
    this.setGenerationStatus('正在生成，请稍候…');
    this.elements.btnGenerate.setAttribute('aria-busy', 'true');
    Utils.toast('正在生成...', 'info', 2000);

    try {
      const blob = await API.generate(info.key, fd, this.resultController.signal);
      if (requestId !== this.resultRequestId || this.currentMeme !== info) return;
      this.currentBlob = blob;
      if (this.currentResultUrl) URL.revokeObjectURL(this.currentResultUrl);
      this.currentResultUrl = URL.createObjectURL(blob);
      this.elements.resultImage.src = this.currentResultUrl;
      this.elements.resultArea.style.display = 'block';
      this.elements.btnDownload.disabled = false;
      Utils.toast('生成成功！', 'success', 2000);
      this.setGenerationStatus('生成成功');
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (requestId !== this.resultRequestId || this.currentMeme !== info) return;
      Utils.toast('生成失败: ' + e.message, 'error');
      this.setGenerationStatus('生成失败');
    } finally {
      if (requestId === this.resultRequestId) {
        this.elements.btnGenerate.disabled = false;
        this.elements.btnPreview.disabled = false;
        this.elements.btnGenerate.setAttribute('aria-busy', 'false');
      }
      this.resultController = null;
    }
  },

  download() {
    if (!this.currentBlob || !this.currentMeme) return;
    const mimeExtensions = {
      'image/gif': 'gif',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = mimeExtensions[this.currentBlob.type] || 'png';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(this.currentBlob);
    a.download = `${this.currentMeme.key}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  close() {
    this.loadRequestId++;
    this.resetEditor();
    Browser.state.selectedKey = null;
    Browser.elements.grid.querySelectorAll('.meme-card').forEach((c) => c.classList.remove('active'));
  },
};
