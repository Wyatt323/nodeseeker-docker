> **本项目是基于 [ljnchn/nodeseeker-docker](https://github.com/ljnchn/nodeseeker-docker) 优化开发的多用户版本。**

# NodeSeeker Docker 多用户版

[![Docker Build](https://github.com/Wyatt323/nodeseeker-docker/actions/workflows/docker-build.yml/badge.svg)](https://github.com/Wyatt323/nodeseeker-docker/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Hub](https://img.shields.io/docker/v/wyatt323/nodeseeker?label=Docker%20Hub)](https://hub.docker.com/r/wyatt323/nodeseeker)
[![Bun](https://img.shields.io/badge/Bun-1.0+-ff69b4.svg)](https://bun.sh/)

基于 **Bun + Hono.js + SQLite** 的 NodeSeek 社区 RSS 监控与 Telegram 推送系统。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔄 自动 RSS 抓取 | 定时抓取 NodeSeek 社区 RSS，支持自定义间隔与代理 |
| 🎯 智能关键词匹配 | 多关键词组合 + 正则表达式，按创建者/分类过滤 |
| 📱 Telegram 多用户推送 | 白名单内每位用户独立关键词、暂停状态、失败重试与单独推送 |
| 🤖 Bot 关键词管理 | 用户可通过 `/add`、`/list`、`/del` 管理自己的关键词 |
| 🌐 Web 控制台 | RESTful API + 可视化管理界面 |
| 🔐 安全认证 | JWT 认证 + 密码加密存储 |
| 📊 实时统计 | 推送统计与系统监控 |
| 📲 PWA 支持 | 离线访问、安装到桌面、推送通知 |

## 🚀 快速开始

### Docker 部署（推荐）

```bash
docker run -d \
  --name nodeseeker \
  -p 3010:3010 \
  -v "$(pwd)/data:/usr/src/app/data" \
  wyatt323/nodeseeker:latest
```

访问 http://localhost:3010，首次使用时创建管理员账户即可。

### Docker Compose

只需要创建部署目录并下载一个 `docker-compose.yml`，无需克隆整个仓库。Compose 会直接拉取 GitHub Actions 构建的多架构镜像 `wyatt323/nodeseeker:latest`。

```bash
mkdir -p nodeseeker
cd nodeseeker
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/Wyatt323/nodeseeker-docker/main/docker-compose.yml
mkdir -p data
docker compose up -d
```

数据库会持久化到当前项目目录的 `./data/nodeseeker.db`，删除或更新容器不会丢失数据。备份时直接备份 `data/` 目录即可。

> 生产环境请使用 `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`，详见 [Docker 部署文档](docs/Docker.md)。

### 本地开发

```bash
# 安装依赖（需要 Bun 1.0+）
bun install

# 配置环境变量
cp .env.example .env

# 启动开发服务器（热重载）
bun run dev
```

<details>
<summary>更多开发命令</summary>

```bash
bun run dev          # 开发模式（热重载）
bun run build        # 构建项目
bun run start        # 生产模式
bun run db:migrate   # 数据库迁移
bun test             # 运行测试
```

</details>

## ⚙️ 配置

无需任何环境变量即可运行，**开箱即用**。可选配置见 [.env.example](.env.example)：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3010` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `CORS_ORIGINS` | `http://localhost:3010` | 允许的跨域源 |
| `RSS_CHECK_ENABLED` | `true` | 是否启用定时抓取 |
| `RSS_TIMEOUT` | `10000` | RSS 请求超时（ms） |

> **RSS 源地址、抓取间隔、代理** 等配置已迁移到数据库，可在 Web 控制台 → **基础设置** 中动态修改。

## 🔧 初始化配置

1. 访问 http://localhost:3010，创建管理员账户
2. **配置 Telegram Bot 与用户白名单**（可选）：
   - 在 Telegram 中通过 [@BotFather](https://t.me/BotFather) 创建 Bot 并获取 Token
   - 控制台 → Telegram：填写 Bot Token
   - 在“允许使用 Bot 的 Telegram ID”中填写多个 ID（逗号、空格或换行分隔）
   - 推荐选择 **Polling**，不需要公网 HTTPS 域名；服务重启后会自动恢复 Polling
   - 使用 Webhook 时，建议在 `.env` 设置 `TELEGRAM_WEBHOOK_SECRET`，系统会校验 Telegram secret token
   - 每位白名单用户私聊 Bot 发送 `/start`，之后只能看到和修改自己的关键词
3. **配置 RSS 源**（可选）：
   - 控制台 → 基础设置 → RSS 抓取设置
   - 可修改源地址、间隔、代理，支持 **测试连接**

## 🤖 Telegram Bot 命令

| 命令 | 说明 |
|------|------|
| `/start` | 白名单用户启用自己的独立订阅空间 |
| `/getme` | 查看自己的 Telegram ID 和授权状态 |
| `/commands` / `/help` | 显示 Bot 的全部命令 |
| `/list` | 直接列出自己添加的全部关键词，不显示内部 ID |
| `/add 关键词1 关键词2 关键词3` | 按空格识别并添加 1 至 3 个独立关键词 |
| `/del 具体关键词` | 按关键词删除，只影响自己的订阅 |
| `/post` | 查看最近文章 |
| `/stop` / `/resume` | 只暂停 / 恢复自己的推送 |
| `/unbind` | 清除自己的运行时绑定 |

<details>
<summary>关键词匹配格式</summary>

**普通字符串**：`JavaScript` — 匹配包含该文本的内容

**正则表达式**：
- `/javascript/i` — 不区分大小写
- `/\d{4}年/` — 匹配 4 位数字 + "年"
- `regex:新特性|特性` — `regex:` 前缀

```bash
# 示例
/add 你好 我号 大家好          # 识别为“你好”“我号”“大家好”三个关键词
/del 我号                     # 删除具体关键词
/add /javascript/i React       # 混合使用
/add regex:AI|人工智能 深度学习    # regex: 前缀
/add /\d+\.?\d*GB/ 内存         # 匹配规格
```

</details>

## 🐳 GitHub Actions 发布到 Docker Hub

仓库已包含 `.github/workflows/docker-build.yml`：Pull Request 会执行测试和构建；推送到 `main` 或 `v*` 标签时，会构建 `linux/amd64` 与 `linux/arm64` 镜像并推送 Docker Hub。

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 值 |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub 用户名 |
| `DOCKERHUB_TOKEN` | Docker Hub 的 Access Token（不要使用账号密码） |

默认镜像名是 `<DOCKERHUB_USERNAME>/nodeseeker`。`main` 会发布 `latest` 和 `sha-*`；`v1.2.3` 标签还会发布 `v1.2.3`、`1.2.3`、`1.2`。

## 📁 项目结构

```
src/
├── config/          # 配置文件
├── components/      # React 组件
├── database/        # 数据库迁移
├── routes/          # API 路由
├── services/        # 业务逻辑服务
├── types/           # TypeScript 类型
└── utils/           # 工具函数
```

## 🔧 故障排除

| 问题 | 解决方案 |
|------|----------|
| 端口冲突 | 修改 `.env` 中的 `PORT` |
| 数据库权限 | 确保 `data/` 目录有写权限 |
| Telegram Bot 无响应 | 检查 Token 并发送 `/start` 绑定 |
| RSS 抓取失败 | 检查网络 / RSS 源可用性 / 代理设置 |
| RSS 配置不生效 | 修改间隔后点击 **重启任务** |

```bash
# 诊断命令
docker-compose logs nodeseeker    # 查看日志
curl http://localhost:3010/health # 健康检查
```

## 📚 更多文档

| 文档 | 说明 |
|------|------|
| [Docker 部署指南](docs/Docker.md) | 详细的 Docker / Compose / 生产部署说明 |
| [API 文档](API.md) | 完整的 RESTful API 接口文档 |
| [PWA 文档](PWA.md) | PWA 功能、离线缓存、推送通知 |
| [PWA 快速入门](PWA-QUICKSTART.md) | PWA 安装与验证 |

## 🙏 技术栈

[Bun](https://bun.sh/) · [Hono.js](https://hono.dev/) · [SQLite](https://sqlite.org/) · [grammY](https://grammy.dev/)

## 📄 许可证

[MIT](LICENSE)
