# 🐞 Floating Feedback Collector (悬浮问题反馈收集器与排障中枢套件 V3.1)

> **企业级前端原型与 Web 系统的即插即用悬浮反馈收集器、可视化驾驶舱大盘与 AI Agent MCP 闭环排障工作流引擎。**  
> 打通 **“端侧轻量无感采集 ➔ 真实 DOM 离线快照 / 40 步操作轨迹 ➔ 可视化大盘治理 ➔ AI Agent 通过 MCP 协议自动化闭环排障”** 全链路。

---

## 🌟 核心能力架构综述

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 前端采集 SDK (feedback-collector.js + html2canvas)                        │
│    • 📸 视口 DOM 真实快照（打开反馈前自动截取，支持 Lightbox 放大预览）         │
│    • 👣 40 步全景用户操作日志（点击/输入/页面流转/控制台错误自动捕获）           │
│    • 📱 移动端极致适配（42px 磨砂圆球，手势吸边与滚动自动半折叠避让）             │
│    • 🌟 Tour 漫游引导（3 步聚光灯镂空高亮与暗黑玻璃拟态引导，视口安全约束）     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ POST /api/feedback/save (带 BroadcastChannel 广播)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 轻量 Node.js API 中枢 (scripts/server.js)                                │
│    • 统一 4 表数据底座 (feedbacks, urlMappings, submissionLogs, trashBin)   │
│    • 变动触发 SSE 广播中枢 (GET /api/feedback/events，空闲期 0 负载)         │
│    • 智能页面位置映射算法 (URL ➔ 本地源码文件相对路径)                       │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 3. 统一双反馈中枢 (Dashboard 3.0)     │  │ 4. MCP 排障服务 (mcp/feedback-...)  │
│    • 🌐 线上中台 & 💻 线下中台数据一致 │  │    • 9 大标准排障工具                 │
│    • 4 大维度级联过滤器 & 五端下钻    │  │    • 跨网络自动下载云端真实快照        │
│    • 变动触发无感热重绘 (零盲目轮询) │  │    • 线上模式修改毫秒级实时回推云端   │
│    • 智能源码定位胶囊 & 软删除垃圾箱 │  │    • 驱动 Agent 视觉分析与代码直达修复│
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 🧭 双模式运行机制 (Online vs Local)

系统严格解耦为**两大运行模式**：

1. **🌐 线上模式 (Online Mode · 默认黄金标准)**:
   - **云端单真理数据源**：只要配置了云端服务器，所有数据 100% 统一存放在云端服务器；
   - **双端中台数据 100% 镜像一致**：线上公网中台与开发者本地中台，统一读取和实时操作云端数据；
   - **MCP 实时同步**：本地 Agent 调用 MCP 修改数据（结案、录入指导意见、移入垃圾箱、恢复），**毫秒级实时回推同步至云端服务器**；
   - **变动触发中台刷新**：云端数据一变更，双端中台通过 SSE 广播在 1 秒内同时精准刷新。
2. **💻 纯线下模式 (Offline / Local Mode · 断网降级后备)**:
   - **本地磁盘独立数据库**：仅当完全没有网络或无服务器配置时，系统降级读写本地磁盘数据库（`data/`）；
   - **100% 离线可用**：绝对不产生任何外部网络请求，适合保密原型或离线单机开发。

---

## ⚡ 变动触发·智能数据同步机制 (Zero Idle Load)

彻底废除了传统的 `setInterval` 盲目高频轮询（空闲期 0 网络请求、0 服务器 CPU 开销），仅在发生真实数据变动时精准刷新：

1. **触发 1 (用户前端提单)**: 用户点击提交 ➔ 发送 `POST /api/feedback/save` ➔ 触发 `BroadcastChannel` 跨标签广播与服务端 SSE 广播 ➔ 中台即刻刷新；
2. **触发 2 (MCP 结案与方案提交)**: Agent 调用 `resolve_feedback` 或 `add_engineer_note` ➔ 服务端下发 SSE 变更事件 ➔ 线上与本地中台 1 秒内无感变绿重绘；
3. **触发 3 (切回浏览器标签页)**: 监听 `visibilitychange` 与 `focus`，用户切回 Dashboard 标签页时触发 1 次轻量检查，离开时 0 请求；
4. **触发 4 (中台内部人工操作)**: 点击结案、保存指导、移入垃圾箱、恢复工单时，接口返回即时单次局部重绘。

---

## 🤖 面向 AI Agent 的快速安装与模式配置 Prompts

### 📌 1. 如何一键部署 (快速初始化)
> 将以下 Prompt 发送给 Codex / Claude Code / Agent：

```markdown
请帮我在当前项目中一键接入「悬浮问题反馈收集器套件 V3.1」：
1. 运行初始化命令（模式可选 online 或 local，请将 <YOUR_SERVER_URL> 替换为你的服务器地址，如 http://api.yourdomain.com:8888）：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=online --target=. --port=8888 --remote-url="<YOUR_SERVER_URL>" --inject --mcp --yes
2. 启动本地服务：bash scripts/start.sh && bash scripts/status.sh
3. 打开本地中台：http://127.0.0.1:8888/feedback-dashboard.html
4. 确认项目 HTML 页面已自动注入引入脚本，.mcp.json 已就绪。
```

