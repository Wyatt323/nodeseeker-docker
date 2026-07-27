# NodeSeeker Docker 部署指南

> 本多用户版本基于 [ljnchn/nodeseeker-docker](https://github.com/ljnchn/nodeseeker-docker) 优化。

## 最简部署

只需创建一个目录并下载 `docker-compose.yml`，无需克隆仓库，也不会在部署服务器本地构建镜像。

```bash
mkdir -p nodeseeker
cd nodeseeker
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/Wyatt323/nodeseeker-docker/main/docker-compose.yml
mkdir -p data
docker compose up -d
```

Compose 会自动拉取：

```text
wyatt323/nodeseeker:latest
```

访问：

```text
http://服务器IP:3010
```

首次访问时创建网页管理员账户，然后在网页控制台设置 Telegram Bot Token、用户白名单和 Polling/Webhook 模式。

## 数据持久化

数据库位于部署目录：

```text
./data/nodeseeker.db
```

Compose 挂载关系：

```yaml
volumes:
  - ./data:/usr/src/app/data
```

更新或删除容器不会删除 `data/`。数据库文件已被项目 `.gitignore` 排除，不会上传到 GitHub。

## 更新镜像

```bash
cd nodeseeker
docker compose pull
docker compose up -d
```

`docker-compose.yml` 使用 `pull_policy: always`，启动时会检查最新镜像。

## 常用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f nodeseeker

# 重启
docker compose restart nodeseeker

# 停止并删除容器（保留 ./data）
docker compose down

# 健康检查
curl http://127.0.0.1:3010/health
```

## 备份与恢复

### 备份

建议在停止容器后备份 SQLite 数据：

```bash
docker compose stop nodeseeker
tar czf nodeseeker-data-$(date +%Y%m%d-%H%M%S).tar.gz data/
docker compose start nodeseeker
```

### 恢复

```bash
docker compose down
rm -rf data
mkdir -p data
tar xzf nodeseeker-data-YYYYMMDD-HHMMSS.tar.gz
docker compose up -d
```

## 可选环境变量

如需覆盖默认配置，可在 `docker-compose.yml` 同目录创建 `.env`：

```env
CORS_ORIGINS=http://localhost:3010
RSS_CHECK_ENABLED=true
TELEGRAM_WEBHOOK_SECRET=replace_with_a_long_random_value
```

Bot Token、Telegram 用户白名单和 RSS 设置推荐通过网页控制台管理。

## 故障排除

### 容器无法启动

```bash
docker compose logs nodeseeker
```

### 数据目录权限问题

```bash
mkdir -p data
chmod 755 data
```

### 确认使用的镜像

```bash
docker compose config --images
```

应输出：

```text
wyatt323/nodeseeker:latest
```
