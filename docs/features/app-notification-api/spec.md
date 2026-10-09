# 子应用主窗口通知 API

## 目标

子应用页面通过 `window.jiaorong.notification.show()` 在客户端主窗口右上角弹出提示。子应用页面不在前台时，只要 webview 仍被宿主保留，也可以触发通知。

## 需求

- API 位于 `window.jiaorong.notification.show`。
- 类型支持 `success` / `info` / `warning` / `error`。
- 支持纯文本 `title` 与可选 `description`。
- 支持可选 `dedupeKey`，同一应用内相同 key 的通知复用现有合并策略。
- 复用主窗口现有 `NotificationHost` / `NotificationManager` / toast UI。
- 不支持 HTML、Markdown、按钮回调、进度和点击跳转。

## 验收

- 合法调用返回 `{ accepted: true }`，主窗口展示现有右上角 toast。
- `title`、`description`、`dedupeKey` 超长或类型错误时返回 `VALIDATION_ERROR`。
- 单应用每分钟超过 10 条时返回 `RATE_LIMITED`，不向主窗口投递。
- 应用不能伪造其它 `appId`；调用方归属由 IPC sender 绑定结果决定。
- 不同应用使用相同 `dedupeKey` 不互相合并。
- 系统内部 `notification.semantic` 事件契约保持不变。

## 约束

- 通知文案由子应用提供，宿主不做翻译。
- 通知不写入客户端会话存储，也不生成系统原生通知。
- 第一版只开放瞬时通知，不开放常驻、进度和可操作通知。

## 非目标

- 不实现通知中心或历史列表。
- 不提供通知点击后的应用路由。
- 不改变现有系统通知的语义、优先级和恢复策略。

## 待确认

无。
