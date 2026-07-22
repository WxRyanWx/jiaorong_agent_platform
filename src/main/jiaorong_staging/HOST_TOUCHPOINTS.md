# Staging host touchpoints

| ID | Host path | Change | Notes |
|----|-----------|--------|-------|
| S01 | `src/main/presenter/agentRuntimePresenter/index.ts` | `processMessage` 预处理钩子；`retryMessage` 允许纯图重试 | early assistant、pending 延后到最终 abort 后 consume、persist metadata、reserve 分段、preprocess activeGeneration（成功路径留给 runStream 覆盖） |
| S02 | `src/main/presenter/agentRuntimePresenter/contextBuilder.ts` | `buildUserMessageContent` 入口一行 | `applyStoredAttachmentPreprocessToUserInput` 历史还原 |
