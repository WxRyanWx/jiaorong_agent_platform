# Plan

1. `ChatTabView`：`pageRouter.initialize` 使用 `sessionStore.activeSessionId`，不用缓存 bootstrap 里的陈旧 id。
2. 单测：bootstrap 快照有旧 session、store 已清空时，initialize 应为 `null`。
3. 登记 HOST_TOUCHPOINTS。
