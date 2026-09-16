# 应用底座管理器

## 目标

主进程用单一 `appsManages` 类管应用装/卸/更新/启用/`spawn`。打开 web-ui 时注入 `window.jiaorong` 与 `window.initRendererBridge`。主进程不向应用子进程注入通信。页面启动时 `initRendererBridge(port)` 连包内普通 WS；Node 发 `request` 调 `jiaorong`。协同平台源码不改。不改超级智能体主进程对话链路。

## 验收

- 点开有 `spawn` 的应用会按字符串起子进程；无 `spawn` 只开 web-ui
- 侧栏 = 配置表可见 ∪ 本机 `apps/` 已装。仓库里有脚手架 **不等于** 全员可见
- 脚手架：单一对话页；`initRendererBridge(port)` 连包内 Node WS；业务走 `POST /rpc`
- Vue 页面（含调试台、选文件、知识库、截图）不写 `window.jiaorong.*` 业务调用
- `window.jiaorong` 不套 `createClient`；不把超级智能体 `window.api` / `window.deepchat` 给应用
- 不另打前端/Node WS SDK 包
- 宿主不解析 `app.json.node`（entry/startCommand/port）；启停只认 `spawn`

## 非目标

- 应用中心 UI、后端拉列表
- 改 `apps/collaboration-platform/`
- 改超级智能体主进程业务
- 注入 `deepchat` 全路由表
