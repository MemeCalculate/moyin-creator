<p align="center">
  <img src="build/icon.png" width="120" alt="Moyin Creator ロゴ" />
</p>

<h1 align="center">Moyin Creator 魔因漫创</h1>

<p align="center">
  <strong>🎬 AI 駆動の映画・アニメ制作ツール · Seedance 2.0 · 脚本から映像までのバッチパイプライン</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/releases"><img src="https://img.shields.io/github/v/release/MemeCalculate/moyin-creator" alt="Release" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/stargazers"><img src="https://img.shields.io/github/stars/MemeCalculate/moyin-creator" alt="Stars" /></a>
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README_EN.md">🇬🇧 English</a> | <strong>🇯🇵 日本語</strong>
</p>

<p align="center">
  <a href="#機能">機能</a> •
  <a href="#クイックスタート">クイックスタート</a> •
  <a href="#アーキテクチャ">アーキテクチャ</a> •
  <a href="#ライセンス">ライセンス</a> •
  <a href="#コントリビューション">コントリビューション</a>
</p>

---

## 概要

**Moyin Creator** は、AI で映画やアニメを制作するクリエイターのためのプロダクショングレードのツールです。相互に連携する 5 つのモジュールが、脚本から完成映像までのパイプライン全体をカバーします。

> **📝 脚本 → 🎭 キャラクター → 🌄 シーン → 🎬 ディレクター → ⭐ S クラス (Seedance 2.0)**

各ステージの出力は自動的に次のステージへ引き継がれるため、手作業でつなぎ合わせる必要はありません。主要な AI モデルを複数サポートしており、ショートドラマ、アニメシリーズ、予告編などのバッチ制作に最適です。

## 機能

### ⭐ S クラスモジュール — Seedance 2.0 マルチモーダル制作
- **複数ショットを統合したナラティブ動画の生成**: ストーリーボードのシーンをグループ化し、一貫性のあるナラティブ動画にします
- @Image / @Video / @Audio のマルチモーダル参照 (キャラクター参照、シーン画像、先頭フレームの自動収集)
- スマートプロンプトビルダー: 3 層の自動融合 (アクション + カメラワーク + セリフのリップシンク)
- 先頭フレームのグリッド結合 (N×N 方式)
- Seedance 2.0 の制約の自動検証 (画像 ≤9 枚 + 動画 ≤3 本 + 音声 ≤3 本、プロンプト ≤5000 文字)

<img width="578" height="801" alt="S クラスモジュール 1" src="https://github.com/user-attachments/assets/34b623a3-9be9-4eb5-ae52-a6a9553598ea" />
<img width="584" height="802" alt="S クラスモジュール 2" src="https://github.com/user-attachments/assets/54c6036b-c545-45c0-a32b-de71b8138484" />
<img width="1602" height="835" alt="S クラスモジュール 3" src="https://github.com/user-attachments/assets/2b5af973-98c9-4708-bf53-02d11321d86d" />

### 🎬 脚本解析エンジン
- 脚本をシーン、ストーリーボード、セリフにインテリジェントに分解します
- キャラクター、ロケーション、感情、カメラ言語を自動検出します
- 複数エピソード / 複数幕の脚本構成をサポートします

<img width="1384" height="835" alt="脚本解析" src="https://github.com/user-attachments/assets/e42266c2-aaeb-4cc3-a734-65516774d495" />

### 🎭 キャラクター一貫性システム
- **6 層のアイデンティティアンカリング**: 異なるショット間でもキャラクターの外見の一貫性を保ちます
- キャラクターバイブルの管理
- キャラクター参照画像の紐付け

<img width="1384" height="835" alt="キャラクターシステム" src="https://github.com/user-attachments/assets/763e6ced-43e2-4c7b-a5ea-b13535af5b2e" />

### 🖼️ シーン生成
- 複数視点の同時画像生成
- シーンの説明からビジュアルプロンプトへの自動変換

<img width="1384" height="835" alt="シーン生成" src="https://github.com/user-attachments/assets/f301d91e-c826-499f-b3dd-79e69613a5e8" />

