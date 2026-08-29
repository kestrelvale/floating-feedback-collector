#!/usr/bin/env bash

# 悬浮反馈收集器一键安装到指定项目脚本
# 用法: bash install-to-project.sh [目标目录] [模式: local|online|hybrid] [端口] [远程URL]

TARGET_DIR="${1:-.}"
MODE="${2:-hybrid}"
PORT="${3:-8888}"
REMOTE_URL="${4:-http://localhost:${PORT}}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 正在向 ${TARGET_DIR} 安装 悬浮问题反馈收集器套件 (模式: ${MODE})..."

node "${SCRIPT_DIR}/cli/init.js" \
  --mode="${MODE}" \
  --target="${TARGET_DIR}" \
  --port="${PORT}" \
  --remote-url="${REMOTE_URL}" \
  --inject \
  --mcp \
  --yes

echo "==> 安装完成！"
