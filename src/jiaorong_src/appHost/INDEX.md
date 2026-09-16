# appHost

交融侧栏用 `<webview>` 打开应用包里的 `web-ui`。磁盘装包、点开时 `spawn` 由 `appsManages` 负责。打开页时由 **webview preload** 注入 `window.jiaorong`（自定义能力 + 对话白名单）；**不**把宿主 `window.api` / `window.deepchat` 给应用，也 **不** 向 spawn 出的 Node 进程注入通信。

通信约定：客户端 → web-ui → 应用 Node（WebSocket）。web-ui 业务不直连 `window.jiaorong`；只有中继把 Node 的 invoke 转到注入对象。可见性 = OSS 配置表 `auth` ∪ 本机 `~/.jiaorongchat/apps` 已装。启停只认 `app.json.spawn`，不读旧的 `app.json.node`。

| 路径 | 作用 |
| --- | --- |
| `preload.ts` | 应用 webview preload：注入 `window.jiaorong` |
| `types.ts` | 目录、清单、运行时、打开信息 |
| `channels.ts` | `jiaorong-app://` 与 IPC 频道名 |
| `bridgeErrors.ts` | 桥失败 `{ code, message }` |
| `auth.ts` | 目录 `auth` 是否对当前用户可见 |
| `catalog.ts` | OSS 配置表解析 |
| `sdkDebugLog.ts` | guest 控制台调试日志脱敏 |
| `main/register.ts` | 启动宿主：协议、隔离、IPC；打开 `startApp`，离开 `stopApp` |
| `main/bridge.ts` | 分发 `window.jiaorong.invoke` |
| `main/dialogue.ts` | agent / session / 发消息 |
| `main/deps.ts` | 宿主依赖端口（会话、智能体） |
| `main/scan.ts` | OSS 目录 ∪ 本机已装 |
| `main/manifest.ts` | 读 `app.json`（id/name/version/entry/spawn） |
| `main/paths.ts` | 安装目录、内置包、preload 路径 |
| `main/protocol.ts` | `jiaorong-app://` |
| `main/guestIsolation.ts` | webview 分区与强制 preload |
| `main/devtoolsChord.ts` | 隐藏 DevTools 序列 |
| `main/devtoolsShortcut.ts` | 把序列挂到 WebContents |
| `main/guestAppId.ts` | 从 partition / URL 解析 appId |
| `main/guestBind.ts` | webContents ↔ appId |
| `main/guestAttachments.ts` | guest 附件路径 |
| `main/appsManages.ts` | 装/卸/更新/启用/`spawn`；不注入宿主通信 |
| `main/events.ts` | 把会话/流式事件推给应用页面 |
| `main/agentMap.ts` | 应用 agent key ↔ DeepChat agentId |
| `main/context.ts` | `context.get` |
| `main/userIdentity.ts` | 当前用户与 token |
| `main/slashCatalog.ts` | `catalog.slash` |
| `main/knowledgeBase.ts` | 知识库查询 |
| `renderer/JiaorongAppFrameHost.vue` | 常驻 webview：`getOpenInfo` + preload |
| `renderer/pages/AppHostPage.vue` | 路由占位 |
| `renderer/useJiaorongMenuApps.ts` | 侧栏可见应用 |
