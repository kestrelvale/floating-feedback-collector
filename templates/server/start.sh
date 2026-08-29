#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PID_FILE="$DIR/server.pid"
LOG_FILE="$DIR/server.log"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "服务已在运行中 (PID: $PID)"
    cat "$LOG_FILE"
    exit 0
  fi
fi

# Kill any process on port 8888
lsof -ti :8888 | xargs kill -9 2>/dev/null || true

python3 -c "
import subprocess
p = subprocess.Popen(['node', '$DIR/server.js'], stdout=open('$LOG_FILE', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
with open('$PID_FILE', 'w') as f:
    f.write(str(p.pid))
"

sleep 0.5
if [ -f "$PID_FILE" ] && ps -p $(cat "$PID_FILE") > /dev/null 2>&1; then
  echo "服务启动成功！"
  cat "$LOG_FILE"
else
  echo "服务启动失败，请查看日志: $LOG_FILE"
fi
