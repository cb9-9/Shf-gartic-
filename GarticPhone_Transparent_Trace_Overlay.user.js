from pathlib import Path

script = r"""// ==UserScript==
// @name         Gartic Phone - Transparent Tracing Overlay
// @namespace    gartic-tracing-overlay
// @version      1.0.0
// @description  Local transparent image overlay for tracing in Gartic Phone. No network, cookies, storage, or external resources.
// @match        https://garticphone.com/*
// @match        https://*.garticphone.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const ROOT_ID = 'GP_TRACING_OVERLAY_V1';
  const STYLE_ID = 'GP_TRACING_OVERLAY_STYLE_V1';

  if (document.getElementById(ROOT_ID)) return;

  const state = {
    imageUrl: null,
    opacity: 0.35,
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    locked: true,
    imgW: 0,
    imgH: 0,
    canvas: null,
  };

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      pointer-events: none;
      display: none;
      overflow: hidden;
    }

    #${ROOT_ID} .gp-trace-image {
      position: absolute;
      left: 50%;
      top: 50%;
      max-width: none;
      max-height: none;
      transform-origin: center center;
      user-select: none;
      -webkit-user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
      touch-action: none;
    }

    #${ROOT_ID}.editing .gp-trace-image {
      pointer-events: auto;
      cursor: move;
    }

    #${ROOT_ID} .gp-trace-panel {
      position: fixed;
      right: 12px;
      top: 12px;
      width: min(290px, calc(100vw - 24px));
      padding: 10px;
      border-radius: 16px;
      background: rgba(18,18,22,.90);
      color: #fff;
      font: 14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      box-shadow: 0 8px 30px rgba(0,0,0,.35);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      pointer-events: auto;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }

    #${ROOT_ID} .gp-trace-title {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      font-weight:700;
      margin-bottom:8px;
    }

    #${ROOT_ID} .gp-trace-row {
      display:flex;
      gap:6px;
      align-items:center;
      margin:7px 0;
    }

    #${ROOT_ID} button {
      appearance:none;
      border:0;
      border-radius:10px;
      padding:8px 10px;
      background:#303039;
      color:#fff;
      font:inherit;
      cursor:pointer;
    }

    #${ROOT_ID} button:active {
      transform:scale(.97);
    }

    #${ROOT_ID} .primary {
      background:#4b4be8;
    }

    #${ROOT_ID} .danger {
      background:#7b3030;
    }

    #${ROOT_ID} label {
      display:block;
      margin-top:7px;
    }

    #${ROOT_ID} input[type="range"] {
      width:100%;
      margin:3px 0 0;
      accent-color:#7777ff;
    }

    #${ROOT_ID} .value {
      min-width:48px;
      text-align:right;
      opacity:.85;
      font-size:12px;
    }

    #${ROOT_ID} .hint {
      opacity:.65;
      font-size:11px;
      margin-top:7px;
    }

    #${ROOT_ID} .gp-move-grid {
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:5px;
      width:150px;
      margin:7px auto;
    }

    #${ROOT_ID} .gp-move-grid button {
      padding:7px 4px;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;

  const img = document.createElement('img');
  img.className = 'gp-trace-image';
  img.alt = '';
  img.draggable = false;

  const panel = document.createElement('div');
  panel.className = 'gp-trace-panel';
  panel.innerHTML = `
    <div class="gp-trace-title">
      <span>🖼️ Trace Overlay</span>
      <button data-action="hide">×</button>
    </div>

    <div class="gp-trace-row">
      <button class="primary" data-action="choose">اختيار صورة</button>
      <button data-action="lock">🔒 مقفول</button>
    </div>

    <label>
      الشفافية
      <span class="value" data-value="opacity">35%</span>
      <input data-control="opacity" type="range" min="5" max="100" value="35">
    </label>

    <label>
      التكبير
      <span class="value" data-value="scale">100%</span>
      <input data-control="scale" type="range" min="10" max="300" value="100">
    </label>

    <label>
      تدوير
      <span class="value" data-value="rotation">0°</span>
      <input data-control="rotation" type="range" min="-180" max="180" value="0">
    </label>

    <div class="gp-move-grid">
      <span></span><button data-move="up">↑</button><span></span>
      <button data-move="left">←</button><button data-action="reset">●</button><button data-move="right">→</button>
      <span></span><button data-move="down">↓</button><span></span>
    </div>

    <div class="gp-trace-row">
      <button data-action="minus">−</button>
      <button data-action="plus">+</button>
      <button class="danger" data-action="remove">حذف الصورة</button>
    </div>

    <div class="hint">
      🔒 مقفول = تقدر ترسم فوق الصورة مباشرة.<br>
      🔓 تعديل = اسحب الصورة بإصبعك، ثم اقفلها للرسم.
    </div>
  `;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  root.append(img, panel, fileInput);
  document.body.appendChild(root);

  function findCanvas() {
    const canvases = [...document.querySelectorAll('canvas')];
    if (!canvases.length) return null;

    const candidates = canvases
      .map(c => {
        const r = c.getBoundingClientRect();
        return { c, r, area: r.width * r.height };
      })
      .filter(x => x.r.width > 200 && x.r.height > 100);

    candidates.sort((a, b) => b.area - a.area);
    return candidates[0]?.c || null;
  }

  function getCanvasRect() {
    state.canvas = findCanvas();
    if (state.canvas) {
      const r = state.canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r;
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  function applyTransform() {
    if (!state.imgW || !state.imgH) return;

    const r = getCanvasRect();
    const cx = r.left + r.width / 2 + state.x;
    const cy = r.top + r.height / 2 + state.y;

    const fit = Math.min(r.width / state.imgW, r.height / state.imgH);
    const width = Math.max(1, state.imgW * fit * state.scale);
    const height = Math.max(1, state.imgH * fit * state.scale);

    img.style.left = `${cx}px`;
    img.style.top = `${cy}px`;
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    img.style.opacity = String(state.opacity);
    img.style.transform = `translate(-50%, -50%) rotate(${state.rotation}deg)`;
  }

  function setEditing(editing) {
    state.locked = !editing;
    root.classList.toggle('editing', editing);
    const btn = panel.querySelector('[data-action="lock"]');
    btn.textContent = editing ? '🔓 تعديل' : '🔒 مقفول';
  }

  function show() {
    root.style.display = 'block';
  }

  function hide() {
    root.style.display = 'none';
    setEditing(false);
  }

  function removeImage() {
    if (state.imageUrl) {
      URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = null;
    }
    img.removeAttribute('src');
    state.imgW = state.imgH = 0;
    hide();
  }

  function reset() {
    state.opacity = 0.35;
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    state.rotation = 0;

    panel.querySelector('[data-control="opacity"]').value = 35;
    panel.querySelector('[data-control="scale"]').value = 100;
    panel.querySelector('[data-control="rotation"]').value = 0;

    updateLabels();
    applyTransform();
  }

  function updateLabels() {
    panel.querySelector('[data-value="opacity"]').textContent =
      `${Math.round(state.opacity * 100)}%`;
    panel.querySelector('[data-value="scale"]').textContent =
      `${Math.round(state.scale * 100)}%`;
    panel.querySelector('[data-value="rotation"]').textContent =
      `${Math.round(state.rotation)}°`;
  }

  function openFilePicker() {
    fileInput.value = '';
    fileInput.click();
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);

    state.imageUrl = URL.createObjectURL(file);
    img.onload = () => {
      state.imgW = img.naturalWidth || 1;
      state.imgH = img.naturalHeight || 1;
      reset();
      show();
      setEditing(false);
      applyTransform();
    };
    img.src = state.imageUrl;
  });

  panel.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'choose') openFilePicker();
    if (action === 'hide') hide();
    if (action === 'remove') removeImage();
    if (action === 'reset') reset();
    if (action === 'lock') setEditing(root.classList.contains('editing') ? false : true);

    if (action === 'minus') {
      state.scale = Math.max(0.1, state.scale - 0.1);
      panel.querySelector('[data-control="scale"]').value = Math.round(state.scale * 100);
      updateLabels();
      applyTransform();
    }

    if (action === 'plus') {
      state.scale = Math.min(3, state.scale + 0.1);
      panel.querySelector('[data-control="scale"]').value = Math.round(state.scale * 100);
      updateLabels();
      applyTransform();
    }
  });

  panel.addEventListener('input', e => {
    const control = e.target.dataset.control;
    if (!control) return;

    if (control === 'opacity') state.opacity = Number(e.target.value) / 100;
    if (control === 'scale') state.scale = Number(e.target.value) / 100;
    if (control === 'rotation') state.rotation = Number(e.target.value);

    updateLabels();
    applyTransform();
  });

  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;

    const amount = e.shiftKey ? 20 : 5;
    if (btn.dataset.move === 'up') state.y -= amount;
    if (btn.dataset.move === 'down') state.y += amount;
    if (btn.dataset.move === 'left') state.x -= amount;
    if (btn.dataset.move === 'right') state.x += amount;
    applyTransform();
  });

  let drag = null;

  img.addEventListener('pointerdown', e => {
    if (state.locked) return;
    e.preventDefault();
    img.setPointerCapture?.(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, sx: state.x, sy: state.y };
  });

  img.addEventListener('pointermove', e => {
    if (!drag || state.locked) return;
    state.x = drag.sx + (e.clientX - drag.x);
    state.y = drag.sy + (e.clientY - drag.y);
    applyTransform();
  });

  img.addEventListener('pointerup', () => { drag = null; });
  img.addEventListener('pointercancel', () => { drag = null; });

  document.addEventListener('keydown', e => {
    if (e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      if (root.style.display === 'none') show();
      else hide();
    }
  }, true);

  let resizeTimer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.imageUrl) applyTransform();
    }, 50);
  });

  function observeCanvas() {
    const c = findCanvas();
    if (c) {
      state.canvas = c;
      try { ro.observe(c); } catch (_) {}
      applyTransform();
    }
  }

  window.addEventListener('resize', applyTransform, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(applyTransform, 250), { passive: true });

  const launcher = document.createElement('button');
  launcher.textContent = '🖼️';
  launcher.title = 'فتح Transparent Trace Overlay';
  Object.assign(launcher.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    zIndex: '2147482999',
    width: '46px',
    height: '46px',
    border: '0',
    borderRadius: '50%',
    background: 'rgba(18,18,22,.90)',
    color: '#fff',
    fontSize: '21px',
    boxShadow: '0 6px 20px rgba(0,0,0,.3)',
    display: 'block',
    pointerEvents: 'auto',
  });
  launcher.addEventListener('click', () => {
    if (root.style.display === 'none') show();
    else hide();
  });
  document.body.appendChild(launcher);

  root.style.display = 'none';

  setTimeout(observeCanvas, 1000);
  setTimeout(observeCanvas, 3000);
  setTimeout(observeCanvas, 6000);
})();
"""

path = Path("/mnt/data/GarticPhone_Transparent_Trace_Overlay.user.js")
path.write_text(script, encoding="utf-8")
print(path)
