# **🚀 探索 AI 影视的下一代创作流 | [立即加入 waoowaoo在线网页版内测候补](https://www.waoowaoo.com/)**
<p align="center">
  <img src="public/banner.png" alt="waoowaoo" width="600">
</p>

<p align="center">
  <a href="#-quick-start">English</a> | <a href="#-快速开始">中文</a>
</p>

# waoowaoo AI 影视 Studio
>[!IMPORTANT]
>⚠️ **测试版声明**：本项目目前处于测试初期阶段，由于暂时只有我一个人开发，存在部分 bug 和不完善之处。我们正在快速迭代更新中，欢迎进群反馈问题和需求**请及时关注项目更新！目前更新会非常频繁，后续会增加大量新功能以及优化效果，我们的目标是成为行业最强AI工具！**！
> 
> ⚠️ **Beta Notice**: This project is currently in its early beta stage. As it is currently a solo-developed project, some bugs and imperfections are to be expected. We are iterating rapidly—please stay tuned for frequent updates! We are committed to rolling out a massive roadmap of new features and optimizations, with the ultimate goal of becoming the top-tier solution in the industry. Your feedback and feature requests are highly welcome!

<img width="1676" height="540" alt="chat" src="https://github.com/user-attachments/assets/30c6fcf6-b605-48da-a571-7b7aead3df8d" />
<img width="1676" height="540" alt="chat1" src="https://github.com/user-attachments/assets/40d583a2-223a-46d9-b96b-a966390d44f8" />

一款基于 AI 技术的短剧/漫画视频制作工具，支持从小说文本自动生成分镜、角色、场景，并制作成完整视频。

An AI-powered tool for creating short drama / comic videos — automatically generates storyboards, characters, and scenes from novel text, then assembles them into complete videos.

---

## ✨ 功能特性 / Features

| | 中文 | English |
|---|---|---|
| 🎬 | AI 剧本分析 - 自动解析小说，提取角色、场景、剧情 | AI Script Analysis - parse novels, extract characters, scenes & plot |
| 🎨 | 角色 & 场景生成 - AI 生成一致性人物和场景图片 | Character & Scene Generation - consistent AI-generated images |
| 📽️ | 分镜视频制作 - 自动生成分镜头并合成视频 | Storyboard Video - auto-generate shots and compose videos |
| 🎙️ | AI 配音 - 多角色语音合成 | AI Voiceover - multi-character voice synthesis |
| 🌐 | 多语言支持 - 中文 / 英文界面，右上角一键切换 | Bilingual UI - Chinese / English, switch in the top-right corner |

## 🚀 快速开始

**前提条件**：安装 [Docker Desktop](https://docs.docker.com/get-docker/)

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo
docker compose up -d
```

访问 [http://localhost:13000](http://localhost:13000) 开始使用！

> 首次启动会自动完成数据库初始化，无需任何额外配置。

> ⚠️ **如果遇到网页卡顿**：HTTP 模式下浏览器可能限制并发连接。可安装 [Caddy](https://caddyserver.com/docs/install) 启用 HTTPS：
> ```bash
> caddy run --config Caddyfile
> ```
> 然后访问 [https://localhost:1443](https://localhost:1443)

### 🔄 更新到最新版本

```bash
git pull
docker compose down && docker compose up -d --build
```

---

## 🚀 Quick Start

**Prerequisites**: Install [Docker Desktop](https://docs.docker.com/get-docker/)

```bash
git clone https://github.com/saturndec/waoowaoo.git
cd waoowaoo
docker compose up -d
```

Visit [http://localhost:13000](http://localhost:13000) to get started!

> The database is initialized automatically on first launch — no extra configuration needed.

> ⚠️ **If you experience lag**: HTTP mode may limit browser connections. Install [Caddy](https://caddyserver.com/docs/install) for HTTPS:
> ```bash
> caddy run --config Caddyfile
> ```
> Then visit [https://localhost:1443](https://localhost:1443)

### 🔄 Updating to the Latest Version

```bash
git pull
docker compose down && docker compose up -d --build
```

---

## 🔧 API 配置 / API Configuration

启动后进入**设置中心**配置 AI 服务的 API Key，内置配置教程。

After launching, go to **Settings** to configure your AI service API keys. A built-in guide is provided.

> 💡 **推荐 / Recommended**: Tested with ByteDance Volcano Engine (Seedance, Seedream) and Google AI Studio (Banana). Text models currently require OpenRouter API.

---

## 📦 技术栈 / Tech Stack

- **Framework**: Next.js 15 + React 19
- **Database**: MySQL + Prisma ORM
- **Queue**: Redis + BullMQ
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js

## 📦 页面功能预览 / preview
![4f7b913264f7f26438c12560340e958c67fa833a](https://github.com/user-attachments/assets/fa0e9c57-9ea0-4df3-893e-b76c4c9d304b)
![67509361cbe6809d2496a550de5733b9f99a9702](https://github.com/user-attachments/assets/f2fb6a64-5ba8-4896-a064-be0ded213e42)
![466e13c8fd1fc799d8f588c367ebfa24e1e99bf7](https://github.com/user-attachments/assets/09bbff39-e535-4c67-80a9-69421c3b05ee)
![c067c197c20b0f1de456357c49cdf0b0973c9b31](https://github.com/user-attachments/assets/688e3147-6e95-43b0-b9e7-dd9af40db8a0)


## 🤝 参与方式 / Contributing

本项目由核心团队独立维护。欢迎你通过以下方式参与：

- 🐛 提交 [Issue](https://github.com/waoowaooAI/waoowaoo/issues) 反馈 Bug
- 💡 提交 [Issue](https://github.com/waoowaooAI/waoowaoo/issues) 提出功能建议
- 🔧 提交 Pull Request 供参考 — 我们会认真审阅每一个 PR 的思路，但最终由团队自行实现修复，不会直接合并外部 PR

This project is maintained by the core team. You're welcome to contribute by:

- 🐛 Filing [Issues](https://github.com/waoowaooAI/waoowaoo/issues) — report bugs
- 💡 Filing [Issues](https://github.com/waoowaooAI/waoowaoo/issues) — propose features
- 🔧 Submitting Pull Requests as references — we review every PR carefully for ideas, but the team implements fixes internally rather than merging external PRs directly

---

**Made with ❤️ by waoowaoo team**

## Star History

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=waoowaooAI/waoowaoo&type=date&legend=top-left)](https://www.star-history.com/#waoowaooAI/waoowaoo&type=date&legend=top-left)
