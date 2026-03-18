// editor.js — Effect Craft editor logic

// ── State ─────────────────────────────────────────────────────────────────

const state = {
  name: '新規エフェクト',
  image: null,          // filename for JSON export
  emitters: [
    {
      origin: { x: 0.5, y: 0.0 },
      target: { x: 0.5, y: 1.0 },
      emissionType: 'directional',
      direction: 'left-right',  // for slide type
      force: 8,
      spread: 40,
    },
  ],
  count: 15,
  emissionDuration: 0,
  emissionRate: 3,
  size: 1.0,
  hitboxMask: 0.5,
  rotate: true,
  initialAngularVelocity: 0.3,
  fadeOut: true,
  lifetime: 5,
  physics: {
    gravity: 1.0,
    resistance: 0.008,
    bounce: 0.5,
    friction: 0.4,
    collision: true,
    floorDetection: true,
    wallCollision: false,
  },
};

let imageUrl = null;        // blob URL of loaded image (editor preview only)
let clickMode = null;       // 'origin' | 'target' | null
let clickModeEmitterIdx = -1;
let previewTimer = null;
let jsonVisible = false;
let engine;

// ── Init ──────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  const particleCanvas = document.getElementById('particleCanvas');
  engine = new ParticleEngine(particleCanvas);

  resizeCanvases();
  window.addEventListener('resize', () => { resizeCanvases(); schedulePreview(); });

  bindHeader();
  bindEmissionControls();
  bindPhysicsControls();
  bindAppearanceControls();
  bindImageControls();
  bindCanvasClick();
  renderEmitterList();
  schedulePreview(0);
});

// ── Canvas Resize ─────────────────────────────────────────────────────────

function resizeCanvases() {
  const wrapper = document.getElementById('canvasWrapper');
  const w = wrapper.clientWidth;
  const h = wrapper.clientHeight;
  const pc = document.getElementById('particleCanvas');
  const mc = document.getElementById('markerCanvas');
  pc.width = w; pc.height = h;
  mc.width = w; mc.height = h;
  engine.resizeCanvas();
  drawMarkers();
  const info = document.getElementById('canvasInfo');
  if (info) info.textContent = `プレビュー ${w} × ${h}`;
}

// ── Preview Scheduling ────────────────────────────────────────────────────

function schedulePreview(delay = 300) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, delay);
}

function runPreview() {
  engine.clear();
  const config = buildConfig();
  const resolver = imageUrl ? () => imageUrl : null;
  engine.play(config, resolver);
  if (jsonVisible) updateJsonPreview();
}

function buildConfig() {
  return {
    name: state.name,
    image: state.image,
    emitters: state.emitters.map(e => ({
      origin: { ...e.origin },
      target: (e.emissionType === 'omnidirectional' || e.emissionType === 'slide') ? undefined : { ...e.target },
      emissionType: e.emissionType,
      ...(e.emissionType === 'slide' && { direction: e.direction }),
      force: e.force,
      spread: (e.emissionType === 'omnidirectional' || e.emissionType === 'slide') ? undefined : e.spread,
    })),
    count: state.count,
    emissionDuration: state.emissionDuration,
    emissionRate: state.emissionRate,
    size: state.size,
    hitboxMask: state.hitboxMask,
    rotate: state.rotate,
    initialAngularVelocity: state.initialAngularVelocity,
    fadeOut: state.fadeOut,
    lifetime: state.lifetime,
    physics: { ...state.physics },
  };
}

// ── Header ────────────────────────────────────────────────────────────────

function bindHeader() {
  document.getElementById('effectName').addEventListener('input', e => {
    state.name = e.target.value;
  });

  document.getElementById('btnPlay').addEventListener('click', () => schedulePreview(0));
  document.getElementById('btnClear').addEventListener('click', () => engine.clear());

  document.getElementById('btnExport').addEventListener('click', exportJson);

  document.getElementById('btnToggleJson').addEventListener('click', () => {
    jsonVisible = !jsonVisible;
    const pre = document.getElementById('jsonPreview');
    const btn = document.getElementById('btnToggleJson');
    if (jsonVisible) {
      pre.style.display = 'block';
      btn.textContent = '隠す';
      updateJsonPreview();
    } else {
      pre.style.display = 'none';
      btn.textContent = '表示';

    }
  });
}

