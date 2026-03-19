// Settings Panel JavaScript (Tauri版)

let triggers = [];
let authPollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initClientId();
  initAuth();
  loadTriggers();
  setupEventListeners();
  showEffectCraftPopup();
});

function showEffectCraftPopup() {
  const popup = document.getElementById('effectCraftPopup');
  if (popup) popup.style.display = 'flex';
}

function setupEventListeners() {
  document.getElementById('connectTwitchBtn')?.addEventListener('click', handleConnectTwitch);
  document.getElementById('disconnectBtn')?.addEventListener('click', handleDisconnect);
  document.getElementById('addTriggerBtn').addEventListener('click', addTrigger);
  document.getElementById('saveBtn').addEventListener('click', saveTriggers);
  document.getElementById('resetConfigBtn').addEventListener('click', handleResetConfig);
  document.getElementById('saveClientIdBtn')?.addEventListener('click', saveClientId);

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
      status.textContent = `❌ 失敗: ${failed.join(', ')}`;
    } else {
      status.textContent = `✓ ${files.map(f => f.name).join(', ')}`;
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
    if (e.target.classList.contains('trigger-type')) {
      toggleTriggerTypeFields(e.target.closest('.trigger-item'), e.target.value);
    }
  });
}

function toggleTriggerTypeFields(triggerItem, triggerType) {
  triggerItem.querySelector('.trigger-keyword-section').style.display =
    triggerType === 'keyword' ? 'flex' : 'none';
  triggerItem.querySelector('.trigger-points-section').style.display =
    triggerType === 'points' ? 'flex' : 'none';
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

// ── 認証 ──────────────────────────────────────────────────────

async function initAuth() {
  try {
    const res = await fetch('/api/auth/status');
    const status = await res.json();
    if (status.isAuthenticated) {
      showAuthConnected(status.username);
    } else {
      showAuthNotConnected();
    }
  } catch (error) {
    console.error('Error checking auth status:', error);
    showAuthNotConnected();
  }
}

function showAuthConnected(username) {
  document.getElementById('authNotConnected').style.display = 'none';
  document.getElementById('authConnected').style.display = 'block';
  document.getElementById('usernameDisplay').textContent = username || 'Connected';
  document.getElementById('tokenExpireInfo').textContent = '';
}

function showAuthNotConnected() {
  document.getElementById('authNotConnected').style.display = 'block';
  document.getElementById('authConnected').style.display = 'none';
}

async function handleConnectTwitch() {
  const btn = document.getElementById('connectTwitchBtn');
  btn.disabled = true;
  btn.textContent = '認証中...';

  try {
    await fetch('/api/auth/start', { method: 'POST' });

    if (authPollInterval) clearInterval(authPollInterval);
    authPollInterval = setInterval(async () => {
      const res = await fetch('/api/auth/status');
      const status = await res.json();
      if (status.isAuthenticated) {
        clearInterval(authPollInterval);
        authPollInterval = null;
        initAuth();
        btn.disabled = false;
        btn.textContent = 'Twitch に接続';
      }
    }, 2000);

    setTimeout(() => {
      if (authPollInterval) {
        clearInterval(authPollInterval);
        authPollInterval = null;
        btn.disabled = false;
        btn.textContent = 'Twitch に接続';
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error('OAuth error:', error);
    btn.disabled = false;
    btn.textContent = 'Twitch に接続';
    alert('認証の開始に失敗しました');
  }
}

async function handleDisconnect() {
  if (!confirm('Twitch 接続を解除しますか？')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    initAuth();
  } catch (error) {
    console.error('Logout error:', error);
    alert('解除に失敗しました');
  }
}

async function handleResetConfig() {
  if (!confirm('すべての設定（認証情報・トリガー）を消去しますか？')) return;
  try {
    await fetch('/api/config/reset', { method: 'POST' });
    triggers = [];
    renderTriggers();
    initAuth();
    alert('設定を初期化しました');
  } catch (error) {
    console.error('Reset error:', error);
    alert('リセットに失敗しました');
  }
}

// ── トリガー ──────────────────────────────────────────────────

async function loadTriggers() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    triggers = config.triggers || [];
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
    const triggerItem = clone.querySelector('.trigger-item');

    const triggerType = trigger.type ?? 'keyword';
    clone.querySelector('.trigger-type').value = triggerType;
    toggleTriggerTypeFields(triggerItem, triggerType);

    if (triggerType === 'keyword' && trigger.ワード) {
      clone.querySelector('.trigger-word').value = trigger.ワード;
    } else if (triggerType === 'points' && trigger.rewardName) {
      clone.querySelector('.trigger-reward-name').value = trigger.rewardName;
    }

    if (trigger.effectConfig) {
      clone.querySelector('.effect-json-name').textContent =
        trigger.effectConfig.name || 'エフェクト設定済み';
    }

    // effectConfig をDOM要素に持たせる（appendChild後にセット）
    container.appendChild(clone);
    // 最後に追加された要素に _effectConfig をセット
    const addedItem = container.lastElementChild;
    addedItem._effectConfig = trigger.effectConfig || null;
  });
}

function addTrigger() {
  triggers.push({
    id: `trigger_${Date.now()}`,
    type: 'keyword',
    ワード: '',
    rewardName: '',
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
    const triggerType = item.querySelector('.trigger-type').value;
    const base = {
      id: triggers[index]?.id || `trigger_${Date.now()}_${index}`,
      type: triggerType,
      effectConfig: item._effectConfig || null,
    };

    if (triggerType === 'keyword') {
      const keyword = item.querySelector('.trigger-word').value.trim();
      if (keyword) updatedTriggers.push({ ...base, ワード: keyword });
    } else if (triggerType === 'points') {
      const rewardName = item.querySelector('.trigger-reward-name').value.trim();
      if (rewardName) updatedTriggers.push({ ...base, rewardName });
    }
  });

  triggers = updatedTriggers;

  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggers: updatedTriggers }),
    });
    alert('設定が保存されました！');
  } catch (error) {
    console.error('Error saving config:', error);
    alert('設定の保存に失敗しました');
  }
}

// ── Client ID ──────────────────────────────────────────────────

async function initClientId() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    const status = document.getElementById('clientIdStatus');
    if (config.twitchClientId) {
      document.getElementById('clientIdInput').value = config.twitchClientId;
      status.textContent = '✓ 設定済み';
      status.style.color = '#48bb78';
    } else {
      status.textContent = 'Client ID が未設定です。Twitch に接続するには先に保存してください。';
      status.style.color = '#e53e3e';
    }
  } catch (e) {
    console.error('initClientId error:', e);
  }
}

async function saveClientId() {
  const value = document.getElementById('clientIdInput').value.trim();
  const status = document.getElementById('clientIdStatus');
  if (!value) {
    status.textContent = 'Client ID を入力してください';
    status.style.color = '#e53e3e';
    return;
  }
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twitchClientId: value }),
    });
    status.textContent = '✓ 保存しました';
    status.style.color = '#48bb78';
  } catch (e) {
    status.textContent = '保存に失敗しました';
    status.style.color = '#e53e3e';
  }
}
