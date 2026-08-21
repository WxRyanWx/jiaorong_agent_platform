# 交建通扫码成功后应用无反应

## 问题

扫码成功后，后端对 iframe 做 302，Location 为 `jiaorongchat://chat?token=...`。Mac / Windows / Linux 上 iframe **都不能**走系统协议（`open-url` / `second-instance`），Chromium 会当成未知协议。只拦主窗口 webContents 时，Tab / 浮窗会漏。

## 验收

1. Win / Mac / Linux：iframe 302 或 `window.open` 到 `jiaorongchat://chat?token=...` 写入 `xkaitoken` 并进入聊天。
2. `pnpm dev` / `build:test` 打测试服；正式包打正式服；Product-Id 与 origin 成对。
3. 校验失败时弹出「登录校验失败，请重新扫码」。
4. HTTPS 中间跳转不拦截；iframe 不把 mcp/start 当登录回调。
5. Windows 若拦截与系统协议各触发一次，只处理一次。

## 非目标

- 不改扫码 iframe 的正式服 `redirect_uri`（交建通只登记了正式回调）。
- 不改 token 进 URL / 磁盘格式。
- 不在此轮打开 `webSecurity`。
