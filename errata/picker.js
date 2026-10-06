(() => {
  if (window.__tcLoaded) return;
  window.__tcLoaded = true;

  const Z = 2147483647;
  const PAD = 160; // px of page context around the element in the cropped screenshot

  let picking = false;
  let editorOpen = false;
  let currentEl = null;
  let host, shadow, highlight, label, toast;

  // ---------- UI scaffold ----------

  function ensureUI() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'tc-root';
    host.style.cssText = `all: initial; position: fixed; z-index: ${Z}; width: 0; height: 0;`;
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Arial, sans-serif; }
      .hl {
        position: fixed; pointer-events: none; z-index: ${Z};
        border: 2px solid #e11d48; background: rgba(225, 29, 72, 0.08);
        border-radius: 3px; display: none;
      }
      .lbl {
        position: fixed; pointer-events: none; z-index: ${Z};
        background: #e11d48; color: #fff; font-size: 11px; line-height: 1;
        padding: 4px 6px; border-radius: 3px; display: none; max-width: 320px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .panel {
        position: fixed; z-index: ${Z}; width: 380px; max-width: 90vw;
        background: #fff; color: #1f2937; border-radius: 10px;
        box-shadow: 0 10px 40px rgba(0,0,0,.35); padding: 14px;
        font-size: 13px; display: none; pointer-events: auto;
      }
      .panel h3 { margin: 0 0 8px; font-size: 13px; color: #6b7280; font-weight: 600; }
      .panel .orig {
        max-height: 110px; overflow: auto; background: #f3f4f6;
        border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px;
        white-space: pre-wrap; word-break: break-word; margin-bottom: 8px;
      }
      .panel textarea, .panel input {
        width: 100%; border: 1px solid #d1d5db; border-radius: 6px;
        padding: 7px 8px; font-size: 13px; font-family: inherit;
        margin-bottom: 8px; resize: vertical; color: #1f2937; background: #fff;
      }
      .panel textarea { min-height: 70px; }
      .panel textarea:focus, .panel input:focus { outline: 2px solid #e11d48; border-color: #e11d48; }
      .row { display: flex; gap: 8px; justify-content: flex-end; }
      button {
        border: none; border-radius: 6px; padding: 7px 14px;
        font-size: 13px; cursor: pointer; font-family: inherit;
      }
      .save { background: #e11d48; color: #fff; font-weight: 600; }
      .cancel { background: #e5e7eb; color: #374151; }
      .hint { color: #9ca3af; font-size: 11px; margin-top: 6px; }
      .toast {
        position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
        z-index: ${Z}; background: #111827; color: #fff; font-size: 13px;
        padding: 8px 16px; border-radius: 20px; display: none; pointer-events: none;
      }
    `;
    shadow.appendChild(style);

    highlight = document.createElement('div');
    highlight.className = 'hl';
    label = document.createElement('div');
    label.className = 'lbl';
    toast = document.createElement('div');
    toast.className = 'toast';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <h3>Original text</h3>
      <div class="orig"></div>
      <h3>Proposed correction</h3>
      <textarea class="new"></textarea>
      <input class="note" placeholder="Note (optional)">
      <div class="row">
        <button class="cancel">Cancel</button>
        <button class="save">Save proposal</button>
      </div>
      <div class="hint">Esc — cancel &middot; Ctrl+Enter — save</div>
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.querySelector('.cancel').addEventListener('click', closeEditor);
    panel.querySelector('.save').addEventListener('click', saveEntry);
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeEditor(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEntry();
    });

    shadow.append(highlight, label, toast, panel);
    document.documentElement.appendChild(host);
  }

  // ---------- helpers ----------

  function textOf(el) {
    if (!el) return '';
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return el.value || el.placeholder || '';
    if (tag === 'IMG') return el.alt || '';
    const t = (el.innerText || '').trim();
    return t || el.getAttribute('aria-label') || el.title || (el.textContent || '').trim();
  }

  function selectorOf(el) {
    const parts = [];
    while (el && el !== document.documentElement && parts.length < 6) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let p = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(p);
      el = parent;
    }
    return parts.join(' > ');
  }

  function targetFromPoint(x, y) {
    // Prefer the exact text node under the cursor for a tight target element.
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
        const p = range.startContainer.parentElement;
        if (p && p !== host && !host.contains(p)) return p;
      }
    }
    return document.elementFromPoint(x, y);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.style.display = 'none'), 1800);
  }

  function moveHighlight(el) {
    const r = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = r.left + 'px';
    highlight.style.top = r.top + 'px';
    highlight.style.width = r.width + 'px';
    highlight.style.height = r.height + 'px';
    label.style.display = 'block';
    label.textContent = el.tagName.toLowerCase();
    const ly = r.top - 22 < 0 ? r.bottom + 4 : r.top - 22;
    label.style.left = Math.max(0, r.left) + 'px';
    label.style.top = ly + 'px';
  }

  // ---------- pick mode ----------

  function onMove(e) {
    if (editorOpen) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || host.contains(el)) return;
    moveHighlight(el);
  }

  function suppress(e) {
    if (editorOpen) return; // let events reach the editor panel
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onClick(e) {
    if (editorOpen) return;
    suppress(e);
    const el = targetFromPoint(e.clientX, e.clientY);
    if (!el || el === host || host.contains(el)) return;
    openEditor(el);
  }

  function onKey(e) {
    if (e.key === 'Escape' && picking && !editorOpen) stopPicking();
  }

  function startPicking() {
    ensureUI();
    if (picking) return;
    picking = true;
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('mousedown', suppress, true);
    window.addEventListener('mouseup', suppress, true);
    window.addEventListener('dblclick', suppress, true);
    window.addEventListener('keydown', onKey, true);
    showToast('Click a text to propose a correction. Esc to stop.');
  }

  function stopPicking() {
    picking = false;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('mousedown', suppress, true);
    window.removeEventListener('mouseup', suppress, true);
    window.removeEventListener('dblclick', suppress, true);
    window.removeEventListener('keydown', onKey, true);
    if (highlight) highlight.style.display = 'none';
    if (label) label.style.display = 'none';
    closeEditor();
  }

  // ---------- editor ----------

  function openEditor(el) {
    currentEl = el;
    editorOpen = true;
    const panel = shadow.querySelector('.panel');
    const orig = textOf(el);
    shadow.querySelector('.orig').textContent = orig || '(no text — describe the target in the note)';
    const ta = shadow.querySelector('.new');
    ta.value = orig;
    shadow.querySelector('.note').value = '';

    const r = el.getBoundingClientRect();
    panel.style.display = 'block';
    let top = r.bottom + 8;
    if (top + panel.offsetHeight > window.innerHeight) {
      top = Math.max(8, r.top - panel.offsetHeight - 8);
    }
    panel.style.top = top + 'px';
    panel.style.left = Math.min(Math.max(8, r.left), window.innerWidth - 396) + 'px';
    ta.focus();
    ta.select();
  }

  function closeEditor() {
    editorOpen = false;
    currentEl = null;
    if (shadow) shadow.querySelector('.panel').style.display = 'none';
  }

  async function cropScreenshot(dataUrl, rect) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const dpr = img.width / window.innerWidth;
    const x = Math.max(0, (rect.left - PAD) * dpr);
    const y = Math.max(0, (rect.top - PAD) * dpr);
    const w = Math.min(img.width - x, (rect.width + PAD * 2) * dpr);
    const h = Math.min(img.height - y, (rect.height + PAD * 2) * dpr);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);

    // Subtle red marker around the element in question.
    const m = 5 * dpr;
    const mx = rect.left * dpr - x - m;
    const my = rect.top * dpr - y - m;
    const mw = rect.width * dpr + m * 2;
    const mh = rect.height * dpr + m * 2;
    ctx.fillStyle = 'rgba(225, 29, 72, 0.06)';
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.85)';
    ctx.lineWidth = Math.max(2, 2 * dpr);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mw, mh, 4 * dpr);
    else ctx.rect(mx, my, mw, mh);
    ctx.fill();
    ctx.stroke();

    return c.toDataURL('image/png');
  }

  async function saveEntry() {
    if (!currentEl) return;
    const el = currentEl;
    const rect = el.getBoundingClientRect();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      url: location.href,
      title: document.title,
      lang: document.documentElement.lang || '',
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      oldText: textOf(el),
      newText: shadow.querySelector('.new').value,
      note: shadow.querySelector('.note').value.trim(),
      createdAt: new Date().toISOString(),
      screenshot: '',
    };

    const saveBtn = shadow.querySelector('.save');
    saveBtn.disabled = true;
    try {
      // Hide our own UI so it doesn't appear in the screenshot.
      host.style.display = 'none';
      await new Promise((r) => setTimeout(r, 80));
      const cap = await chrome.runtime.sendMessage({ type: 'tc-capture' });
      let pageScreenshot = '';
      if (cap && cap.ok) {
        entry.screenshot = await cropScreenshot(cap.dataUrl, rect);
        pageScreenshot = cap.dataUrl; // uncropped viewport shot → page context
      }
      const res = await chrome.runtime.sendMessage({
        type: 'tc-save',
        entry,
        pageScreenshot,
      });
      showToast(res && res.ok ? `Saved (${res.count} total)` : 'Save failed');
    } catch (err) {
      showToast('Error: ' + err);
    } finally {
      host.style.display = '';
      saveBtn.disabled = false;
    }
    closeEditor();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'tc-start') { startPicking(); sendResponse({ ok: true }); }
    if (msg.type === 'tc-stop') { stopPicking(); sendResponse({ ok: true }); }
  });
})();
