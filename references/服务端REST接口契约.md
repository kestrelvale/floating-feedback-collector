# 服务端 RESTful 接口契约

轻量级 Node.js API 中枢默认提供以下接口：

| 方法 | 路径 | 功能说明 | 请求参数 / Body | 返回格式 |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/feedback/list` | 获取反馈工单列表 | `?status=pending&severity=P0` | `{ success: true, total: N, data: [...] }` |
| `POST` | `/api/feedback/save` | 提交新反馈或更新工单 | JSON 工单对象 (含 base64 截图) | `{ success: true, feedback: {...} }` |
| `GET` | `/api/feedback/summary` | 获取统计 KPI 摘要 | 无 | `{ success: true, summary: { total, pending, resolved, p0, p1, p2, p3 } }` |
| `POST` | `/api/feedback/resolve` | 结案已修复工单 | `{ id, resolvedBy, notes, filesModified }` | `{ success: true, feedback: {...} }` |
| `POST` | `/api/feedback/clear` | 物理清空测试数据与快照 | 无 | `{ success: true, message: "..." }` |
| `POST` | `/api/feedback/archive` | 归档已完成记录 | `{ olderThanMinutes: 0 }` | `{ success: true, archivedCount: N }` |
| `GET` | `/data/snapshots/:file` | 物理快照静态图片访问 | 无 | `image/png` |
