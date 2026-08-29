# MCP 工具链与排障闭环标准作业程序 (SOP)

## 1. 架构流转图

```
[前端页面] ──(用户点击反馈)──► [自动捕获DOM快照 + 40步操作日志]
                                       │
                                (POST /api/feedback/save)
                                       ▼
                             [云端/本地持久化数据库]
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
        [Feedback Dashboard 2.0]              [Stdio / SSE MCP Server]
         (一键复制 AI 修复 Prompt)                           │
                     │                                   ▼
                     └───────────────► [AI Agent 自动修复]
                                        ├── list_feedback
                                        ├── get_feedback (自动下载真实图片)
                                        ├── view_image (视觉排查)
                                        ├── apply_patch (代码修复)
                                        └── resolve_feedback (双向回写结案)
```

---

## 2. Agent 标准排障四步法

### 第一步：发现与拉取工单
Agent 调用 `list_feedback(status="pending")` 或直接接收用户提供的 Prompt，获取反馈 ID（如 `FB-1787973004756`）。

### 第二步：获取工单详情与图片
Agent 调用 `get_feedback(feedback_id="FB-1787973004756")`。
- MCP 服务端会自动检测本地 `data/snapshots/FB-1787973004756.png` 是否存在；
- 若不存在，自动从远程服务器下载保存至本地，并返回物理绝对路径 `physicalImagePath`。

### 第三步：多模态视觉分析与代码修复
- Agent 调用 `view_image(path=physicalImagePath)` 查看用户提交问题时的真实界面渲染状态；
- 查看 `operationLogs` 复现用户前 40 步交互路径；
- 定位缺陷根因后，通过 `apply_patch` 精准修改源代码。

### 第四步：结案与双向状态同步
代码修复并自检通过后，Agent 调用：
```json
{
  "feedback_id": "FB-1787973004756",
  "resolution_notes": "已修复保岗津贴审核延迟问题，通过 Playwright 自动化验证",
  "files_modified": ["q-wechat-app.html"]
}
```
`resolve_feedback` 会自动将该记录标记为 `resolved` 并将状态推送到远程服务器，完成闭环。