function updateJsonPreview() {
  const config = buildConfig();
  // Strip undefined
  const clean = JSON.parse(JSON.stringify(config));
  document.getElementById('jsonPreview').textContent = JSON.stringify(clean, null, 2);
}

function exportJson() {
  const config = buildConfig();
  const clean = JSON.parse(JSON.stringify(config));
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.name || 'effect').replace(/[^a-zA-Z0-9_\-\u3040-\u9fff]/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Image Controls ────────────────────────────────────────────────────────

function bindImageControls() {
  const dropZone = document.getElementById('imageDropZone');
  const fileInput = document.getElementById('imageInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file);
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
  });

  document.getElementById('btnClearImage').addEventListener('click', () => {
    imageUrl = null;
    state.image = null;
    document.getElementById('imagePreviewRow').style.display = 'none';
    document.getElementById('imageDropZone').style.display = 'block';
    schedulePreview();
  });
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  imageUrl = url;
  state.image = file.name;

  const thumb = document.getElementById('imagePreview');
  thumb.src = url;
  document.getElementById('imageFilename').textContent = file.name;
  document.getElementById('imagePreviewRow').style.display = 'flex';
  document.getElementById('imageDropZone').style.display = 'none';

  schedulePreview();
}

// ── Emission Controls ─────────────────────────────────────────────────────

function bindEmissionControls() {
  bindNumPair('emissionDuration', 'emissionDurationRange', v => {
    state.emissionDuration = v;
    document.getElementById('rowRate').style.display = v > 0 ? 'flex' : 'none';
  });
  bindNumPair('emissionRate', 'emissionRateRange', v => { state.emissionRate = v; });

  document.getElementById('count').addEventListener('input', e => {
    state.count = parseInt(e.target.value) || 1;
    schedulePreview();
  });
}

// ── Physics Controls ──────────────────────────────────────────────────────

function bindPhysicsControls() {
  bindNumPair('gravity', 'gravityRange', v => { state.physics.gravity = v; });
  bindNumPair('bounce', 'bounceRange', v => { state.physics.bounce = v; });
  bindNumPair('resistance', 'resistanceRange', v => { state.physics.resistance = v; });
  bindNumPair('friction', 'frictionRange', v => { state.physics.friction = v; });

  document.getElementById('collisionEnabled').addEventListener('change', e => {
    state.physics.collision = e.target.checked;
    document.getElementById('rowCollisionSub').style.display = e.target.checked ? '' : 'none';
    schedulePreview();
  });
  document.getElementById('floorDetection').addEventListener('change', e => {
    state.physics.floorDetection = e.target.checked;
    schedulePreview();
  });
  document.getElementById('wallCollision').addEventListener('change', e => {
    state.physics.wallCollision = e.target.checked;
    schedulePreview();
  });

  document.getElementById('showFloor').addEventListener('change', e => {
    // Visual only - no physics change needed
    schedulePreview();
  });
}

// ── Appearance Controls ───────────────────────────────────────────────────

function bindAppearanceControls() {
  bindNumPair('size', 'sizeRange', v => { state.size = v; });
  bindNumPair('hitboxMask', 'hitboxMaskRange', v => { state.hitboxMask = v; });
  bindNumPair('lifetime', 'lifetimeRange', v => { state.lifetime = v; });
  bindNumPair('spin', 'spinRange', v => { state.initialAngularVelocity = v; });

  document.getElementById('rotate').addEventListener('change', e => {
    state.rotate = e.target.checked;
    document.getElementById('rowSpin').style.display = e.target.checked ? 'flex' : 'none';
    schedulePreview();
  });
  document.getElementById('fadeOut').addEventListener('change', e => {
    state.fadeOut = e.target.checked;
    schedulePreview();
  });
}

// ── Generic Helpers ───────────────────────────────────────────────────────

function bindNumPair(numId, rangeId, setter) {
  const numEl = document.getElementById(numId);
  const rangeEl = document.getElementById(rangeId);
  if (!numEl || !rangeEl) return;

  numEl.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    rangeEl.value = v;
    setter(v);
    schedulePreview();
  });
  rangeEl.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    numEl.value = v;
    setter(v);
    schedulePreview();
  });
}

