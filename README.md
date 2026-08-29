# 🐞 Floating Feedback Collector (悬浮问题反馈收集器套件)

> **企业级前端原型与 Web 系统的即插即用悬浮反馈收集器、可视化驾驶舱大盘与 AI Agent MCP 闭环排障工作流引擎。**  
> 打通 **“端侧轻量无感采集 ➔ 真实 DOM 离线快照 / 40 步操作轨迹 ➔ 可视化大盘治理 ➔ AI Agent 通过 MCP 协议自动化闭环排障”** 全链路。

---

## 🌟 核心能力架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 前端采集 SDK (feedback-collector.js + html2canvas)                        │
│    • 📸 视口 DOM 真实快照（打开反馈前自动截取，支持 Lightbox 放大预览）         │
│    • 👣 40 步全景用户操作日志（点击/输入/页面流转/控制台错误自动捕获）           │
│    • 📱 移动端极致适配（42px 磨砂圆球，手势吸边与滚动自动半折叠避让）             │
│    • 🌟 Tour 漫游引导（3 步聚光灯镂空高亮与暗黑玻璃拟态引导，视口安全约束）     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/feedback/save (支持离线缓存)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 轻量 Node.js API 中枢 (scripts/server.js)                                │
│    • 原生纯标准库实现，零第三方重量依赖，跨域 CORS 支持与物理图片静态托管      │
│    • 提供 /api/feedback/list, /api/feedback/save, /api/feedback/resolve 等   │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 3. 可视化大盘 (feedback-dashboard.html)│  │ 4. MCP 排障服务 (mcp/feedback-...)  │
│    • 深色水晶玻璃拟态驾驶舱             │  │    • 7 大标准排障工具                 │
│    • KPI 统计 / 多维条件过滤          │  │    • 跨网络自动下载云端真实快照        │
│    • 一键复制 AI 修复 Prompt          │  │    • 驱动 Agent 视觉分析与双向结案    │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 🤖 面向 AI Agent 的快速安装部署 Prompts

> **使用指引**：直接将以下对应的 Prompt 复制发送给 Codex / Claude Code / Cursor / AI Agent，Agent 将自动执行初始化、参数定制与 HTML 注入。

### 📌 模式 1：安装【纯本地模式】(Local Only)
> **适用场景**：离线独立开发、内网原型演示、本地打样测试。数据保存在本地 LocalStorage 与本地 Node API 服务中。

```markdown
请帮我在当前项目中接入「悬浮问题反馈收集器套件」，配置为【纯本地模式 (local)】：
1. 运行初始化命令（使用本地端口 8888 或指定端口）：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=local --target=. --port=8888 --inject --mcp --yes
2. 启动本地 Node API 服务并检查运行状态：
   bash scripts/start.sh && bash scripts/status.sh
3. 验证本地可视化大盘：http://127.0.0.1:8888/feedback-dashboard.html
4. 确认项目根目录下已生成 .mcp.json，本地 MCP 排障服务已就绪。
```

---

### 📌 模式 2：安装【纯线上模式】(Online Only)
> **适用场景**：公网云端部署、测试人员与甲方面向远程服务器验收。数据直接提交至用户自己配置的远程服务器 API。

```markdown
请帮我在当前项目中接入「悬浮问题反馈收集器套件」，配置为【纯线上模式 (online)】：
1. 请使用我指定的云端服务器地址执行初始化（请将 <YOUR_SERVER_URL> 替换为你自己的实际服务器地址，例如 http://api.yourdomain.com:8888 或 http://1.2.3.4:8888）：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=online --target=. --remote-url="<YOUR_SERVER_URL>" --inject --mcp --yes
2. 检查生成的 feedback-collector.js 与 feedback-dashboard.html，确认远程接口地址已正确指向目标云端服务器。
3. 确认项目中的 HTML 页面已自动注入引入脚本，准备进行公网发布。
```

---

### 📌 模式 3：安装【本地+线上混合双向模式】(Hybrid · 推荐黄金标准)
> **适用场景**：**企业级敏捷开发最佳实践**。端侧秒级存盘防丢，自动双向静默同步到用户指定的云端服务器，本地 AI Agent 自动跨网络拉取云端真实截图并在结案后自动双向回推。

