# Plan

在现有 `conversationTiming` 旁路上扩展：请求上下文 + fetch 观测。

## Data flow

```
runStreamForMessage(sessionId)
  └─ ALS.run({ sessionId })
       └─ AI SDK createFetchMiddleware → global fetch
            └─ Response headers: x-trace-id
                 └─ tracker.recordXTraceId(sessionId, id)  // 仅内存
                      └─ finishTurn → timing.jsonl 含 xTraceIds
```

## Approach

1. `modelTraceContext.ts`：AsyncLocalStorage + URL 白名单判断
2. `installMain.ts`：
   - patch `AgentRuntimePresenter.runStreamForMessage` 进入 ALS
   - patch `globalThis.fetch`：有 ALS 且 URL 命中时读头并记入 tracker；原样返回 Response
3. `tracker` / `types`：active turn 累积 `xTraceIds`，finish 时写入

## Performance / isolation

- ALS 未激活时：仅一次 `getStore()`（undefined），不解析 URL、不读头
- 记 id 为同步内存 push（O(1)），不在 fetch 路径写盘
- 全程 try/catch；先完成原 fetch，再旁路

## Compatibility

- 旧日志无此字段；新记录始终带 `xTraceIds`（可为空数组）
