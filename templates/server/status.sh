#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PID_FILE="$DIR/server.pid"
LOG_FILE="$DIR/server.log"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "🟢 服务运行正常 (PID: $PID)"
    if [ -f "$LOG_FILE" ]; then
      cat "$LOG_FILE"
    fi
    exit 0
  fi
fi

if lsof -ti :8888 > /dev/null 2>&1; then
  echo "🟡 端口 8888 被其他进程占用，但 PID 文件未匹配。"
else
  echo "🔴 服务未运行。"
fi
exit 1
