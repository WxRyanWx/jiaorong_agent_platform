# conversation-timing-x-trace-id

## Goal

将模型 HTTP 响应头中的 `x-trace-id` 写入现有 conversationTiming 本地日志，便于与 MaaS 侧联调排查。

## Acceptance

- 对话一轮结束写入的 `timing.jsonl` 含 `xTraceIds: string[]`（按本轮模型请求顺序；无则 `[]`）
- 仅在 Electron 主进程旁路观测；实现落在 `src/jiaorong_src`
- 只读响应头，不消费/不克隆 Response body，不影响 SSE 流
- 观测失败吞错，不影响对话主链路
- 用 AsyncLocalStorage 按 `sessionId` 关联，避免多会话串台
- 仅匹配模型对话类 URL（如 `/messages`、`/chat/completions`、`/responses`），忽略 embedding 等

## Non-goals

- 不上报远端、不改开源 processStream / provider 业务逻辑
- 不在 UI 展示 trace id
- 不要求非 MaaS 提供商一定返回该头