// ── Emitter List ──────────────────────────────────────────────────────────

const EMITTER_COLORS = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#a0e8af'];

function renderEmitterList() {
  const list = document.getElementById('emitterList');
  list.innerHTML = '';

  state.emitters.forEach((emitter, idx) => {
    const card = buildEmitterCard(emitter, idx);
    list.appendChild(card);
  });

  document.getElementById('btnAddEmitter').onclick = () => {
    const last = state.emitters[state.emitters.length - 1];
    state.emitters.push({
      origin: { ...last.origin },
      target: { ...last.target },
      emissionType: last.emissionType,
      direction: last.direction,
      force: last.force,
      spread: last.spread,
    });
    renderEmitterList();
    drawMarkers();
    schedulePreview();
  };
}

// ── 座標軸1行のHTML（単点 or 範囲切替対応） ──────────────────────────────

function axisRowHtml(coord, axis, val, idx) {
  const isRange = Array.isArray(val);
  const minVal = isRange ? val[0] : val;
  const maxVal = isRange ? val[1] : val;
  return `
    <div class="axis-row">
      <span class="axis-label">${axis.toUpperCase()}</span>
      <div class="axis-single"${isRange ? ' style="display:none"' : ''}>
        <input type="number" class="num-input tiny" data-field="${coord}.${axis}" data-idx="${idx}"
          min="0" max="1" step="0.01" value="${(+minVal).toFixed(3)}">
      </div>
      <div class="axis-range"${isRange ? '' : ' style="display:none"'}>
        <input type="number" class="num-input tiny" data-field="${coord}.${axis}.min" data-idx="${idx}"
          min="0" max="1" step="0.01" value="${(+minVal).toFixed(3)}">
        <span class="range-sep">〜</span>
        <input type="number" class="num-input tiny" data-field="${coord}.${axis}.max" data-idx="${idx}"
          min="0" max="1" step="0.01" value="${(+maxVal).toFixed(3)}">
      </div>
      <button class="btn btn-ghost tiny range-toggle${isRange ? ' active' : ''}"
        data-coord="${coord}" data-axis="${axis}" data-idx="${idx}">範囲</button>
    </div>
  `;
}

