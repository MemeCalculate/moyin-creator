<p align="center">
  <img src="build/icon.png" width="120" alt="魔因漫创 Logo" />
</p>
<img width="512" height="512" alt="icon" src="https://github.com/user-attachments/assets/2f27bf9a-82c9-4d06-904c-1bbb507d8c81" />
<img src="https://github.com/user-attachments/assets/2f27bf9a-82c9-4d06-904c-1bbb507d8c81" width="120" alt="魔因漫创 Logo" />
<h1 align="center">魔因漫创 Moyin Creator</h1>

<p align="center">
  <strong>🎬 AI 影视生产级工具 · 支持 Seedance 2.0 · 剧本到成片全流程批量化</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/releases"><img src="https://img.shields.io/github/v/release/MemeCalculate/moyin-creator" alt="Release" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/stargazers"><img src="https://img.shields.io/github/stars/MemeCalculate/moyin-creator" alt="Stars" /></a>
</p>

<p align="center">
  <strong>🇨🇳 中文</strong> | <a href="README_EN.md">🇬🇧 English</a>
</p>

<p align="center">
  <a href="docs/WORKFLOW_GUIDE.md"><strong>📖 工作流教程</strong></a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#技术架构">技术架构</a> •
  <a href="#许可证">许可证</a> •
  <a href="#贡献">贡献</a>
</p>

---

<!-- 截图占位：后续替换为实际截图
<p align="center">
  <img src="docs/images/screenshot.png" width="800" alt="Screenshot" />
</p>
-->

