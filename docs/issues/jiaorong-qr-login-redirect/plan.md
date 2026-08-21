# 计划

- `web-contents-created` 给每个 WebContents 挂 `will-redirect` / `will-frame-navigate`（主窗口、Tab、浮窗；Win/Mac/Linux 同一套 Chromium 事件）。
- `window.open`：主窗口与 Tab 都先吃应用协议，再 `openExternalUrl`。
- `jiaorongchat:` 加入外部协议白名单，漏拦时 Win/Linux 可走 `second-instance` / `xdg-open`。
- 同 token 2s 内去重。
- 渲染进程已起来时不等 `did-finish-load`；冷启动最多等 2s。
- `pnpm dev` 与 `build:test` 打测试服；Product-Id 跟 origin 走。
- 扫码校验失败用 Message 提示。
