# Plan

## Changes

1. `SessionClient.listMessagesPage` / `messageStore`：cursor 一律 plain clone 再进 IPC。
2. `messageStore`：restore 尊重 desiredCount；`loadOlderMessages` limit=16。
3. `ChatPage`：立即 restore；预取阈值 ~200px；单页补历史；打断 auto-follow；loading 绝对定位；关闭行级 content-visibility。
4. `session.ts`：先 `goToChat` 再 `activate`。
5. `ChatPage`：补历史前捕获视口消息锚点；preload 后若漂移则一次性 `scrollTop` 回退（平台无关）。
6. 测试覆盖 cursor plain clone、restore 窗口、wheel 上滑、乐观 selectSession。

## Risk

- 关闭 content-visibility 后超长会话渲染开销上升。
- 乐观导航后 activate 失败只记 error，不回滚。
- 网络等待期间用户继续上滑时，一次性锚点回退可能轻微“拽回”；阈值 ≥2px 且只跑一帧，避免旧的 heightDelta 追赶。
