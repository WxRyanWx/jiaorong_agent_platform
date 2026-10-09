# 实现方案

## 数据流

```text
子应用页面
  → window.jiaorong.notification.show
  → guest preload ipcRenderer.invoke
  → appHost 主进程桥 notification.show
  → 参数校验 / appId 隔离 / 每应用频控
  → app.notification.show 深聊事件
  → 主窗口 NotificationClient
  → appNotificationAdapter
  → rendererNotificationManager
  → 现有右上角 toast
```

## 契约

- 新增 `appNotificationShowEvent`，事件名为 `app.notification.show`。
- 事件 payload 携带 `appId`、`appName`、`type`、`title`、`description`、`notificationKey`；`notificationKey` 由主进程按 `appId` 与可选 `dedupeKey` 派生。
- 主进程从当前 runtime 取 `appId` / `appName`，不信任应用传入的归属信息。
- `JIAORONG_BRIDGE_ERROR_CODES` 增加 `RATE_LIMITED`。

## 渲染适配

- `NotificationClient` 增加 `onAppNotification`。
- `appNotificationAdapter` 把事件转换成 `NotificationRequest`。
- 通知 code 固定为 `app.notification`。
- 通知 key 为 `appId:dedupeKey`；无 `dedupeKey` 时生成一次性 id，避免误合并。
- 传入 key 让四种类型都走 `ManagedNotificationToast`，保证 UI 一致。

## 兼容性

- `window.jiaorong` 现有方法不变。
- 现有 `notification.semantic` 契约与处理链路不变。
- 子应用只依赖 `notification.show` 输入结构；主窗口 UI、自动关闭和合并策略变化不需要子应用改代码。

## 测试策略

- 主进程：参数校验、归属绑定、频控、事件 payload。
- 渲染：事件到 `NotificationRequest` 的映射、不同应用相同 dedupeKey 隔离。
- 桥接：`notification.show` 成功与失败返回结构。