![1771428968476_3nkjdd](https://github.com/user-attachments/assets/582ee70f-f0dc-433b-9d5c-2ddb8f463450)

## 简介

**魔因漫创** 是一款面向 AI 影视创作者的生产级工具。五大板块环环相扣，覆盖从剧本到成片的完整创作链路：

> **📝 剧本 → 🎭 角色 → 🌄 场景 → 🎬 导演 → ⭐ S级（Seedance 2.0）**

每一步的产出自动流入下一步，无需手动搅合。支持多种主流 AI 大模型，适合短剧、动漫番剧、预告片等场景的批量化生产。


基础设置教程：https://www.bilibili.com/video/BV1FsZDBHExJ/?vd_source=802462c0708e775ce81f95b2e486f175


## 功能特性

### ⭐ S级板块 — Seedance 2.0 多模态创作
- **多镜头合并叙事视频生成**：将多个分镜分组合并生成连贯叙事视频
- 支持 @Image / @Video / @Audio 多模态引用（角色参考图、场景图、首帧图自动收集）
- 智能提示词构建：自动三层融合（动作 + 镜头语言 + 对白唇形同步）
- 首帧图网格拼接（N×N 策略）
- Seedance 2.0 参数约束自动校验（≤9图 + ≤3视频 + ≤3音频，prompt≤5000字符）
- <img width="578" height="801" alt="eecf9d3e210cb52066025a0d1b48b54" src="https://github.com/user-attachments/assets/34b623a3-9be9-4eb5-ae52-a6a9553598ea" />
<img width="584" height="802" alt="59e57c230f67e2c5aaa425a09332d2e" src="https://github.com/user-attachments/assets/54c6036b-c545-45c0-a32b-de71b8138484" />

<img width="1602" height="835" alt="1b23b9abde0cc651ecb06d49576119b" src="https://github.com/user-attachments/assets/2b5af973-98c9-4708-bf53-02d11321d86d" />

### 🎬 剧本解析引擎
- 智能拆解剧本为场景、分镜、对白
- 自动识别角色、场景、情绪、镜头语言
- 支持多集/多幕剧本结构
<img width="1384" height="835" alt="d37f36356961edcda06edee6382d2fe" src="https://github.com/user-attachments/assets/e42266c2-aaeb-4cc3-a734-65516774d495" />

### 🎭 角色一致性系统
- **6层身份锚点**：确保同一角色在不同分镜中外观一致
- 角色圣经 (Character Bible) 管理
- 支持角色参考图绑定
<img width="1384" height="835" alt="ffcddeeda0e1aa012529ed26c850a65" src="https://github.com/user-attachments/assets/763e6ced-43e2-4c7b-a5ea-b13535af5b2e" />

### 🖼️ 场景生成
- 多视角联合图生成
- 场景描述到视觉提示词的自动转换
<img width="1384" height="835" alt="8a5f019882995cd573b614d1e403ab3" src="https://github.com/user-attachments/assets/f301d91e-c826-499f-b3dd-79e69613a5e8" />

### 🎞️ 专业分镜系统
- 电影级摄影参数（景别、机位、运动方式）
- 自动排版和导出
- 视觉风格一键切换（2D/3D/写实/定格等）
<img width="1602" height="835" alt="916ad7c32920260c7f3ac89fbeb8f30" src="https://github.com/user-attachments/assets/94562cee-3827-4645-82fe-2123fdd86897" />

### 🚀 批量化生产工作流
- **一键全流程**：剧本解析 → 角色/场景生成 → 分镜切割 → 批量生图 → 批量生视频
- 多任务并行队列，自动重试失败任务
- 适合短剧/动漫番剧批量生产

### 🤖 多供应商 AI 调度
- 支持多个 AI 图像/视频生成服务商
- API Key 轮询负载均衡
- 任务队列管理，自动重试
### 下载
打包程序版本0.1.7，对应开源源码
链接: https://pan.baidu.com/s/1ImH6tOIiuFxIDXC0fC-6Lg 提取码: 8888 


## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/MemeCalculate/moyin-creator.git
cd moyin-creator

# 安装依赖
npm install

# 启动开发模式
npm run dev
```

### 配置 API Key

启动后，进入 **设置 → API 配置**，填入你的 AI 服务商 API Key 即可开始使用。

### 构建

```bash
# 编译 + 打包 Windows 安装程序
npm run build

# 仅编译（不打包）
npx electron-vite build
```

## 技术架构

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 30 |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | electron-vite (Vite 5) |
| 状态管理 | Zustand 5 |
| UI 组件 | Radix UI + Tailwind CSS 4 |
| AI 核心 | `@opencut/ai-core`（提示词编译、角色圣经、任务轮询） |

### 项目结构

```
moyin-creator/
├── electron/              # Electron 主进程 + Preload
│   ├── main.ts            # 主进程（存储管理、文件系统、协议处理）
│   └── preload.ts         # 安全桥接层
├── src/
│   ├── components/        # React UI 组件
│   │   ├── panels/        # 主面板（剧本、角色、场景、分镜、导演）
│   │   └── ui/            # 基础 UI 组件库
│   ├── stores/            # Zustand 全局状态
│   ├── lib/               # 工具库（AI 调度、图片管理、路由）
│   ├── packages/          # 内部包
│   │   └── ai-core/       # AI 核心引擎
│   └── types/             # TypeScript 类型定义
├── build/                 # 构建资源（图标）
└── scripts/               # 工具脚本
```

## 许可证

本项目采用 **双重许可** 模式：

### 开源使用 — AGPL-3.0

本项目以 [GNU AGPL-3.0](LICENSE) 许可证开源。你可以自由使用、修改和分发，但修改后的代码必须以相同许可证开源。

### 商业使用

如果你需要闭源使用或集成到商业产品中，请联系我们获取 [商业许可](COMMERCIAL_LICENSE.md)。

## 贡献

欢迎贡献！请阅读 [贡献指南](CONTRIBUTING.md) 了解详情。

## 联系

- 📧 Email: [memecalculate@gmail.com](mailto:memecalculate@gmail.com)
- 🐙 GitHub: [https://github.com/MemeCalculate/moyin-creator](https://github.com/MemeCalculate/moyin-creator)

### 联系我们

<img src="https://github.com/user-attachments/assets/c7db8599-e763-4616-a891-c9177b6eed74" width="200" alt="交流群" />

<img src="docs/images/wechat-contact.png" width="200" alt="微信联系" />


---

<p align="center">Made with ❤️ by <a href="https://github.com/MemeCalculate">MemeCalculate</a></p>










