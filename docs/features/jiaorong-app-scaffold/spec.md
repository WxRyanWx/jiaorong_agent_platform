# 应用脚手架模板 + 宿主 userinfo + chat-kit 进 SDK

## 目标

把 `demo-workbench` 改成给外部团队直接拷贝的脚手架。两种对话页都用 SDK Vue 两个组件；**脚手架不引用 chat-kit**。Node HTTP 页前端不 `connect` SDK。

## 脚手架页面

1. **直连对话** `#/`：页面 `connect()`，组件内部走 `window.jiaorong`。
2. **Node HTTP 对话** `#/node`：
   - 页面只 `fetch` / SSE 调本机 Node，**不** `import { connect }`。
   - Node（Egg 单进程）里才 `connect({ runtime: 'node' })`。
   - HTTP 把 SDK JSON 原样吐给页面，页面把 `sessions` / `messages` / 流式块灌进两个组件（`external`）。
   - Egg 脚手架默认只转发；业务在 `app/service/biz.js` 前后处理。

## 会话列表与消息块

- 置顶会话排在最前，再按 `updatedAt`。
- 列表默认 `#eff5ff`，可用组件 `class` 覆盖。
- 工具状态图标与超级智能体一致。

## SDK 依赖

- 调通前：`file:../../../app-sdk`（本地包 `dist`）。
- 调通后：改 OSS `jiaorong-app-sdk-*.tgz`。

## 注意事项

- Vite `base: './'`，Hash 路由。
- `NODE_BASE` 与 `app.json` `node.port` 一致。
- Egg 必须单进程（不能 `startCluster`），否则丢失宿主注入的 `globalThis.jiaorong`。
- Node 页首次发送时，`session.create` 写入 `sessionId` 不能清空正在生成的消息。

## 非目标

- 不把 chat-kit 拷到 `ai-chat-design`。
- 不升 catalog `0.0.19-dev`。
- 不做知识库 / slash 面板。
