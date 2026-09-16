# 应用底座管理器

## 目标

主进程用单一 `appsManages` 类管应用装/卸/更新/启用/`spawn`。打开 web-ui 时注入 `window.jiaorong`：自定义能力 + 原 SDK 对话白名单（薄 `invoke`，不套 client）。主进程不向应用子进程注入通信。web-ui 业务不直接调 `window.jiaorong`，一律走 Node WebSocket；仅中继把 Node 的 invoke 转到注入对象。协同平台源码不改。不改超级智能体主进程对话链路。

## 验收

- 点开有 `spawn` 的应用会按字符串起子进程；无 `spawn` 只开 web-ui
- 侧栏 = 配置表可见 ∪ 本机 `apps/` 已装。仓库里有脚手架 **不等于** 全员可见
- 脚手架：单一对话页，经 WS 连包内后端；后端再让页面中继代调 `window.jiaorong`
- Vue 页面（含调试台、选文件、知识库、截图）不写 `window.jiaorong.*`
- `window.jiaorong` 不套 `createClient`；不把宿主 `window.api` / `window.deepchat` 给应用
- 仓库内无 `jiaorong-app-sdk` npm 包；无直连页、无 HTTP `/api/sdk` demo
- 宿主不解析 `app.json.node`（entry/startCommand/port）；启停只认 `spawn`

## 非目标

- 应用中心 UI、后端拉列表
- 改 `apps/collaboration-platform/`
- 改超级智能体主进程业务
- 注入 `deepchat` 全路由表