```markdown
请帮我在当前项目中接入「悬浮问题反馈收集器套件」，配置为【本地+线上混合模式 (hybrid)】：
1. 运行混合模式初始化（请将 <YOUR_SERVER_URL> 替换为你自己的实际云端服务器地址，例如 http://api.yourdomain.com:8888）：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=hybrid --target=. --port=8888 --remote-url="<YOUR_SERVER_URL>" --inject --mcp --yes
2. 启动本地服务：bash scripts/start.sh
3. 确认本地 MCP 服务 mcp/feedback-service.js 已配置云端自动下载真实快照能力；
4. 确认本地与云端 Dashboard 均可实时双向汇聚反馈数据。
```

---

## 🔄 面向 AI Agent 的模式快速切换 Prompts

当项目环境发生变化（如从本地打样转为公网发布，或从纯线上转为混合调试）时，发送以下指令让 Agent 瞬间完成切换：

### 🔁 切换 1：从【本地模式】切换为【混合双向模式 (hybrid)】
```markdown
请帮我将当前项目的悬浮问题反馈收集器切换为【本地+线上混合模式 (hybrid)】：
1. 将 feedback-collector.js 中的 RUNTIME_MODE 修改为 'hybrid'，DEFAULT_REMOTE_URL 设置为 '<YOUR_SERVER_URL>'；
2. 将 feedback-dashboard.html 与 mcp/feedback-service.js 中的远程服务器地址更新为 '<YOUR_SERVER_URL>'；
3. 更新 .mcp.json 中的 REMOTE_SERVER_URL 环境变量为 '<YOUR_SERVER_URL>'；
4. 运行自检验证双向同步功能。
```

### 🔁 切换 2：从【线上模式】切换为【纯本地模式 (local)】
```markdown
请帮我将当前项目的悬浮问题反馈收集器切换为【纯本地模式 (local)】：
1. 将 feedback-collector.js 中的 RUNTIME_MODE 修改为 'local'，DEFAULT_REMOTE_URL 设置为 'http://127.0.0.1:8888'；
2. 将 feedback-dashboard.html 与 mcp/feedback-service.js 切换为本地服务模式；
3. 启动本地服务：bash scripts/start.sh；
4. 确认在断网或无公网服务器的情况下本地大盘与 MCP 排障功能完全可用。
```

### 🔁 切换 3：仅修改云端服务器 URL 与端口
```markdown
请帮我更新当前项目悬浮问题反馈收集器的云端服务器地址：
1. 新的服务器地址为：[填写你的新服务器地址，例如 http://api.yourdomain.com:8888]；
2. 批量同步更新 feedback-collector.js、feedback-dashboard.html、mcp/feedback-service.js 以及 .mcp.json 中的目标服务器配置；
3. 验证接口连通性。
```

---

## 🛠️ 面向 AI Agent 的标准排障 SOP 与 Prompt 模板

在 Dashboard 中点击「🤖 复制 AI 修复 Prompt」后，会生成如下标准指令，直接发送给 AI Agent 执行自动化闭环排障：

```markdown
【AI 自动排障任务卡】
- 反馈编号: FB-1787973004756
- 优先级: P2 | 类型: 功能缺陷 (Bug)
- 标题: 【实测】保岗期津贴审核通知与对账流水实时入账校验
- 复现页面: q-wechat-app.html
- 缺陷描述: 在求职者端进入保岗津贴完成打卡后，流水明细与微信模版通知存在延迟。

【排查与结案 SOP 步骤】:
1. 调用 MCP 工具 `get_feedback(feedback_id="FB-1787973004756")` 获取工单详情与物理快照路径（若本地缺少会自动从云端下载）；
2. 调用 `view_image(path="data/snapshots/FB-1787973004756.png")` 视觉查看用户提单时的真实页面状态；
3. 查看工单中的 `operationLogs` 复现用户前 40 步点击路径与控制台日志；
4. 定位代码缺陷并修改源代码（如 `q-wechat-app.html`）；
5. 验证无误后调用 `resolve_feedback(feedback_id="FB-1787973004756", resolution_notes="...", files_modified=["q-wechat-app.html"])` 完成双向结案。
```

---

## 📊 三种部署模式详细对比矩阵

