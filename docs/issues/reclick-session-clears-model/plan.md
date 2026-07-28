# Plan

1. `selectSession` / `onActivated`：仅当 `activeSessionSummary?.id !== sessionId` 时清空摘要（以 await 后摘要为准，避免 activate 竞态误清）。
2. streaming 清理仍按「是否换会话」判断。
3. 单测：同会话再选、IPC 再激活、跨会话清空、activate 期间已恢复摘要不被清。
4. 登记 `HOST_TOUCHPOINTS` H54（主仓 session store，私有目录无覆盖点）。
