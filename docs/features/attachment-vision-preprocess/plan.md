# Plan

## Approach

1. `jiaorong_staging/attachmentPreprocess/`：识图、UI 进度、注入文本、metadata 持久化、abort 消费流。
2. `processMessage`：提前建助手、旁路识图、延后 pending consume、persist 用户 metadata、compaction 前 reserve / buildContext 后去掉 vision reserve、preprocess 期 registerActiveGeneration。
3. `contextBuilder.buildUserMessageContent`：**一行**调用 `applyStoredAttachmentPreprocessToUserInput`，历史轮次还原描述且 strip 图片 path。

## Data flow

```
processMessage
  → store displayInput（原文 + 原附件）
  → runAttachmentPreprocessTurn
       → describe → modelInput（增强 text + strip files）
       → persistUserContent（原文 text + files.metadata 描述）
  → updateMessageContent(persist)  // UI 仍原文
  → buildContext(modelInput, extraReserve=tools only)
       → history: buildUserMessageContent → applyStored… 注入描述
  → runStreamForMessage(initialBlocks)
```

## Host touchpoints

| ID | Path | Change |
|----|------|--------|
| S01 | `agentRuntimePresenter/index.ts` | processMessage 钩子 |
| S02 | `contextBuilder.ts` | `buildUserMessageContent` 入口一行 rehydrate |

## Test strategy

- 单元：注入、clear UI、path-only、reserve、pickVision（不回落 CoT）、metadata persist/rehydrate、abort race
- 不跑全量 e2e
