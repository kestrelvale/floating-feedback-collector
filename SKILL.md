---
name: floating-feedback-collector
description: 企业级前端原型/Web系统悬浮问题反馈收集器、DOM真实快照与40步操作日志追踪、可视化大盘Dashboard 3.0及MCP闭环排障工作流引擎。支持【线上模式 (云端单真理源+双端中台镜像)】与【纯线下模式 (本地100%离线)】两套运行机制，内置4大变动触发智能同步与智能源码位置映射。
metadata:
  short-description: 前端悬浮反馈收集器与MCP闭环排障引擎 (V3.2 双模式·变动触发版)
---

# Floating Feedback Collector (悬浮问题反馈收集器与排障中枢套件 V3.2)

企业级前端原型与 Web 系统的即插即用问题反馈与 AI 排障全链路工业级解决方案。  
打通 **“端侧轻量无感采集 ➔ 真实 DOM 离线快照 / 40 步全景操作轨迹 ➔ 可视化驾驶舱中台治理 ➔ AI Agent 通过 MCP 协议自动化闭环排障”**。

---

## 🌟 核心体系综述

### 1. 总体三层四表架构
- **① 数据采集层 (Client SDK)**: `feedback-collector.js` + `html2canvas`，42px 磨砂圆球手势吸边与滚动半折叠避让，3 步 Tour 漫游聚光灯引导，打开反馈前自动抓取当前视口真实 DOM 生成高清快照，自动拦截并记录 40 步用户点击/输入轨迹与控制台错误；
- **② 统一数据存储层 (Unified 4-Table Storage)**:
  - 核心反馈表 (`feedbacks`)：统一主键 ID 体系；
  - 页面位置映射表 (`urlMappings`)：自动将提单 URL 翻译为本地源码相对路径；
  - 提交审计历史表 (`submissionLogs`)：记录提交环境与来源；
  - 软删除垃圾箱 (`trashBin`)：隔离废弃测试工单，彻底阻断反向同步复活。
- **③ 应用管理与排障层 (Dashboard 3.0 & MCP)**: 
  - 统一双中台：公网线上中台与本地开发中台 100% 镜像一致；
  - 智能代码直达：卡片直观显示 `🌐 远程 URL ➔ 📁 本地源码路径`；
  - 9 大标准 MCP 工具：跨网络自动拉取真实图片，支持 Agent 自主排查并在结案后自动双向回推。

---

### 2. 双模式运行机制 (Online vs Local)

| 模式 | 配置标识 | 数据源归属 | 反馈中台行为 | MCP 排障闭环 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **线上模式** *(默认/推荐)* | `online` | **100% 存放在云端服务器** (Single Source of Truth) | 无论是线上中台还是本地中台，**统一实时读取云端服务器的同一份数据，两端 100% 镜像一致** | 本地 Agent 调用 MCP 修改（结案/批注/移入垃圾箱），**毫秒级实时回推推送到云端服务器** | **只要有服务器一律为线上模式**，支持公网测试与本地开发无缝协同 |
| **纯线下模式** | `local` | **100% 存放在本地磁盘工作区** (`data/`) | 中台严格只读取本地 Node.js 独立数据库，绝对不产生任何外部网络请求 | MCP 直接读写本地数据库文件 | **纯单机离线开发、断网保密原型评审** |

---

### 3. 变动触发·智能数据同步机制 (Zero Idle Load)
彻底废除盲目定时轮询（0 定时请求，服务器零多余负荷），仅在真实发生数据变动时精准触发：
1. **触发 1 (用户前端提单)**: 用户在任一页面提交反馈 ➔ 发送 `POST /api/feedback/save` ➔ 通过 `BroadcastChannel` 与 SSE 广播通知中台刷新；
2. **触发 2 (MCP 结案与方案提交)**: Agent 调用 `resolve_feedback` / `add_engineer_note` ➔ 服务端下发 SSE 变更事件 ➔ 线上与本地中台 1 秒内精准刷新；
3. **触发 3 (切回浏览器标签页)**: 监听 `visibilitychange` 与 `focus`，用户切回 Dashboard 时触发 1 次轻量数据对齐，离开标签页时 0 网络请求；
4. **触发 4 (中台内部人工操作)**: 点击结案、保存指导、移入垃圾箱、恢复工单时，接口返回即时单次局部重绘。

---

## 🚀 快速开始与使用指引

### 1. 一键初始化向导 (CLI)
在任何前端目标项目的根目录下执行：
```bash
# 交互式向导 (支持模式、端口、远程服务器与 HTML 自动注入选择)
node ~/.codex/skills/floating-feedback-collector/cli/init.js

# 或一行命令静默安装 (模式可选: online | local | hybrid)
bash ~/.codex/skills/floating-feedback-collector/scripts/install-to-project.sh . online 8888 http://your-server-ip:port
```

### 2. 9 大标准 MCP 工具集
- `list_feedback(status, severity, mode, keyword)`: 查询工单列表（自动排除垃圾箱，带 `localPath`）。
- `get_feedback(feedback_id)`: 获取指定工单详情。**若本地缺少快照图片，自动从云端下载并返回绝对物理路径供 Agent `view_image` 读取，同时返回绑定的本地源码文件相对路径 `localPath`**。
- `resolve_feedback(feedback_id, resolution_notes, files_modified, sync_to_remote)`: 标记问题已解决，线上模式下自动毫秒级回推同步至云端服务器，中台实时变绿。
- `add_engineer_note(feedback_id, engineer_note, engineer_author)`: 为工单录入工程师最高排障指导意见，自动同步云端。
- `soft_delete_feedback(feedback_id, reason)`: 软删除移入垃圾箱，绝对杜绝数据被同步反向复活。
- `restore_feedback(feedback_id)`: 从垃圾箱撤销恢复工单为活跃待办。
- `purge_feedback(feedback_id, delete_snapshot)`: 物理彻底销毁工单及快照。
- `get_url_mappings()`: 查询当前系统的 URL 到本地源码文件映射规则。
- `add_url_mapping(name, remote_pattern, local_file_path, terminal)`: 动态新增/修改 URL 映射。
