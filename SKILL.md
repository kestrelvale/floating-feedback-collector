---
name: floating-feedback-collector
description: 企业级前端原型/Web系统悬浮问题反馈收集器、DOM真实快照与操作日志追踪、可视化大盘Dashboard及MCP闭环排障工作流引擎。支持本地、线上、本地+线上混合三种模式。
metadata:
  short-description: 前端悬浮反馈收集器与MCP排障引擎
---

# Floating Feedback Collector (悬浮问题反馈收集器套件)

企业级前端原型与 Web 系统的即插即用问题反馈解决方案，打通 **“前端轻量无感采集 -> 真实 DOM 离线快照 / 40 步操作轨迹 -> 可视化大盘治理 -> AI Agent 通过 MCP 协议自动化闭环排障”** 全链路。

---

## 🎯 核心能力与架构组件

1. **悬浮反馈收集器 SDK (`feedback-collector.js`)**:
   - **零侵入与智能避让**: 移动端 42px 极简磨砂圆球，支持手势拖拽吸边、页面滚动自动半折叠避让，绝不遮挡正常业务。
   - **真实 DOM 快照**: 打开反馈卡片前自动抓取当前视口真实 DOM 生成高清快照，支持无缝放大预览。
   - **全景日志追踪**: 自动记录最近 40 步用户点击/输入轨迹与控制台 Console 错误日志。
   - **Tour 漫游式引导**: 3 步沉浸式聚光灯新手引导，动态视口安全约束 (Viewport Clamping)。
2. **可视化大盘 (`feedback-dashboard.html`)**:
   - 暗黑水晶玻璃拟态（Dark Slate Glassmorphism）UI。
   - KPI 驾驶舱统计、多维条件过滤（优先级/类型/状态/关键词）、Lightbox 快照大图查看。
   - 一键复制结构化 AI 修复 Prompt、一键数据清空与安全归档。
3. **MCP 自动化排障服务 (`mcp/`)**:
   - 提供 7 大标准 MCP 工具（`list_feedback`, `get_feedback`, `resolve_feedback`, `delete_feedback`, `cleanup_resolved_feedback`, `get_feedback_summary`, `sync_remote_feedback`）。
   - 支持 Agent 跨网络自动拉取云端真实截图并在本地调用 `view_image` 读取排障，结案后自动双向回推。
4. **轻量 Node.js API 中枢 (`scripts/server.js`)**:
   - 原生纯标准库实现，零第三方重量依赖。
   - 跨域 CORS 支持、快照图片静态托管与 RESTful 接口。

---

## 🚀 快速接入与三种运行模式

### 1. 一键初始化 CLI
在需要接入该功能的前端项目根目录下运行：
```bash
node ~/.codex/skills/floating-feedback-collector/cli/init.js
```
或使用一键命令：
```bash
bash ~/.codex/skills/floating-feedback-collector/scripts/install-to-project.sh [目标路径] [模式: local|online|hybrid] [端口] [远程URL]
```

---

### 2. 三种模式矩阵与适用场景

| 模式 | 配置标识 | 前端存储与流转 | MCP 排障机制 | 推荐场景 |
| :--- | :--- | :--- | :--- | :--- |
| **纯本地模式 (Local)** | `local` | 存入本地 LocalStorage 与本地 Node API (`127.0.0.1:8888`) | MCP 直接读取本地数据库与快照目录 | 离线开发、内网原型评审、个人独立开发 |
| **纯线上模式 (Online)** | `online` | 直接调用云端正式服 API (`http://IP:PORT`) 实时入库 | MCP 直连云端 API 交互 | 纯公网部署、跨地域远程协作、多测试员同步 |
| **本地+线上混合 (Hybrid)** | `hybrid` *(推荐)* | 优先存本地，启动/打开大盘时自动静默双向同步云端 | MCP 自动从云端下载快照到本地供 Agent 分析，结案双向回推 | **正式交付与敏捷迭代黄金标准** |

---

## 🛠️ MCP 工具集 (Agent 使用指引)

当项目配置了本 Skill 的 MCP 服务后，AI Agent 可以直接调用以下工具执行反馈治理：

- `list_feedback(status, severity, keyword)`: 查询反馈列表，支持自动增量同步远程服务器。
- `get_feedback(feedback_id)`: 获取指定工单详情。**若本地缺少快照图片，会自动从云端拉取并保存在本地，返回物理图片路径供 Agent 直接使用 `view_image` 视觉分析**。
- `resolve_feedback(feedback_id, resolution_notes, files_modified)`: 标记问题为已解决，记录修复说明与改动文件列表，并自动双向推送到远程云端服务器。
- `get_feedback_summary()`: 获取待办工单总数及 P0/P1/P2/P3 优先级概览。
- `delete_feedback(feedback_id, delete_snapshot_file)`: 物理删除指定反馈。
- `cleanup_resolved_feedback(archive, delete_snapshot_files)`: 批量归档或清理已解决的反馈工单。
- `sync_remote_feedback()`: 本地与远端执行一次全量数据与物理快照的双向同步。

---

## 📖 详细参考手册

- [三种部署模式与配置指南](references/三种部署模式与配置指南.md)
- [MCP工具链与排障闭环SOP](references/MCP工具链与排障闭环SOP.md)
- [收集器前端API与定制规范](references/收集器前端API与定制规范.md)
- [服务端REST接口契约](references/服务端REST接口契约.md)
