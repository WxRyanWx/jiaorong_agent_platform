# 实现

## Vue 组件

- `JiaorongAgentChat` / `JiaorongAgentSessionList` 增加 `external`。
- `external` 时不 `connect`，只渲染传入的 `sessions` / `messages` / `liveBlocks`，动作用 emit。
- 直连页不传 `external`，行为不变。
- 思考标题和正文默认展开；思考不折进详情组。详情 / 工具参数默认收起。

## HttpChatPage

- 只 `fetch` `POST /api/sdk` 与 `GET /api/events`。
- 不引用 `jiaorong-app-sdk` 的 `connect`。
- 把 HTTP 数据灌进两个组件。
- 首次 `session.create` 会写入 `sessionId`：`watch` 只在切换会话时清空；创建中保留 live。
- 发送后先画乐观用户消息；SSE 不到时轮询 `session.get`。

## Egg Node 脚手架

- `node/server.js`：`egg.start({ baseDir })` 单进程后 `listen(8787)`。
- `app/controller/sdk.js` 原样转发。
- `app/service/jiaorong.js` 调 SDK。
- `app/service/biz.js` 默认空钩子，留给业务。
- CORS + 关闭 CSRF；SSE `ctx.respond = false`。

## 依赖

- web / node：`jiaorong-app-sdk` → `file:../../../app-sdk`。