function buildEmitterCard(emitter, idx) {
  const color = EMITTER_COLORS[idx % EMITTER_COLORS.length];
  const canDelete = state.emitters.length > 1;
  const isOmni = emitter.emissionType === 'omnidirectional';
  const isSlide = emitter.emissionType === 'slide';
  const tgt = emitter.target ?? { x: 0.5, y: 1.0 };
  const direction = emitter.direction || 'left-right';

  const card = document.createElement('div');
  card.className = 'emitter-card';
  card.innerHTML = `
    <div class="emitter-card-header">
      <span class="emitter-card-title" style="color:${color}">エミッター ${idx + 1}</span>
      ${canDelete ? `<button class="btn btn-danger small" data-del="${idx}">✕</button>` : ''}
    </div>

    <div class="ctrl-row">
      <label style="color:${color}">始点</label>
      <div class="coord-btn-row">
        <button class="btn btn-mode small" data-mode="origin" data-idx="${idx}">⊙ セット</button>
        <span class="edge-label">辺：</span>
        <button class="btn btn-ghost tiny" data-edge="top"    data-idx="${idx}">上</button>
        <button class="btn btn-ghost tiny" data-edge="bottom" data-idx="${idx}">下</button>
        <button class="btn btn-ghost tiny" data-edge="left"   data-idx="${idx}">左</button>
        <button class="btn btn-ghost tiny" data-edge="right"  data-idx="${idx}">右</button>
      </div>
      ${axisRowHtml('origin', 'x', emitter.origin.x, idx)}
      ${axisRowHtml('origin', 'y', emitter.origin.y, idx)}
    </div>

    <div class="ctrl-row">
      <label>タイプ</label>
      <select data-field="emissionType" data-idx="${idx}">
        <option value="directional" ${emitter.emissionType === 'directional' ? 'selected' : ''}>指向性（directional）</option>
        <option value="omnidirectional" ${isOmni ? 'selected' : ''}>全方向（omnidirectional）</option>
        <option value="slide" ${isSlide ? 'selected' : ''}>スライド（slide）</option>
      </select>
    </div>

    <div class="ctrl-row emitter-target-section" style="display:${isOmni || isSlide ? 'none' : 'flex'}">
      <label style="color:${color}">終点</label>
      <div class="coord-btn-row">
        <button class="btn btn-mode small" data-mode="target" data-idx="${idx}">→ セット</button>
      </div>
      ${axisRowHtml('target', 'x', tgt.x, idx)}
      ${axisRowHtml('target', 'y', tgt.y, idx)}
    </div>

    <div class="ctrl-row emitter-direction-section" style="display:${isSlide ? 'flex' : 'none'};flex-direction:column">
      <label>方向</label>
      <div class="radio-group">
        <label><input type="radio" name="direction-${idx}" value="up-down" ${direction === 'up-down' ? 'checked' : ''}> 上→下</label>
        <label><input type="radio" name="direction-${idx}" value="left-right" ${direction === 'left-right' ? 'checked' : ''}> 左→右</label>
        <label><input type="radio" name="direction-${idx}" value="down-up" ${direction === 'down-up' ? 'checked' : ''}> 下→上</label>
        <label><input type="radio" name="direction-${idx}" value="right-left" ${direction === 'right-left' ? 'checked' : ''}> 右→左</label>
      </div>
    </div>

    <div class="ctrl-row">
      <label>発射力</label>
      <div class="range-row">
        <input type="range" data-field="force" data-idx="${idx}" min="0" max="40" step="0.5" value="${emitter.force}">
        <input type="number" class="num-input small" data-field="force-num" data-idx="${idx}"
          min="0" max="40" step="0.5" value="${emitter.force}">
      </div>
    </div>

    <div class="ctrl-row emitter-spread-section" style="display:${isOmni || isSlide ? 'none' : 'flex'}">
      <label>広がり <span class="hint">°</span></label>
      <div class="range-row">
        <input type="range" data-field="spread" data-idx="${idx}" min="0" max="180" step="1" value="${emitter.spread}">
        <input type="number" class="num-input small" data-field="spread-num" data-idx="${idx}"
          min="0" max="180" step="1" value="${emitter.spread}">
      </div>
    </div>
  `;

  bindEmitterCard(card, idx);
  return card;
}

