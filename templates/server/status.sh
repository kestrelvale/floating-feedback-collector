#!/bin/bash
ACTIVE_PID=$(lsof -ti :8888 2>/dev/null | head -n 1 | tr -d '[:space:]')
if [ -n "$ACTIVE_PID" ]; then
  echo "🟢 本地排障服务运行正常 (PID: ${ACTIVE_PID}，端口: 8888)"
  echo "👉 访问首页: http://localhost:8888"
  echo "🖼️ 视觉大盘: http://localhost:8888/feedback-dashboard.html"
  exit 0
else
  echo "🔴 本地服务未运行。请运行 ./start.sh 或 bash scripts/start.sh 启动服务。"
  exit 1
fi
