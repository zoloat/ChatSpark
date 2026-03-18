# ChatSpark

> Twitch チャット・チャンネルポイントのキーワードをトリガーに、OBS 配信画面へパーティクルエフェクトを表示するオーバーレイツール

> **注意:** これは非公式のサードパーティツールです。Twitch の公式製品ではありません。
> This is NOT an official Twitch product.

---

## 機能

- Twitch チャット監視（キーワードトリガー）
- チャンネルポイント報酬トリガー
- Matter.js 物理演算によるパーティクルエフェクト
- カスタム画像・GIF 対応
- 複数画像ランダム選択（同名ファイルを複数置くだけ）
- Effect Craft — ブラウザで動くビジュアルエフェクトエディタ
- OBS ブラウザソースで表示

---

## ダウンロード

[GitHub Releases](../../releases) から最新の exe をダウンロードしてください。

---

## セットアップ

1. Releases から最新の zip をダウンロード・解凍
2. `twitch-overlay.exe` を起動
3. 設定パネルが開く → Twitch 認証 → キーワード設定
4. OBS にブラウザソースを追加: `http://localhost:39080/display`

---

## Effect Craft（エフェクトエディタ）

- `effect-craft/index.html` をブラウザで開く（サーバー不要）
- または起動後 `http://localhost:39080/effect-craft` でアクセス
- エフェクトを作成して JSON をエクスポート → 設定パネルで読み込む

---

## Development（開発環境）

```bash
npm install
npm run dev      # ビルド + サーバー起動
```

### ビルド

```bash
npm run build           # TypeScript コンパイル
npm run build:sidecar   # Windows exe 生成
```

---

## 技術スタック

- Node.js + Express + Socket.IO
- Twitch API (Twurple)
- Matter.js (物理演算)
- Tauri (デスクトップラッパー)

---

## ライセンス

MIT — © 2026 zoloat