### 🎞️ プロフェッショナルなストーリーボードシステム
- 映画的なカメラパラメータ (ショットサイズ、アングル、カメラの動き)
- 自動レイアウトとエクスポート
- ワンクリックでのビジュアルスタイル切り替え (2D / 3D / 実写風 / ストップモーションなど)

<img width="1602" height="835" alt="ストーリーボードシステム" src="https://github.com/user-attachments/assets/94562cee-3827-4645-82fe-2123fdd86897" />

### 🚀 バッチ制作ワークフロー
- **ワンクリックのフルパイプライン**: 脚本解析 → キャラクター/シーン生成 → ストーリーボード分割 → 画像のバッチ生成 → 動画のバッチ生成
- 失敗時の自動リトライ付きマルチタスク並列キュー
- ショートドラマ / アニメシリーズのバッチ制作向けに設計されています

### 🤖 マルチプロバイダー AI オーケストレーション
- 複数の AI 画像/動画生成プロバイダーをサポートします
- 負荷分散を伴う API キーのローテーション
- 自動リトライ付きのタスクキュー管理

## クイックスタート

### 必要環境

- **Node.js** >= 18
- **npm** >= 9

### インストールと実行

```bash
# Clone the repository
git clone https://github.com/MemeCalculate/moyin-creator.git
cd moyin-creator

# Install dependencies
npm install

# Start development mode
npm run dev
```

### API キーの設定

起動後、**Settings → API Configuration** を開き、AI プロバイダーの API キーを入力するとツールを使い始められます。

### ビルド

```bash
# Compile + package Windows installer
npm run build

# Compile only (no packaging)
npx electron-vite build
```

## アーキテクチャ

| レイヤー | 技術 |
|-------|-----------|
| デスクトップフレームワーク | Electron 30 |
| フロントエンド | React 18 + TypeScript |
| ビルドツール | electron-vite (Vite 5) |
| 状態管理 | Zustand 5 |
| UI コンポーネント | Radix UI + Tailwind CSS 4 |
| AI コア | `@opencut/ai-core` (プロンプトのコンパイル、キャラクターバイブル、タスクのポーリング) |

### プロジェクト構成

```
moyin-creator/
├── electron/              # Electron main process + Preload
│   ├── main.ts            # Main process (storage, file system, protocol handling)
│   └── preload.ts         # Security bridge layer
├── src/
│   ├── components/        # React UI components
│   │   ├── panels/        # Main panels (Script, Character, Scene, Storyboard, Director)
│   │   └── ui/            # Base UI component library
│   ├── stores/            # Zustand global state
│   ├── lib/               # Utilities (AI orchestration, image management, routing)
│   ├── packages/          # Internal packages
│   │   └── ai-core/       # AI core engine
│   └── types/             # TypeScript type definitions
├── build/                 # Build resources (icons)
└── scripts/               # Utility scripts
```

## ライセンス

このプロジェクトは **デュアルライセンス** モデルを採用しています。

### オープンソース — AGPL-3.0

このプロジェクトは [GNU AGPL-3.0](LICENSE) ライセンスのもとでオープンソース化されています。自由に使用、改変、配布できますが、改変したコードは同じライセンスのもとでオープンソース化する必要があります。

### 商用利用

クローズドソースでの利用や商用製品への組み込みが必要な場合は、[商用ライセンス](COMMERCIAL_LICENSE.md)についてお問い合わせください。

## コントリビューション

コントリビューションを歓迎します！詳細は [コントリビューションガイド](CONTRIBUTING.md) をお読みください。

## お問い合わせ

- 📧 メール: [memecalculate@gmail.com](mailto:memecalculate@gmail.com)
- 🐙 GitHub: [https://github.com/MemeCalculate/moyin-creator](https://github.com/MemeCalculate/moyin-creator)

---

<p align="center">Made with ❤️ by <a href="https://github.com/MemeCalculate">MemeCalculate</a></p>
