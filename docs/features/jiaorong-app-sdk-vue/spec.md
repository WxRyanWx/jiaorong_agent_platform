# SDK Vue 对话组件（非 chat-kit）

## 目标

在 `jiaorong-app-sdk` npm 包内提供两个 Vue 组件，供外部团队 `pnpm add` 后引用。视觉与消息块数据结构对齐超级智能体官方页，**不改动** demo `chat-kit`。

## 组件

1. `JiaorongAgentChat`：消息区 + 输入框。渲染对话、思考、工具/技能调用、文件读写，与官方 `MessageItem*` / activity-group / tool-call pill 一致。不要知识库按钮，不要 `/` 技能工具面板。
2. `JiaorongAgentSessionList`：`appId` + `agentId` 拉会话。搜索框 + 扁平列表（不区分聊天/工作区，不要新会话按钮）。点击后通过 `v-model:sessionId` 驱动组件一加载同一套 `ChatMessageRecord`。

## 验收

- 从 `jiaorong-app-sdk/vue` 导入；样式 `jiaorong-app-sdk/vue/style.css`。
- 核心 `connect` 入口仍为零 Vue 依赖。
- 消息 `content` JSON、助手块类型与官方 `AssistantMessageBlock` / SDK `parseAssistantBlocks` 一致。
- 不改动 demo `chat-kit`（已迁入 SDK 第三组件，见 scaffold）。

## 非目标

- 不把现有 chat-kit 搬进 SDK（后续已迁入，见 scaffold）。
- 不做 `@` 引用面板、语音、联网搜索、TipTap、工作区、落地页。
- 未选会话时输入发送自动 `session.create`。
