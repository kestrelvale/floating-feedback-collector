#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PID_FILE="$DIR/server.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    kill -9 "$PID" 2>/dev/null || true
    echo "服务已停止 (PID: $PID)"
  fi
  rm -f "$PID_FILE"
fi

lsof -ti :8888 | xargs kill -9 2>/dev/null || true
echo "端口 8888 进程已清理完成"
