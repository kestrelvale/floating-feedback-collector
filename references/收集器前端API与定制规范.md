# 悬浮反馈收集器前端 SDK API 与定制规范

## 1. 引入方式

在 HTML 页面引入 SDK 即可开箱即用：
```html
<script src="feedback-collector.js"></script>
```

---

## 2. 核心特性与行为定制

### 移动端智能折叠与避让
- 移动端默认展示为 42px 直径的磨砂圆球；
- 支持手势拖拽吸边到屏幕左侧或右侧；
- 页面向下滚动时，圆球会自动向屏幕边缘折叠 50% 隐藏，防止遮挡列表内容；页面滚动停止或轻触时优雅滑出。

### 自动化捕获项
- **快照**: `html2canvas` 捕获当前视口 DOM；
- **操作日志**: 最近 40 次用户点击、输入与导航轨迹；
- **系统日志**: `window.onerror` 与 `console.error` 拦截；
- **运行环境**: 屏幕分辨率、DPR、视口宽高、硬件并发数、网络状态、UserAgent。

---

## 3. 全局对象与事件钩子

SDK 在 `window.FeedbackCollector` 上暴露了丰富的控制接口：

```javascript
// 打开反馈弹窗
window.FeedbackCollector.openModal();

// 关闭反馈弹窗
window.FeedbackCollector.closeModal();

// 重置并触发 Tour 漫游新手引导
window.FeedbackCollector.startTour();

// 注册自定义操作日志
window.FeedbackCollector.logAction('CUSTOM_EVENT', '用户完成了实名认证');
```
