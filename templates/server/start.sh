#!/bin/bash
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
ROOT_DIR="$( cd "$DIR/.." >/dev/null 2>&1 && pwd )"
PID_FILE="$DIR/server.pid"
LOG_FILE="$DIR/server.log"

if lsof -ti :8888 > /dev/null 2>&1; then
  PID=$(lsof -ti :8888 | head -n 1)
  echo "🟢 本地服务已在运行中 (PID: $PID)"
  echo "👉 访问地址: http://localhost:8888"
  echo "🖼️ 视觉大盘: http://localhost:8888/feedback-dashboard.html"
  exit 0
fi

python3 -c "
import subprocess
p = subprocess.Popen(['node', '$DIR/server.js'], stdout=open('$LOG_FILE', 'w'), stderr=subprocess.STDOUT, start_new_session=True)
with open('$PID_FILE', 'w') as f:
    f.write(str(p.pid))
with open('$ROOT_DIR/server.pid', 'w') as f:
    f.write(str(p.pid))
"

sleep 0.8
if lsof -ti :8888 > /dev/null 2>&1; then
  PID=$(lsof -ti :8888 | head -n 1)
  echo "🚀 本地开发服务启动成功！(PID: $PID)"
  cat "$LOG_FILE"
else
  echo "❌ 服务启动失败，请查看日志: $LOG_FILE"
fi
