#!/usr/bin/env bash
# Chengxi Baby Log · 服务端一键部署
# 在本机 ~/workspace/newborn-app/server/ 下执行：./deploy.sh
# 做的事：
#   1. 构建 web 客户端
#   2. 同步 web 产物 + compose 文件 + pb_hooks 到 VPS
#   3. compose 启动（旧单容器 pocketbase 会被同名接管，数据卷原样保留）
#   4. 更新宿主机 nginx（/ 走 web，/api/ 与 /_/ 走 PocketBase），旧配置自动备份
#   5. 验证
set -euo pipefail

VPS=vps
REMOTE_DIR=/home/muse/babylog
WEB_DIST=/opt/babylog/web-dist
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> 1/5 构建 web 客户端"
cd "$APP_DIR/web"
if [ ! -d node_modules ]; then npm install --no-audit --no-fund; fi
npm run build

echo "==> 2/5 同步文件到 VPS"
ssh "$VPS" "mkdir -p $REMOTE_DIR $WEB_DIST /home/muse/pocketbase/pb_hooks /home/muse/pocketbase/data && sudo -n chmod 755 /opt/babylog"
rsync -az --delete --chmod=D755,F644 "$APP_DIR/web/dist/" "$VPS:$WEB_DIST/"
rsync -az "$SCRIPT_DIR/docker-compose.yml" "$SCRIPT_DIR/nginx-web.conf" "$VPS:$REMOTE_DIR/"
rsync -az "$APP_DIR/pb_hooks/" "$VPS:/home/muse/pocketbase/pb_hooks/"

echo "==> 3/5 compose 启动服务"
ssh "$VPS" "
  set -e
  cd $REMOTE_DIR
  # 迁移：若存在旧的单容器 pocketbase（非 compose 管理），停掉它，compose 用同名接管
  if sudo -n docker ps --format '{{.Names}}' | grep -qx pocketbase; then
    if ! sudo -n docker inspect pocketbase --format '{{index .Config.Labels \"com.docker.compose.project\"}}' 2>/dev/null | grep -q .; then
      echo '  停掉旧单容器 pocketbase，改由 compose 管理（数据卷不变）'
      sudo -n docker stop pocketbase >/dev/null && sudo -n docker rm pocketbase >/dev/null
    fi
  fi
  sudo -n docker-compose up -d
  sudo -n docker-compose restart pocketbase >/dev/null  # 确保 pb_hooks 重新加载
  sudo -n docker-compose ps
"

echo "==> 4/5 更新宿主机 nginx"
rsync -az "$SCRIPT_DIR/host-pb.conf" "$VPS:/tmp/pb.conf.new"
ssh "$VPS" "
  set -e
  sudo -n cp /etc/nginx/conf.d/pb.conf /etc/nginx/conf.d/pb.conf.bak.\$(date +%Y%m%d%H%M%S)
  sudo -n cp /tmp/pb.conf.new /etc/nginx/conf.d/pb.conf
  sudo -n nginx -t && sudo -n nginx -s reload
  echo '  nginx 已重载'
"

echo "==> 5/5 验证"
sleep 3
curl -sk -o /dev/null -w '  web 首页 https://kids.appifa.com/            -> %{http_code}\n' https://kids.appifa.com/
curl -sk -o /dev/null -w '  PB API  https://kids.appifa.com/api/health   -> %{http_code}\n' https://kids.appifa.com/api/health
curl -sk -o /dev/null -w '  PB 后台 https://kids.appifa.com/_/            -> %{http_code}\n' https://kids.appifa.com/_/
echo "完成 ✅"
