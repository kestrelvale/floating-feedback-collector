#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"

lsof -ti :8888 | xargs kill -9 2>/dev/null || true
rm -f "$ROOT_DIR/server.pid" "$DIR/server.pid" 2>/dev/null || true
echo "🛑 本地服务已安全停止。"
