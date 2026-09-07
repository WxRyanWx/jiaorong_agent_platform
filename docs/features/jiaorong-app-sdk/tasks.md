# 应用 SDK 梳理

对照《JiaorongAI 应用 SDK 开发者使用文档》。宿主嵌入（侧栏 / preload / spawn）不在本包。

## 已完成

- [x] 独立包 `jiaorong-app-sdk` + tsdown + OSS tgz
- [x] `connect({ appId, runtime })`，web / node 桥校验
- [x] `NOT_IN_JIAORONG` / `JIAORONG_NOT_RUNNING` / `VALIDATION_ERROR`
- [x] `getContext`：userId、orgId、locale、theme、appId、appDir、**token**、apiBaseUrl、productId
- [x] `getToken` / `getAuthHeaders`（Fusion-Auth + Product-Id）
- [x] `agent.create|get|list`；只传 `skills` 时补 `enabledSkillNames`
- [x] `session.create|list|search|get|rename|pin|delete|send|stop|steer`
- [x] `on/off/once`、`respondToolInteraction`、`disconnect`（最后引用才拆桥）
- [x] `connect` 并发去重 + 每 holder 自己的监听
- [x] invoke 超时吞掉迟到 reject；`waitForTurn` 在 disconnect 时取消
- [x] `findPendingQuestion` 要求 `tool_call.id`；`session.list` 必须 `agentId`
- [x] `waitForTurn`、解析历史、找批准块、去 data URL 前缀
- [x] `isJiaorongWeb` / `isJiaorongNode`
- [x] demo：直连页 + Node 转发页；本期不启动 Node

## 待补（本包，按优先级）

- [x] 官方对话类型对齐：`UserMessageContent`、`UserMessageInlineItem`；`SendMessageInput.inlineItems` 不要 `unknown[]`
- [x] `AssistantMessageBlock.status` / `extra`（plan_entries、permissionType、granted/denied）
- [x] `parseUserMessage`、`findPendingQuestion`
- [x] `session.stop` 必须带 `sessionId` 或 `requestId`
- [x] `JiaorongError` 跨打包 `instanceof` + `toJSON`（`err.code`）
- [x] 构建用 TypeScript 5，避免 dts 走实验 API
- [x] README 列出完整方法表
- [x] `jr.catalog.slash` 暴露 `/` 技能与工具列表
- [x] demo `#/` / `#/node` 对话 + 智能体 JSON 创建 + inspectChatStream.js

## 宿主实现（不在本包）

- [x] preload 注入 `window.jiaorong`（M1：`context.get`）
- [x] 侧栏加载目录、权限过滤、打开 web-ui
- [ ] spawn Node 时注入 `globalThis.jiaorong`
- [ ] 未登录时 agent/session 抛 `UNAUTHORIZED`

## 明确不做

- 不把 stream 拆成 text / approval 事件
- 不给 restore 加 `contentParsed`
- 不 `import electron`
- 本期不验证 Node 进程
