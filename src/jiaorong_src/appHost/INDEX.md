# appHost 目录索引

交融客户端里的**应用宿主**：扫目录、装包、打开侧栏 webview、给 guest 注入 `window.jiaorong`、把 SDK `invoke` 接到主进程会话能力。不包含二次开发用的 npm 包（那是 `app-sdk`）。

下文「UI」指 `.vue` 与侧栏 composable，本文只索引，不要求给它们补变量注释。

## 根目录

| 文件 | 作用 |
| --- | --- |
| `INDEX.md` | 本目录索引 |
| `types.ts` | 目录项、清单、运行时、打开信息等宿主类型 |
| `channels.ts` | `jiaorong-app://` 协议名与 IPC 频道名 |
| `bridgeErrors.ts` | 桥错误码；IPC 失败结果与成功 payload 的区分 |
| `auth.ts` | 目录 `auth.orgs` / `userIds` 解析与当前用户是否可见 |
| `catalog.ts` | 从 OSS 运行时配置解析应用列表；本地 json 不参与运行 |
| `builtinCatalog.json` | 历史内置目录样例；运行时不读，以 OSS 为准 |
| `preload.ts` | 应用 webview 专用 preload：暴露 `window.jiaorong` |

## `main/`（Electron 主进程）

| 文件 | 作用 |
| --- | --- |
| `register.ts` | 启动/销毁宿主：登记 IPC、协议、隔离、扫包、拉起 Node 桥 |
| `bridge.ts` | 分发 SDK `invoke`（上下文、DevTools、对话框、目录、知识库、对话） |
| `dialogue.ts` | 智能体/会话/发消息等对话方法，走 `JiaorongAppDialoguePort` |
| `deps.ts` | 宿主依赖端口：对话、文件、斜杠目录、鉴权会话 |
| `scan.ts` | 合并远程目录与 local-debug，拷贝内置目录到用户 `apps/` |
| `manifest.ts` | 读应用包内 `app.json` |
| `paths.ts` | 用户安装目录、内置 `jiaorong-apps`、preload 路径、拷贝过滤 |
| `protocol.ts` | 登记 `jiaorong-app://`，按 appId 把请求映射到安装目录文件 |
| `guestIsolation.ts` | webview 分区、强制 preload、拦截跨应用导航 |
| `devtoolsChord.ts` | 隐藏 DevTools 序列状态机（Ctrl/Cmd+I S N） |
| `devtoolsShortcut.ts` | 把序列挂到所有 WebContents，含嵌入 webview |
| `guestAppId.ts` | partition / URL hostname 解析 appId，校验 invoke 来源 |
| `guestBind.ts` | webContents ↔ appId、选中目录白名单、会话归属 |
| `guestAttachments.ts` | guest 附件路径落地；知识库 context 不当文件写盘 |
| `guestNode.ts` | 侧栏打开时 spawn 应用 Node，注入 `globalThis.jiaorong` |
| `standaloneNodeBridge.ts` | 本机独立 `node server.js`：`node-bridge.json` JSON 行协议 |
| `events.ts` | 把 DeepChat 事件转给应用 guest；官方窗口滤掉应用会话 |
| `agentMap.ts` | 应用 `key` ↔ DeepChat `agentId`；官方列表隐藏这些 Agent |
| `context.ts` | `context.get`：token、locale、theme、appDir、nodePort |
| `userIdentity.ts` | 从 `jiaorong_auth_session` 读用户与 token |
| `slashCatalog.ts` | `catalog.slash`：技能 + MCP 工具列表 |
| `knowledgeBase.ts` | 知识库列表/目录，主进程代请求，guest 不直连云端 |

## `renderer/`（宿主渲染进程，UI）

| 文件 | 作用 |
| --- | --- |
| `JiaorongAppFrameHost.vue` | 常驻 webview 容器；切菜单不拆 guest |
| `pages/AppHostPage.vue` | 路由占位，真正的 webview 不在本页 |
| `useJiaorongMenuApps.ts` | 侧栏可见应用列表，登录变化时刷新 |
