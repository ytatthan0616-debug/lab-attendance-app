<img width="543" height="475" alt="スクリーンショット 2026-07-20 191305" src="https://github.com/user-attachments/assets/4a22f6b6-bab3-4590-ab54-814540b909a5" />
<img width="534" height="438" alt="スクリーンショット 2026-07-20 191317" src="https://github.com/user-attachments/assets/afc0c6ec-ac7d-4ae4-9d30-a2b006dea0fa" />
<img width="534" height="438" alt="スクリーンショット 2026-07-20 191326" src="https://github.com/user-attachments/assets/1c65725c-2642-4635-9f5a-e11a67c66591" />




# Lab Monitoring System 🖥️

研究室のメンバーの在室状況や簡単なアクションを，リアルタイムで共有・把握するためのデスクトップ常駐アプリです．

## 🚀 開発の背景と目的
研究室（第1〜第9）のメンバーが「今どこにいるか」「ちょっとご飯に行っているだけか」などを簡単に共有し，コミュニケーションを円滑にするために開発しました．
ブラウザを開く手間を省き，PC作業を妨げないようにするため，Tauriを用いて軽量なデスクトップアプリとして実装しています．

## ✨ 主な機能 (Features)
- **リアルタイムステータス同期**: Firebase Realtime Databaseを利用し，「出席」「外出」「欠席」のステータスを即座に反映．
- **一時的なアクション＆チャット**: 「飯行きたい」「コンビニ」などのアクションやチャットは，1時間で自動消去されるロジックを実装（不要なデータの蓄積を防止）．
- **リアクション機能**: メンバーのアクションに対して「👍」「👎」ボタンで気軽に反応できる仕組み．
- **OSネイティブ通知**: Tauriを活用し，メンバーからのメッセージ受信時にデスクトップ通知を表示．
- **直感的なUI/UX**: グラスモーフィズムを取り入れたサイバー調のデザイン．ウィンドウのドラッグ移動など，デスクトップアプリ特有の操作感を実現．
- **経過時間表示**: メンバーのステータス更新からの経過時間をツールチップで表示し，状況予測をサポート．

## 🛠 使用技術 (Tech Stack)
- **Frontend**: Vue.js (Vue 3 / Composition API), TypeScript, HTML, CSS
- **Desktop Framework**: Tauri (Rust)
- **Database / BaaS**: Firebase Realtime Database

## 💡 工夫した点・アピールポイント
- **通信量とパフォーマンスの最適化**: データベースからのデータ取得件数を直近のメッセージに制限し，クライアントのメモリ負荷と通信コストを抑える設計にしました．
- **Web技術によるデスクトップアプリ化**: Tauriを採用することで，使い慣れたWeb技術（Vue/TS）を活かしつつ，OSの通知機能やウィンドウ制御といったネイティブな体験を提供しています．
- **セキュアなコード管理**: 公開用リポジトリとして，FirebaseのAPIキー等の機密情報をダミー化し，セキュリティを意識したコード管理を行っています．

## 🔧 ローカルでの動かし方 (Setup & Installation)

1. リポジトリのクローン
   ```bash
   git clone [https://github.com/ytatthan0616-debug/lab-attendance-app.git](https://github.com/ytatthan0616-debug/lab-attendance-app.git)
   cd lab-attendance-app

```

2. パッケージのインストール
```bash
npm install

```


3. Firebaseの設定
`src/firebase.ts` 内の接続情報を，ご自身のFirebaseプロジェクトのキーに書き換えてください．


5. 開発環境での起動
```bash
npm run tauri dev

```


5. 実行ファイル (.exe) のビルド
```bash
npm run tauri build

```




# Tauri + Vue + TypeScript

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
