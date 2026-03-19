import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { Server } from 'socket.io';
import * as http from 'http';
import * as os from 'os';
import axios from 'axios';
import multer from 'multer';
import { loadConfig, saveConfig, getDataDir, buildImageIndex } from './configManager';
import { connectToTwitchChat, stopChatMonitor, connectToEventSub, disconnectEventSub } from './chatMonitor';

function getClientId(): string | undefined {
  const config = loadConfig();
  return (config.twitchClientId || process.env.TWITCH_CLIENT_ID)?.trim();
}

const PORT = Number(process.env.PORT) || 39080;
let io: Server;


function openInBrowser(url: string) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

async function getUserInfoFromToken(accessToken: string) {
  const clientId = getClientId()!;
  const response = await axios.get('https://api.twitch.tv/helix/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-ID': clientId,
    }
  });
  return response.data.data[0];
}

export const startServer = () => {
  const expressApp = express();
  const server = http.createServer(expressApp);
  io = new Server(server, { cors: { origin: '*' } });

  expressApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('X-Frame-Options', 'ALLOWALL');
    next();
  });

  expressApp.use(express.json());
  expressApp.use(express.urlencoded({ extended: true }));

  // ── 静的ファイル ──────────────────────────────────────────────
  // pkg バンドル時は esbuild が __dirname をビルド時パスで置換するため execPath で代替
  const isPkg = !!(process as any).pkg;
  // pkg モード: renderer ファイルはスナップショット内 (argv[1]) に格納
  const baseDir = isPkg ? path.dirname(process.argv[1]) : path.join(__dirname, '..');
  const displayPath = path.join(baseDir, 'renderer/display');
  const settingsPath = path.join(baseDir, 'renderer/settingsPanel');
  const assetsPath = path.join(getDataDir(), 'assets');

  expressApp.get('/assets/:file(*)', (req, res) => {
    const filePath = path.join(assetsPath, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.sendFile(path.resolve(filePath));
  });
  // matter.min.js 等をルートでも配信（display/index.html の絶対パス参照用）
  expressApp.use(express.static(displayPath));
  expressApp.use('/display', express.static(displayPath));
  expressApp.use('/settings', express.static(settingsPath));

  expressApp.get('/display', (req, res) =>
    res.sendFile(path.join(displayPath, 'index.html')));
  expressApp.get('/settings', (req, res) =>
    res.sendFile(path.join(settingsPath, 'index.html')));

  // Effect Craft エディタ: exe の隣に置かれたフォルダ (execPath) を参照
  const effectCraftPath = isPkg
    ? path.join(path.dirname(process.execPath), 'effect-craft')
    : path.join(baseDir, '..', '..', '..', 'effect-craft');
  if (fs.existsSync(effectCraftPath)) {
    expressApp.use('/effect-craft', express.static(effectCraftPath));
    expressApp.get('/effect-craft', (_req, res) => res.sendFile(path.join(effectCraftPath, 'index.html')));
    expressApp.get('/effect-craft/', (_req, res) => res.sendFile(path.join(effectCraftPath, 'index.html')));
  }

  // ── ファイルアップロード（multer）────────────────────────────
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(assetsPath)) fs.mkdirSync(assetsPath, { recursive: true });
      cb(null, assetsPath);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
  });
  const upload = multer({ storage });

  // ── API: ヘルスチェック ───────────────────────────────────────
  expressApp.get('/api/health', (req, res) => res.json({ ok: true }));

  // ── API: コンフィグ ───────────────────────────────────────────
  expressApp.get('/api/config', (req, res) => {
    res.json(loadConfig());
  });

  expressApp.post('/api/config', (req, res) => {
    const current = loadConfig();
    saveConfig({ ...current, ...req.body });
    buildImageIndex();
    res.json({ success: true });
  });

  expressApp.get('/api/image-index', (req, res) => {
    const indexPath = path.join(getDataDir(), 'image-index.json');
    if (fs.existsSync(indexPath)) {
      res.json(JSON.parse(fs.readFileSync(indexPath, 'utf-8')));
    } else {
      res.json(buildImageIndex());
    }
  });

  expressApp.post('/api/config/reset', (req, res) => {
    saveConfig({ triggers: [] });
    res.json({ success: true });
  });

  // ── API: 認証ステータス ───────────────────────────────────────
  expressApp.get('/api/auth/status', (req, res) => {
    const config = loadConfig();
    res.json({
      isAuthenticated: !!config.userAuthToken,
      username: config.userChannelName,
    });
  });

  // ── API: Implicit Grant 認証開始 ──────────────────────────────
  expressApp.post('/api/auth/start', (req, res) => {
    const clientId = getClientId();
    if (!clientId) {
      return res.status(500).json({ error: 'TWITCH_CLIENT_ID が設定されていません' });
    }

    const scopes = 'chat:read channel:read:redemptions';
    const redirectUri = `http://localhost:${PORT}/oauth/callback`;

    const authUrl =
      `https://id.twitch.tv/oauth2/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(scopes)}`;

    openInBrowser(authUrl);
    res.json({ success: true });
  });

  // ── OAuth コールバック（Implicit Grant）──────────────────────
  // トークンは URL フラグメント（#）に含まれるためサーバーには届かない。
  // ページ上の JS がフラグメントを読み取り /api/auth/token に POST する。
  expressApp.get('/oauth/callback', (req, res) => {
    if (req.query.error) {
      return res.send(`<h1>認証キャンセル</h1><p>${req.query.error}</p>`);
    }
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;
      height:100vh;background:#0f0f0f;color:#fff;}
      .box{text-align:center;padding:40px;border-radius:12px;background:#1a1a2e;}
      h1{color:#9147ff;}</style></head>
      <body><div class="box"><h1 id="title">認証中...</h1><p id="msg">しばらくお待ちください</p></div>
      <script>
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
          fetch('/api/auth/token', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ access_token: token })
          })
          .then(r => r.json())
          .then(d => {
            if (d.success) {
              document.getElementById('title').textContent = '✓ 認証成功！';
              document.getElementById('msg').textContent = d.username + ' として接続しました。この画面を閉じてください';
            } else {
              document.getElementById('title').textContent = '認証失敗';
              document.getElementById('msg').textContent = d.error || 'エラーが発生しました';
            }
          });
        } else {
          document.getElementById('title').textContent = 'エラー';
          document.getElementById('msg').textContent = 'アクセストークンが見つかりません';
        }
      </script>
      </body></html>`);
  });

  // ── API: トークン受け取り ─────────────────────────────────────
  expressApp.post('/api/auth/token', async (req, res) => {
    const { access_token } = req.body;
    if (!access_token) {
      return res.status(400).json({ error: 'access_token がありません' });
    }
    try {
      const userInfo = await getUserInfoFromToken(access_token);
      const config = loadConfig();
      config.userAuthToken = access_token;
      config.userChannelName = userInfo.login;
      config.userId = userInfo.id;
      saveConfig(config);
      connectToTwitchChat(io, userInfo.login, access_token);
      const clientId = getClientId();
      if (clientId) connectToEventSub(io, userInfo.id, access_token, clientId);
      res.json({ success: true, username: userInfo.login });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Token save error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // ── API: ログアウト ───────────────────────────────────────────
  expressApp.post('/api/auth/logout', (req, res) => {
    stopChatMonitor();
    disconnectEventSub();
    const config = loadConfig();
    delete config.userAuthToken;
    delete config.userChannelName;
    delete config.userId;
    saveConfig(config);
    res.json({ success: true });
  });

  // ── API: チャット開始 / 停止 ──────────────────────────────────
  expressApp.post('/api/chat/start', (req, res) => {
    const config = loadConfig();
    if (!config.userAuthToken || !config.userChannelName) {
      return res.status(400).json({ error: '先に Twitch 認証を完了してください' });
    }
    connectToTwitchChat(io, config.userChannelName, config.userAuthToken);
    const clientId = getClientId();
    if (clientId && config.userId) connectToEventSub(io, config.userId, config.userAuthToken, clientId);
    res.json({ success: true });
  });

  expressApp.post('/api/chat/stop', (req, res) => {
    stopChatMonitor();
    disconnectEventSub();
    res.json({ success: true });
  });

  // ── API: 画像アップロード ─────────────────────────────────────
  expressApp.post('/api/assets/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
    res.json({ fileName: req.file.filename });
  });

  // ── API: 外部URLを開く ────────────────────────────────────────
  expressApp.post('/api/open-external', (req, res) => {
    const { url } = req.body;
    if (url) openInBrowser(url);
    res.json({ success: true });
  });

  // ── WebSocket ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`ポート ${PORT} は使用中です。既にアプリが起動していないか確認してください。`);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`  Settings: http://localhost:${PORT}/settings`);
    console.log(`  Display:  http://localhost:${PORT}/display`);
  });
};

export const getIO = () => io;