function bindEmitterCard(card, idx) {
  // Delete
  card.querySelector('[data-del]')?.addEventListener('click', () => {
    state.emitters.splice(idx, 1);
    renderEmitterList();
    drawMarkers();
    schedulePreview();
  });

  // Mode buttons (Set Origin / Set Target)
  card.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const isActive = btn.classList.contains('active');

      // Clear all active mode buttons
      document.querySelectorAll('.btn-mode.active').forEach(b => b.classList.remove('active'));
      const mc = document.getElementById('markerCanvas');
      const hint = document.getElementById('clickHint');

      if (isActive) {
        clickMode = null;
        clickModeEmitterIdx = -1;
        mc.style.cursor = 'default';
        hint.style.display = 'none';
      } else {
        clickMode = mode;
        clickModeEmitterIdx = parseInt(btn.dataset.idx);
        btn.classList.add('active');
        mc.style.cursor = 'crosshair';
        hint.style.display = 'block';
      }
    });
  });

  // ── 座標入力（単点・範囲両対応） ──────────────────────────────────────
  card.querySelectorAll('input[data-field]').forEach(input => {
    const field = input.dataset.field;
    const emitterIdx = parseInt(input.dataset.idx);
    if (!field || isNaN(emitterIdx)) return;

    if (field === 'force') {
      input.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        state.emitters[emitterIdx].force = v;
        card.querySelector(`[data-field="force-num"][data-idx="${emitterIdx}"]`).value = v;
        schedulePreview();
      });
    } else if (field === 'force-num') {
      input.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        state.emitters[emitterIdx].force = v;
        card.querySelector(`[data-field="force"][data-idx="${emitterIdx}"]`).value = v;
        schedulePreview();
      });
    } else if (field === 'spread') {
      input.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        state.emitters[emitterIdx].spread = v;
        card.querySelector(`[data-field="spread-num"][data-idx="${emitterIdx}"]`).value = v;
        schedulePreview();
      });
    } else if (field === 'spread-num') {
      input.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        state.emitters[emitterIdx].spread = v;
        card.querySelector(`[data-field="spread"][data-idx="${emitterIdx}"]`).value = v;
        schedulePreview();
      });
    } else {
      // 座標系フィールド: origin.x / origin.y / origin.x.min / origin.x.max 等
      input.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) return;
        const clamped = Math.max(0, Math.min(1, v));
        setCoordValue(state.emitters[emitterIdx], field, clamped);
        drawMarkers();
        schedulePreview();
      });
    }
  });

  // ── 範囲トグルボタン ──────────────────────────────────────────────────
  card.querySelectorAll('.range-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const coord = btn.dataset.coord;   // 'origin' | 'target'
      const axis  = btn.dataset.axis;    // 'x' | 'y'
      const emitterIdx = parseInt(btn.dataset.idx);
      const emitter = state.emitters[emitterIdx];
      if (!emitter) return;

      const obj = coord === 'target' ? (emitter.target ?? { x: 0.5, y: 1.0 }) : emitter.origin;
      const cur = obj[axis];
      const isRange = Array.isArray(cur);

      if (isRange) {
        // 範囲 → 単点（中間値）
        obj[axis] = +((cur[0] + cur[1]) / 2).toFixed(3);
        btn.classList.remove('active');
      } else {
        // 単点 → 範囲（現在値を中心に ±0.5 の広がり）
        obj[axis] = [0, 1];
        btn.classList.add('active');
      }
      if (coord === 'target') emitter.target = obj;

      // single/range 表示切替
      const axisRow = btn.closest('.axis-row');
      const singleEl = axisRow.querySelector('.axis-single');
      const rangeEl  = axisRow.querySelector('.axis-range');
      const newIsRange = Array.isArray(obj[axis]);
      singleEl.style.display = newIsRange ? 'none' : '';
      rangeEl.style.display  = newIsRange ? '' : 'none';

      // 値を同期
      if (newIsRange) {
        axisRow.querySelector(`[data-field="${coord}.${axis}.min"]`).value = obj[axis][0].toFixed(3);
        axisRow.querySelector(`[data-field="${coord}.${axis}.max"]`).value = obj[axis][1].toFixed(3);
      } else {
        axisRow.querySelector(`[data-field="${coord}.${axis}"]`).value = obj[axis].toFixed(3);
      }

      drawMarkers();
      schedulePreview();
    });
  });

  // ── 辺プリセットボタン ────────────────────────────────────────────────
  const EDGE_PRESETS = {
    top:    { x: [0, 1], y: 0 },
    bottom: { x: [0, 1], y: 1 },
    left:   { x: 0, y: [0, 1] },
    right:  { x: 1, y: [0, 1] },
  };
  card.querySelectorAll('[data-edge]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emitterIdx = parseInt(btn.dataset.idx);
      const preset = EDGE_PRESETS[btn.dataset.edge];
      if (!preset) return;
      state.emitters[emitterIdx].origin = { ...preset };
      renderEmitterList(); // 再描画してトグル状態を反映
      drawMarkers();
      schedulePreview();
    });
  });

  // emissionType select
  card.querySelectorAll('select[data-field="emissionType"]').forEach(sel => {
    sel.addEventListener('change', e => {
      const emitterIdx = parseInt(e.target.dataset.idx);
      state.emitters[emitterIdx].emissionType = e.target.value;
      const isOmni = e.target.value === 'omnidirectional';
      const isSlide = e.target.value === 'slide';
      card.querySelectorAll('.emitter-target-section').forEach(el => {
        el.style.display = (isOmni || isSlide) ? 'none' : 'flex';
      });
      card.querySelectorAll('.emitter-direction-section').forEach(el => {
        el.style.display = isSlide ? 'flex' : 'none';
      });
      card.querySelectorAll('.emitter-spread-section').forEach(el => {
        el.style.display = (isOmni || isSlide) ? 'none' : 'flex';
      });
      drawMarkers();
      schedulePreview();
    });
  });

  // direction radio buttons
  card.querySelectorAll('input[type="radio"][name^="direction-"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const emitterIdx = parseInt(e.target.name.split('-')[1]);
      state.emitters[emitterIdx].direction = e.target.value;
      schedulePreview();
    });
  });
}

