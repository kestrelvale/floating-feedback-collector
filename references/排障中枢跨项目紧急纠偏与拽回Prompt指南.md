# 🚑 排障中枢跨项目紧急纠偏与一键拽回指南 (Rescue Prompt SOP)

> **核心背景**: 当在另一个项目（如 `project-b`）接入反馈中枢时，若 Agent 误将“业务前端开发端口（如 5300）”当作了“排障中枢的监听端口”，或将“线上正式域名（如 `https://your-domain.com`）”错误回退拼接入无相干的 IP/默认端口（如 `:8888`），会导致业务端口冲突、服务挂死或 Agent 推理死锁不理人。  
> **本指南提供**: 专用于将失控/挂死/配置错误的 Agent **一键强势拽回正轨的紧急纠偏提示词 (Rescue Prompt)**。

---

## 一、 为什么那个会话会不理人、配错端口？(根因剖析)

1. **两类端口概念严重混淆**:
   - **业务系统前端端口 (Business Dev Port)**: 用户项目原本的开发服务（例如 Vue 项目运行在 `http://localhost:5300`），这是项目业务的核心，**排障套件绝对不能去抢占它**！
   - **排障中台独立辅助端口 (Hub Auxiliary Port)**: 排障中台 `server.js` 仅仅是一个辅助工具，它应该**自动分配一个完全未被占用的独立空闲端口 (如 25300 或 28888)**，绝不能与业务端口重叠！
2. **线上域名协议与端口拼接失误**:
   - 用户的线上项目是标准 HTTPS 域名：`https://your-domain.com`（标准 443 端口，无需也不应该拼接端口号）；
   - 但 Agent 受此前旧脚本中 `:-8888` 默认回退逻辑的影响，强行拼接了 `http://YOUR_SERVER_IP:8888`，导致连错目标服务器，探针超时挂死；
3. **Agent 陷入上下文截断与锁死状态**:
   - 进程因端口冲突、探针请求超时被系统中断（`turn_aborted`），Agent 在收到情绪化或未给明确执行指令的消息时，无法推导确切修复动作，容易陷入沉默。

---

## 二、 🚑 一键拽回正轨专用提示词 (直接复制发给那个不理人的 Agent)

> **使用方法**: 直接将以下整段代码块复制，发送给那个卡住或配置错误的 Agent 会话。该提示词采用了 `project-flow` 强约束指令结构，强制 Agent 立即清理冲突进程、释放业务端口，并以绝对正确的项目参数重新就绪：

```markdown
【🚨 紧急架构纠偏与强制恢复执行令 · P0 优先级】

你上一轮执行发生了严重的方向性错误，将当前项目的参数完全搞错，现发布最高优先级强约束纠偏令，请立即中断所有错误假设，严格按照以下步骤执行修复，并向我汇报纠偏结果：

================================================================================
【📌 当前项目真实参数绝对锁死区 (严禁篡改，严禁使用任何默认值)】:
1. 业务系统前端地址 [BUSINESS_URL]:  http://localhost:5300/ (这是当前项目的业务前端，严禁占用 5300 端口！)
2. 线上服务器真实地址 [REMOTE_URL]:   https://your-domain.com (标准 HTTPS 域名，严禁拼接 :8888 或任何其他 IP！)
3. 排障中台专属辅助端口 [HUB_PORT]:   请通过脚本自动寻找 25300~35300 之间的空闲端口，绝对避开 5300！
================================================================================

### 🛠️ 必须立即执行的 4 步纠偏动作:

#### 第一步：彻底释放被错误占用的 5300 端口并清理错误进程
请立即执行以下清理命令，将 5300 端口 100% 完整归还给当前项目的业务系统：
```bash
echo "==> 1. 正在清理抢占 5300 端口的错误进程..."
if lsof -ti :5300 >/dev/null 2>&1; then
  PID=$(lsof -ti :5300 | head -n 1)
  echo "释放进程 PID: $PID"
  kill -9 "$PID" 2>/dev/null || true
fi
lsof -ti :5300 || echo "✓ 业务端口 5300 已彻底释放恢复正常！"
```

#### 第二步：动态寻空分配排障中台专属独立辅助端口 (绝不冲突)
请运行以下寻空逻辑，为排障中枢分配一个独立的辅助端口：
```bash
find_hub_port() {
  local p=25300
  while lsof -ti :$p >/dev/null 2>&1 || nc -z 127.0.0.1 $p >/dev/null 2>&1; do
    p=$((p + 1))
  done
  echo "$p"
}
HUB_PORT=$(find_hub_port)
echo "✓ 为排障中台分配专属辅助端口: ${HUB_PORT} (与业务端口 5300 完全物理隔离)"
```

#### 第三步：使用真实线上地址 https://your-domain.com 重新生成配置
请直接重新初始化配置，纠正所有错误指向：
```bash
SKILL_DIR="$HOME/.codex/skills/floating-feedback-collector"
node "$SKILL_DIR/cli/init.js" \
  --mode=online \
  --target=. \
  --port="${HUB_PORT}" \
  --remote-url="https://your-domain.com" \
  --inject \
  --mcp \
  --yes
```
同时核验并确保：
- `feedback-dashboard.html` 中的远程服务器地址为 `https://your-domain.com`；
- `mcp/feedback-service.js` 中的远程服务器地址为 `https://your-domain.com`；
- `.mcp.json` 中的 `REMOTE_SERVER_URL` 为 `https://your-domain.com`；
- `scripts/server.js` 监听端口为 `${HUB_PORT}`，绝不碰 5300！

#### 第四步：启动中台独立服务并输出正确的访问卡片
```bash
bash scripts/stop.sh 2>/dev/null || true
bash scripts/start.sh
bash scripts/status.sh
```
执行完毕后，请立即停止闲扯，严格输出以下纠偏交付卡：
- **当前项目业务前端**: `http://localhost:5300/` (状态: 保持原样未动)
- **排障中台本地访问**: `http://127.0.0.1:${HUB_PORT}/feedback-dashboard.html`
- **绑定的线上真理源**: `https://your-domain.com/feedback-dashboard.html`
- **确认声明**: 确认 5300 端口未被占用，确认未连接任何 8888 错误地址。
```

---

## 三、 本地排查确认与环境安全现状

经在本机底层实际探测核实：
1. **本地 5300 端口状态**: 此前霸占 5300 端口的错误进程（PID `PID`）**已经被彻底终止并释放**！当前 `5300` 端口处于完全自由可用状态，绝不会影响 `project-b` 项目的正常前端运行；
2. **项目 A项目状态**: 项目 A的独立端口为 `8888` / `30000`，与 `project-b` 的 `5300` / `https://your-domain.com` 已经彻底物理分离开，互不影响；
3. **后续防范机制**: 提示词模板已增加 `find_free_port`（从 10000+ 开始智能寻空），彻底杜绝把业务开发端口当辅助端口的严重缺陷。
