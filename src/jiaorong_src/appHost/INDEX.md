# appHost

交融侧栏用 `<webview>` 打开应用包里的 `web-ui`。磁盘装包、点开时 `spawn` 由 `appsManages` 负责。打开页时由 **webview preload** 注入 `window.jiaorong`（自定义能力 + 对话白名单）；**不**把超级智能体 `window.api` / `window.deepchat` 给应用，也 **不** 向 spawn 出的 Node 注入超级智能体 IPC（只带握手 `JIAORONG_BRIDGE_TOKEN`）。

通信约定：客户端 → web-ui → 应用 Node。页面 `initRendererBridge(约定端口)` 连包内 Node WS；端口由子应用自己指定，客户端不探口、不管冲突。扫盘可见性 = OSS 配置表 `auth` ∪ 本机已装；侧栏只列系统应用（OSS `source=builtin`），其余进应用中心。系统应用 zip 装到 Electron userData，不拷用户 apps。启停只认 `app.json.id` 与 `app.json.spawn`，不要求文件夹名与 id 相同。

| 路径 | 作用 |
| --- | --- |
| `preload.ts` | 应用 webview preload：注入 `window.jiaorong`、`window.initRendererBridge` |
| `types.ts` | 目录、清单、运行时、打开信息 |
| `channels.ts` | `jiaorong-app://` 与 IPC 频道名 |
| `bridgeErrors.ts` | 桥失败 `{ code, message }` |
| `auth.ts` | 目录 `auth.orgs` / `userIds` / `phones` 是否对当前用户可见 |
| `catalog.ts` | OSS 配置表解析 |
| `systemApps.ts` | OSS `source=builtin` 为系统应用；zip 装到 Electron userData，不拷用户 apps |
| `sdkDebugLog.ts` | guest 控制台调试日志脱敏 |
| `main/register.ts` | 启动应用平台：协议、隔离、IPC；打开 `startApp`，离开 `stopApp` |
| `main/bridge.ts` | 分发 `window.jiaorong.invoke` |
| `main/dialogue.ts` | agent / session / 发消息 |
| `main/deps.ts` | 超级智能体依赖端口（会话、智能体） |
| `main/scan.ts` | OSS 目录 ∪ 本机已装；系统应用用 userData 目录 |
| `main/manifest.ts` | 读 `app.json`（id/name/version/entry/spawn） |
| `main/paths.ts` | 安装目录、内置包、preload 路径 |
| `main/protocol.ts` | `jiaorong-app://` |
| `main/guest.ts` | 分区、绑定、附件落地、webview 隔离 |
| `main/bir.ts` | 页面 WS：preload 注入 `initRendererBridge` |
| `main/devtoolsShortcut.ts` | 隐藏 DevTools 序列并挂到 WebContents |
| `main/appsManages.ts` | 装/卸/更新/启用/`spawn` |
| `main/appManagerInstance.ts` | 管理器单例：安装 / 卸载 / `spawn` 共用缓存 |
| `appCenter/main/appCenter.ts` | 应用中心列表、zip 下载安装 / 更新、开发者卸载 |
| `main/events.ts` | 把会话/流式事件推给应用页面 |
| `main/agentMap.ts` | 应用 agent key ↔ DeepChat agentId |
| `main/context.ts` | `context.get` |
| `main/userIdentity.ts` | 当前用户与 token |
| `main/slashCatalog.ts` | `catalog.slash` |
| `main/knowledgeBase.ts` | 知识库查询 |
| `renderer/JiaorongAppFrameHost.vue` | 常驻 webview：`getOpenInfo` + preload |
| `renderer/openAppHandoff.ts` | 列表页「打开」预热结果交接，宿主免二次 IPC |
| `renderer/pages/AppHostPage.vue` | 路由占位 |
| `appCenter/renderer/AppCenterPage.vue` `AppCenterPage.less` | 应用中心卡片网格页 |
| `renderer/useJiaorongMenuApps.ts` | 侧栏可见应用 |
| `appCenter/renderer/useJiaorongAppCenter.ts` | 页数据源：列表 / 安装 / 卸载 / 打开 |
| `appCenter/renderer/useJiaorongAppCenterAccess.ts` | 侧栏「应用中心」入口可见性与跳转 |
| `devCenter/main/devApps.ts` | 开发者名单内存镜像 + app.json 必填校验 |
| `devCenter/main/devCenter.ts` | 开发者中心列表 / 创建 / 发布占位 / 示例下载 |
| `devCenter/main/devAppWindow.ts` | 开发者中心每应用独立窗口，关窗停 Node |
| `devCenter/renderer/DevAppWindowRail.vue` `DevAppWindowRail.less` | 独立窗口纯 UI 侧边栏（所有 agent + 已打开应用图标） |
| `devCenter/renderer/DevCenterPage.vue` `DevCenterPage.less` | 开发者中心卡片页（复用应用中心卡片样式；目录按钮占满行内剩余宽度并复用 `project.openDirectory`，本地应用不显示提供方） |
| `devCenter/renderer/useJiaorongDevCenter.ts` | 页数据源：浏览器存储名单 + 主进程操作 |
| `devCenter/renderer/useJiaorongDevCenterAccess.ts` | 侧栏「开发者中心」入口（仅开发者） |
