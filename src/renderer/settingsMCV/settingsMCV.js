// MCV Settings Panel JavaScript

let triggers = [];

document.addEventListener('DOMContentLoaded', () => {
  loadTriggers();
  setupEventListeners();
  initMCVStatus();
});

// ── MCV 接続ステータス監視 ──────────────────────────────────────

function initMCVStatus() {
  // 初回チェック
  checkMCVStatus();

  // Socket.IO でリアルタイム監視
  const socket = io();
  socket.on('mcvStatus', (data) => {
    updateMCVStatusUI(data.connected);
  });
}

async function checkMCVStatus() {
  try {
    const res = await fetch('/api/mcv/status');
    const data = await res.json();
    updateMCVStatusUI(data.connected);
  } catch {
    updateMCVStatusUI(false);
  }
}

function updateMCVStatusUI(connected) {
  document.getElementById('mcvNotConnected').style.display = connected ? 'none' : 'block';
  document.getElementById('mcvConnected').style.display = connected ? 'block' : 'none';
}

// ── イベントリスナー ────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('addTriggerBtn').addEventListener('click', addTrigger);
  document.getElementById('saveBtn').addEventListener('click', saveTriggers);
  document.getElementById('resetConfigBtn').addEventListener('click', handleResetConfig);

  document.getElementById('assetUploadBtn')?.addEventListener('click', () =>
    document.getElementById('assetUploadInput').click()
  );
  document.getElementById('assetUploadInput')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const status = document.getElementById('assetUploadStatus');
    status.textContent = 'アップロード中...';
    const failed = [];
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/assets/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok || data.error) failed.push(file.name);
      } catch {
        failed.push(file.name);
      }
    }
    if (failed.length) {
      status.textContent = `失敗: ${failed.join(', ')}`;
    } else {
      status.textContent = `${files.map(f => f.name).join(', ')}`;
    }
    e.target.value = '';
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-trigger')) {
      e.target.closest('.trigger-item').remove();
    }
    if (e.target.classList.contains('preview-trigger')) {
      previewTrigger(e.target.closest('.trigger-item'));
    }
    if (e.target.classList.contains('load-effect-json-btn')) {
      e.target.closest('.trigger-item').querySelector('.effect-json-file').click();
    }
    if (e.target.classList.contains('clear-effect-json-btn')) {
      const item = e.target.closest('.trigger-item');
      item.querySelector('.effect-json-name').textContent = '（未設定）';
      item._effectConfig = null;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('effect-json-file')) {
      handleEffectJsonUpload(e.target);
    }
  });
}

function handleEffectJsonUpload(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const config = JSON.parse(ev.target.result);
      const item = fileInput.closest('.trigger-item');
      item._effectConfig = config;
      item.querySelector('.effect-json-name').textContent = file.name;
    } catch {
      alert('JSONの解析に失敗しました');
    }
  };
  reader.readAsText(file);
}

// ── トリガー ────────────────────────────────────────────────────

async function loadTriggers() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    // MCV モードでは keyword タイプのみ表示
    triggers = (config.triggers || []).filter(t => (t.type ?? 'keyword') === 'keyword');
    renderTriggers();
  } catch (error) {
    console.error('Error loading config:', error);
    triggers = [];
    renderTriggers();
  }
}

function renderTriggers() {
  const container = document.getElementById('triggersContainer');
  container.innerHTML = '';

  triggers.forEach((trigger) => {
    const template = document.getElementById('triggerTemplate');
    const clone = template.content.cloneNode(true);

    if (trigger.ワード) {
      clone.querySelector('.trigger-word').value = trigger.ワード;
    }

    if (trigger.effectConfig) {
      clone.querySelector('.effect-json-name').textContent =
        trigger.effectConfig.name || 'エフェクト設定済み';
    }

    container.appendChild(clone);
    const addedItem = container.lastElementChild;
    addedItem._effectConfig = trigger.effectConfig || null;
  });
}

function addTrigger() {
  triggers.push({
    id: `trigger_${Date.now()}`,
    type: 'keyword',
    ワード: '',
    effectConfig: null,
  });
  renderTriggers();
}

function previewTrigger(triggerItem) {
  const effectConfig = triggerItem._effectConfig;
  if (!effectConfig) {
    alert('エフェクトJSONが設定されていません');
    return;
  }
  document.getElementById('previewFrame').contentWindow.postMessage(
    { effectConfig }, '*'
  );
}

async function saveTriggers() {
  const triggerItems = document.querySelectorAll('.trigger-item');
  const updatedTriggers = [];

  triggerItems.forEach((item, index) => {
    const keyword = item.querySelector('.trigger-word').value.trim();
    if (!keyword) return;
    updatedTriggers.push({
      id: triggers[index]?.id || `trigger_${Date.now()}_${index}`,
      type: 'keyword',
      ワード: keyword,
      effectConfig: item._effectConfig || null,
    });
  });

  triggers = updatedTriggers;

  try {
    // 既存の points トリガーを保持するため、現在の設定を読み込んでマージ
    const res = await fetch('/api/config');
    const config = await res.json();
    const pointsTriggers = (config.triggers || []).filter(t => t.type === 'points');

    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggers: [...updatedTriggers, ...pointsTriggers] }),
    });
    alert('設定が保存されました！');
  } catch (error) {
    console.error('Error saving config:', error);
    alert('設定の保存に失敗しました');
  }
}

async function handleResetConfig() {
  if (!confirm('すべてのトリガー設定を消去しますか？')) return;
  try {
    await fetch('/api/config/reset', { method: 'POST' });
    triggers = [];
    renderTriggers();
    alert('設定を初期化しました');
  } catch (error) {
    console.error('Reset error:', error);
    alert('リセットに失敗しました');
  }
}