| 特性维度 | 纯本地模式 (`local`) | 纯线上模式 (`online`) | 本地+线上混合模式 (`hybrid`) |
| :--- | :--- | :--- | :--- |
| **数据落盘位置** | 本地 `data/feedback_database.json` | 用户指定的远程服务器数据库 | 本地秒存 + 自动双向同步云端 |
| **截图存储** | 本地 `data/snapshots/` | 云端 `/www/.../data/snapshots/` | 云端存储 + 本地增量自动缓存 |
| **网络要求** | 100% 离线可用 | 必须连接远程服务器 | 弱网/离线自动缓存，联网自动同步 |
| **大盘访问** | `http://127.0.0.1:8888/...` | `http://你的域名:端口/...` | 本地与线上大盘均可实时双向查看 |
| **MCP Agent 排障** | 直接读取本地磁盘文件 | 跨网络调用云端接口 | **Agent 自动下载真实快照，结案自动回推** |
| **适用阶段** | 本地研发、保密原型评审 | 线上 UAT 验收、客户演示 | **企业级标准研发与敏捷协作交付** |

---

## 🛠️ MCP 工具清单 (7 大排障工具)

| 工具名称 | 功能描述 | 核心参数 |
| :--- | :--- | :--- |
| `list_feedback` | 获取反馈工单列表（支持状态/优先级/关键词过滤，自动增量同步） | `status`, `severity`, `keyword` |
| `get_feedback` | 获取指定工单详情。**若本地缺少快照图片，自动从云端下载并返回绝对物理路径供 `view_image` 读取** | `feedback_id` |
| `resolve_feedback` | 将工单标记为已解决，记录修复说明与改动文件列表，**自动双向推送到远程服务器** | `feedback_id`, `resolution_notes`, `files_modified` |
| `get_feedback_summary` | 获取反馈总数、待解决数（按 P0/P1/P2/P3 细分）及快照统计 | `sync_remote` |
| `delete_feedback` | 物理删除单条指定的反馈记录与物理快照文件 | `feedback_id`, `delete_snapshot_file` |
| `cleanup_resolved_feedback` | 批量清理/归档所有已标记为已完成的反馈记录 | `archive`, `older_than_minutes` |
| `sync_remote_feedback` | 与远程服务器执行一次全量数据与物理快照的双向同步 | `download_snapshots`, `push_resolved_status` |

---

## 🌐 服务端 RESTful 接口契约

轻量级 Node.js API 中枢（`scripts/server.js`）零第三方依赖，原生提供以下 REST 接口：

| 方法 | 接口路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/feedback/list` | 查询工单列表 |
| `POST` | `/api/feedback/save` | 新增工单或批量同步 |
| `GET` | `/api/feedback/summary` | 获取 KPI 统计摘要 |
| `POST` | `/api/feedback/resolve` | 结案工单并记录改动清单 |
| `POST` | `/api/feedback/clear` | 物理清空测试数据与快照 |
| `POST` | `/api/feedback/archive` | 安全冷归档已解决数据 |
| `GET` | `/data/snapshots/:file` | 物理快照图片静态访问 |

---

## 📁 完整代码包目录结构

```text
floating-feedback-collector/
├── SKILL.md                          # Codex / Claude Skill 标准入口
├── README.md                         # 官方开箱指南与 Prompt 手册
├── package.json                      # npm 配置与 CLI 入口
├── bin/
│   └── feedback-collector.js        # 命令行执行入口
├── cli/
│   └── init.js                       # 交互式初始化向导 CLI
├── templates/                        # 核心组件库与开箱资产
│   ├── client/                       # 前端 SDK (feedback-collector.js + html2canvas)
│   ├── dashboard/                    # 可视化大盘 (feedback-dashboard.html)
│   ├── mcp/                          # MCP 服务与工具链 (feedback-service.js)
│   └── server/                       # 轻量 Node.js API 中枢与运维脚本
├── scripts/                          # 辅助与安装脚本
│   ├── install-to-project.sh         # 一键非交互极速安装脚本
│   └── test-e2e.js                   # 全模式自动化端到端测试
└── references/                       # 架构设计与详细规范手册
    ├── 三种部署模式与配置指南.md
    ├── MCP工具链与排障闭环SOP.md
    ├── 收集器前端API与定制规范.md
    └── 服务端REST接口契约.md
```

---

## 📄 开源协议
MIT License © 2026 AI Architecture Team.
