# 应用间 Intent 跳转

## 目标

子应用 A 调用 `window.jiaorong.app.open()` 打开或切换到子应用 B，并向 B 投递一次业务上下文。

## 需求

- A 传入目标 `appId`、业务 `intent` 和小 JSON `data`。
- B 通过 `jr.on('app.intent')` 接收事件。
- 事件 `type` 为 `<sourceAppId>:<intent>`，前缀由主进程注入，A 不能伪造。
- B 未打开时先打开；B 已打开时切换到前台。
- B 在多个窗口打开时，只向本次切换到的目标窗口投递一次 Intent。
- B 初始化完成并注册监听后才投递，避免 Vue 初始化时序导致丢事件。
- 权限只校验当前用户是否可见目标应用，不增加应用间白名单。

## 验收

- A 打开 B 后，B 收到 `type`、`data` 并可自行路由。
- C 应用发送同名 `intent` 时，B 收到 `c-app:<intent>`，不与 A 混淆。
- 目标不存在或当前用户不可见时返回 `APP_NOT_FOUND`。
- 参数非法或 JSON 序列化后 UTF-8 字节数超过 16KB 时返回 `VALIDATION_ERROR`。
- pending intent 只保留最新一条，5 分钟未消费自动过期。
- 切换登录用户时清空未消费 Intent，避免跨用户串数据。
- 已有应用打开、通知和桥调用行为不变。

## 非目标

- 一期不实现 `jr.app.emit` 实时通信；二期见 `docs/features/app-realtime-communication/`。
- 不做后台消息暂存邮箱。
