# Chengxi Baby Log · 服务端架构（2026-10-17 升级）

## 一句话
`./deploy.sh` 一键完成：构建 web → 同步到 VPS → compose 启动 → 更新宿主机 nginx → 验证。

## 组成

```
kids.appifa.com (443, SNI 分流 → 127.0.0.1:11443, 宿主机 nginx, Let's Encrypt)
├── /            → babylog-web (127.0.0.1:18080, nginx:alpine, 托管 web 客户端 SPA)
├── /api/       → pocketbase  (127.0.0.1:8090, 含 realtime SSE：关缓冲、长连接)
└── /_/         → pocketbase  (管理后台)
```

| 服务 | 镜像 | 数据 |
|---|---|---|
| pocketbase | ghcr.io/muchobien/pocketbase:latest | /home/muse/pocketbase/data（bind，原容器迁移，数据无缝保留） |
| web | nginx:alpine | /opt/babylog/web-dist（只读挂载；放 /opt 是因为家目录 750 会导致容器内 nginx 403） |

## 客户端

| 端 | 技术 | 数据策略 |
|---|---|---|
| Android App（`app/`） | Expo RN + 本地 SQLite + 同步队列 | 离线优先，后台同步 |
| Web（`web/`） | Vite + React + TS，直连 PocketBase | 在线直写；同域部署无跨域问题 |

两端共用同一套 PocketBase 字段映射（见 `web/src/lib/pb.ts`，与 App 的 `sync/engine.ts#toServerPayload` 对齐）。

## 运维备忘

- VPS 上 compose 用的是独立二进制 `/usr/local/bin/docker-compose`（v2.39.2），因为官方 apt 源没配、`docker compose` 插件装不上。
- pb_hooks 来自本仓库 `pb_hooks/`，deploy.sh 会同步到 `/home/muse/pocketbase/pb_hooks/` 并重启 pocketbase。
- 宿主机 nginx 配置变更前会自动备份到 `/etc/nginx/conf.d/pb.conf.bak.时间戳`。
- PocketBase 数据备份：`/home/muse/pocketbase-backup-*.tar.gz`（迁移前已做一次）。
