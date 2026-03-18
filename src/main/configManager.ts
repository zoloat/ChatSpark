import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const getDataDir = (): string =>
  process.env.APP_DATA_DIR ??
  (process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'twitch-overlay-support')
    : path.join(os.homedir(), '.twitch-overlay-support'));

const getConfigPath = () => path.join(getDataDir(), 'config.json');

export interface Trigger {
  id: string;
  type: 'keyword' | 'points';
  ワード?: string;
  rewardName?: string;
  effectConfig?: object;
  駆動方法: 'falling' | 'slide-out';
  そくど: number;
  かず: number;
  画像指定: string;
  回転?: boolean;
  蓄積?: boolean;
  消す時間?: number;
  方向?: string;
  サイズ倍率?: number;
}

export interface Config {
  triggers: Trigger[];
  userAuthToken?: string;
  userChannelName?: string;
  userId?: string;
  twitchClientId?: string;
}

const defaultConfig: Config = {
  triggers: [
    {
      id: 'trigger_001',
      type: 'keyword',
      ワード: 'ナイス',
      駆動方法: 'falling',
      そくど: 3,
      かず: 5,
      画像指定: 'none.png',
      回転: true,
      蓄積: true,
      消す時間: 5,
    },
    {
      id: 'trigger_002',
      type: 'keyword',
      ワード: 'ウケた',
      駆動方法: 'slide-out',
      そくど: 2,
      かず: 3,
      画像指定: 'none.png',
      回転: true,
      方向: 'left-to-right',
    },
  ],
};

export const loadConfig = (): Config => {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    } else {
      saveConfig(defaultConfig);
      return defaultConfig;
    }
  } catch (error) {
    console.error('Error loading config:', error);
    return defaultConfig;
  }
};

export const saveConfig = (config: Config): void => {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving config:', error);
  }
};

export function buildImageIndex(): Record<string, string[]> {
  const assetsDir = path.join(getDataDir(), 'assets');
  if (!fs.existsSync(assetsDir)) return {};

  const files = fs.readdirSync(assetsDir);
  const index: Record<string, string[]> = {};
  const pattern = /^(.+?)(?:\s*\((\d+)\)|(\d+))?\.(png|jpg|jpeg|gif|webp|svg)$/i;

  for (const file of files) {
    const stat = fs.statSync(path.join(assetsDir, file));
    if (!stat.isFile()) continue;
    const m = file.match(pattern);
    if (!m) continue;
    const baseName = m[1];
    if (!index[baseName]) index[baseName] = [];
    index[baseName].push(file);
  }

  for (const key of Object.keys(index)) {
    index[key].sort();
  }

  fs.writeFileSync(
    path.join(getDataDir(), 'image-index.json'),
    JSON.stringify(index, null, 2)
  );
  return index;
}