---

### 📌 2. 怎么实现【线上模式】(云端单真理源+双中台镜像)
> 将以下 Prompt 发送给 Agent：

```markdown
请帮我将当前项目配置为【线上模式 (online)】：
1. 运行线上模式命令（将 <YOUR_SERVER_URL> 替换为实际云端服务器地址）：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=online --target=. --remote-url="<YOUR_SERVER_URL>" --inject --mcp --yes
2. 确认 feedback-dashboard.html 与 feedback-collector.js 中的远程地址指向云端服务器；
3. 确认 MCP 服务端 mcp/feedback-service.js 已开启修改后实时向云端服务器回推；
4. 验证线上公网中台与本地中台打开后展示完全一致的云端数据。
```

---

### 📌 3. 怎么实现【纯本地模式】(100% 离线独立数据库)
> 将以下 Prompt 发送给 Agent：

```markdown
请帮我将当前项目配置为【纯本地模式 (local)】：
1. 运行纯本地模式命令：
   node ~/.codex/skills/floating-feedback-collector/cli/init.js --mode=local --target=. --port=8888 --inject --mcp --yes
2. 启动本地 Node 服务：bash scripts/start.sh
3. 验证本地中台 http://127.0.0.1:8888/feedback-dashboard.html 仅读写本地 data/ 目录；
4. 确认在断网环境下所有前端反馈采集、快照生成、中台管理与 MCP 排障功能 100% 可用。
```

---

## 🛠️ 面向 AI Agent 的标准排障 SOP

在 Dashboard 中点击「🤖 复制 AI 修复 Prompt」后，会生成如下标准排障指令：

```markdown
【AI 自动排障任务卡】
- 工单编号: FB-1788173841934
- 优先级: P1 | 类型: 功能缺陷 (Bug)
- 标题: B端企业发布岗位支持自定义保岗天数
- 🎯 本地源码文件路径: B端企业小程序端/b-wechat-app.html
- 提单页面 URL: http://your-server-ip:port/B端企业小程序端/b-wechat-app.html
- 详细问题描述: 希望能手动输入 45 天保岗。
- 👨‍💻 工程师最高指导意见: 下拉框增加自定义输入选项，并在提交时动态绑定 warrantyDays。

【排查与结案 SOP 步骤】:
1. 调用 MCP 工具 `get_feedback(feedback_id="FB-1788173841934")` 获取详情与物理快照（若本地缺失将自动从云端下载）；
2. 调用 `view_image` 查看真实页面快照；
3. 直接打开并修改本地源文件 `B端企业小程序端/b-wechat-app.html` 修复缺陷；
4. 运行自动化测试自验通过后，调用 `resolve_feedback(feedback_id="FB-1788173841934", resolution_notes="...", files_modified=["B端企业小程序端/b-wechat-app.html"])` 完成闭环（线上模式下自动实时回推云端服务器）。
```

---

## 🛠️ 9 大标准 MCP 工具清单

| 工具名称 | 功能描述 | 核心参数 |
| :--- | :--- | :--- |
| `list_feedback` | 获取工单列表 (支持状态/严重级/模式过滤，自动排除垃圾箱) | `status`, `severity`, `mode`, `keyword` |
| `get_feedback` | 获取详情 (自动下载缺失快照，返回物理图片路径与本地源码 `localPath`) | `feedback_id` |
| `resolve_feedback` | 结案工单并记录改动文件，**线上模式下毫秒级实时回推推送到云端** | `feedback_id`, `resolution_notes`, `files_modified` |
| `add_engineer_note` | 录入工程师最高排障指导意见，**实时推送云端** | `feedback_id`, `engineer_note` |
| `soft_delete_feedback` | 移入软删除垃圾箱进行隔离，彻底杜绝同步复活，**实时推送云端** | `feedback_id`, `reason` |
| `restore_feedback` | 从垃圾箱中撤销恢复工单为活跃待办，**实时推送云端** | `feedback_id` |
| `purge_feedback` | 物理彻底销毁工单及物理快照文件 | `feedback_id`, `delete_snapshot` |
| `get_url_mappings` | 获取页面 URL 模式到本地源码文件的映射规则列表 | 无 |
| `add_url_mapping` | 动态新增/修改一条 URL 到本地文件的映射规则 | `name`, `remote_pattern`, `local_file_path`, `terminal` |

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
│   ├── dashboard/                    # 可视化中台 (feedback-dashboard.html)
│   ├── mcp/                          # MCP 服务与工具链 (feedback-service.js)
│   └── server/                       # 轻量 Node.js API 中枢与运维脚本
├── scripts/                          # 辅助与安装脚本
│   ├── install-to-project.sh         # 一键非交互极速安装脚本
│   ├── test-e2e.js                   # 全模式自动化端到端测试
│   └── test_event_driven_trigger.py  # 变动触发机制自动化测试
└── references/                       # 架构设计与详细规范手册
    ├── 反馈与Agent闭环排障中枢重构与数据统一定位落地方案.md
    ├── 三种部署模式与配置指南.md
    ├── MCP工具链与排障闭环SOP.md
    ├── 收集器前端API与定制规范.md
    └── 服务端REST接口契约.md
```

---

## 📄 开源协议
MIT License © 2026 AI Architecture Team.