// ── 座標値セットヘルパー ──────────────────────────────────────────────────
// field 例: 'origin.x' / 'origin.x.min' / 'origin.x.max' / 'target.y' etc.

function setCoordValue(emitter, field, v) {
  const parts = field.split('.');
  // parts[0] = 'origin' | 'target'
  // parts[1] = 'x' | 'y'
  // parts[2] = undefined | 'min' | 'max'
  const coord = parts[0];
  const axis  = parts[1];
  const sub   = parts[2]; // 'min' | 'max' | undefined

  const obj = coord === 'target'
    ? (emitter.target ?? (emitter.target = { x: 0.5, y: 1.0 }))
    : emitter.origin;

  if (!sub) {
    obj[axis] = v;
  } else {
    const cur = Array.isArray(obj[axis]) ? obj[axis] : [obj[axis], obj[axis]];
    if (sub === 'min') obj[axis] = [v, Math.max(v, cur[1])];
    else               obj[axis] = [Math.min(cur[0], v), v];
  }
}

// ── Canvas Click (origin/target set) ─────────────────────────────────────

function bindCanvasClick() {
  const mc = document.getElementById('markerCanvas');
  mc.addEventListener('click', e => {
    if (clickMode === null) return;

    const rect = mc.getBoundingClientRect();
    const x = +(((e.clientX - rect.left) / rect.width).toFixed(3));
    const y = +(((e.clientY - rect.top) / rect.height).toFixed(3));

    const emitter = state.emitters[clickModeEmitterIdx];
    if (!emitter) return;

    if (clickMode === 'origin') {
      emitter.origin = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    } else if (clickMode === 'target') {
      if (!emitter.target) emitter.target = { x: 0.5, y: 1.0 };
      emitter.target = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }

    // Sync inputs
    syncEmitterInputs(clickModeEmitterIdx);

    // Reset mode
    clickMode = null;
    clickModeEmitterIdx = -1;
    mc.style.cursor = 'default';
    document.getElementById('clickHint').style.display = 'none';
    document.querySelectorAll('.btn-mode.active').forEach(b => b.classList.remove('active'));

    drawMarkers();
    schedulePreview();
  });
}

function syncEmitterInputs(idx) {
  // canvas click で単点セットされるので再描画で確実に反映させる
  renderEmitterList();
}

// ── Marker Drawing ────────────────────────────────────────────────────────

function drawMarkers() {
  const mc = document.getElementById('markerCanvas');
  if (!mc) return;
  const ctx = mc.getContext('2d');
  ctx.clearRect(0, 0, mc.width, mc.height);

  const w = mc.width;
  const h = mc.height;

  const mid = v => Array.isArray(v) ? (v[0] + v[1]) / 2 : v;

  state.emitters.forEach((emitter, idx) => {
    const color = EMITTER_COLORS[idx % EMITTER_COLORS.length];

    const ox = mid(emitter.origin.x) * w;
    const oy = mid(emitter.origin.y) * h;

    // 辺の場合は線で表示
    if (Array.isArray(emitter.origin.x)) {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(emitter.origin.x[0] * w, oy);
      ctx.lineTo(emitter.origin.x[1] * w, oy);
      ctx.stroke(); ctx.restore();
    }
    if (Array.isArray(emitter.origin.y)) {
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(ox, emitter.origin.y[0] * h);
      ctx.lineTo(ox, emitter.origin.y[1] * h);
      ctx.stroke(); ctx.restore();
    }

    if (emitter.emissionType !== 'omnidirectional' && emitter.target) {
      const tx = mid(emitter.target.x) * w;
      const ty = mid(emitter.target.y) * h;

      // Arrow
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      // Target dot
      drawDot(ctx, tx, ty, color, `T${idx + 1}`, true);
    }

    // Origin dot (drawn last so it's on top)
    drawDot(ctx, ox, oy, color, `O${idx + 1}`, false);
  });
}

function drawDot(ctx, x, y, color, label, hollow) {
  const r = 9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (hollow) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.fillStyle = hollow ? color : '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.setLineDash([]);
  ctx.fillText(label, x, y);
  ctx.restore();
}
