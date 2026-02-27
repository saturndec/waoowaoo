<p align="center">
  <img src="public/banner.png" alt="waoowaoo" width="600">
</p>

<p align="center">
  <a href="#-quick-start">English</a> | <a href="#-快速开始">中文</a>
</p>

# waoowaoo AI 影视 Studio

> ⚠️ **测试版声明**：本项目目前处于测试初期阶段，由于暂时只有我一个人开发，存在部分 bug 和不完善之处。我们正在快速迭代更新中，欢迎进群反馈问题和需求！
>
> ⚠️ **Beta Notice**: This project is in early beta. It's currently solo-developed, so bugs and rough edges exist. We're iterating fast — feel free to open an Issue!

<img width="1676" height="540" alt="chat" src="https://github.com/user-attachments/assets/30c6fcf6-b605-48da-a571-7b7aead3df8d" />

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

---

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
git fetch origin && git reset --hard origin/main
docker compose down && docker compose up -d --build
```

### 🌍 服务器一键部署（域名 + Caddy 自动反代）

适用于 Linux 服务器（Debian/Ubuntu 可自动安装 Caddy）：

```bash
bash scripts/deploy-with-caddy.sh --domain your-domain.com --email you@example.com
```

部署完成后访问：

- `https://your-domain.com`
- `https://your-domain.com/admin/queues`

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
git fetch origin && git reset --hard origin/main
docker compose down && docker compose up -d --build
```

### 🌍 One-Click Server Deploy (Domain + Caddy Reverse Proxy)

For Linux servers (Debian/Ubuntu can auto-install Caddy):

```bash
bash scripts/deploy-with-caddy.sh --domain your-domain.com --email you@example.com
```

After deployment:

- `https://your-domain.com`
- `https://your-domain.com/admin/queues`

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

---

## 🤝 反馈 / Feedback

暂不接受 Pull Request，如有问题或建议，欢迎提交 [Issue](https://github.com/saturndec/waoowaoo/issues)！

Pull Requests are not accepted at this time. For bugs or suggestions, please open an [Issue](https://github.com/saturndec/waoowaoo/issues).

---

**Made with ❤️ by waoowaoo team**
