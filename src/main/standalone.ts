import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { startServer, getIO } from './server';
import { loadConfig } from './configManager';
import { connectToTwitchChat, connectToEventSub } from './chatMonitor';

dotenv.config();

// アセットの初期化（公開アセットをデータディレクトリにコピー）
const initAssets = () => {
  const { getDataDir } = require('./configManager');
  const dataDir = getDataDir();
  const assetsDir = path.join(dataDir, 'assets');

  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // バンドルされた公開アセットのパス
  // pkg でバンドル時は __dirname = dist/ 配下なので assets/ を直接参照
  // 開発時 (dist/main/standalone.js) は ../../public/assets
  const isPkg = !!(process as any).pkg;
  // esbuild はビルド時に __dirname をソースパスで置換するため
  // pkg 実行時の __dirname を Function 経由で実行時評価させる
  // pkg 内では __dirname がグローバル未定義のため argv[1] で代替
  const runtimeDirname: string = isPkg
    ? path.dirname(process.argv[1])  // スナップショット内パス（dist/assets/ がある）
    : __dirname;
  const publicAssetsPath = isPkg
    ? path.join(runtimeDirname, 'assets')
    : path.join(runtimeDirname, '../../public/assets');
  if (!fs.existsSync(publicAssetsPath)) return;

  const files = fs.readdirSync(publicAssetsPath);
  files.forEach((file) => {
    const dest = path.join(assetsDir, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(publicAssetsPath, file), dest);
      console.log(`Copied asset: ${file}`);
    }
  });
};

function openInBrowser(url: string) {
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd);
}

const PORT = Number(process.env.PORT) || 39080;

const main = async () => {
  initAssets();
  startServer();

  // モード選択画面をブラウザで自動起動
  setTimeout(() => {
    openInBrowser(`http://localhost:${PORT}/`);
  }, 1000);

  // 認証済みなら起動後に自動でチャット＋EventSub接続
  const config = loadConfig();
  if (config.userAuthToken && config.userChannelName) {
    setTimeout(() => {
      const io = getIO();
      connectToTwitchChat(io, config.userChannelName!, config.userAuthToken!);
      const clientId = (config.twitchClientId || process.env.TWITCH_CLIENT_ID)?.trim();
      if (clientId && config.userId) connectToEventSub(io, config.userId, config.userAuthToken!, clientId);
    }, 1500);
  }
};

main().catch(console.error);
