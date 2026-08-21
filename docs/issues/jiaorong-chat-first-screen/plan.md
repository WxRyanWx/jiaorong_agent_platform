# 计划

- 对齐 master：`restoreMessageWindow` 下限从 40 改回 1，请求几条就 restore 几条。
- 交融窗口策略常量放 `@jiaorong/chat/messageWindowPolicy`：首屏 10、上滑 20、距顶预取像素。
- 宿主 `message.ts` / `ChatPage.vue` 只引用，不在开源路径维护数字。
- `loadMessages` 无 override 时默认 10，同会话刷新用 `max(已有条数, 10)`。
- 距顶预取：用户占用滚动时立即 `loadOlderMessagesAtTop`，不等 idle。
- 同一段 wheel 手势不重复 `notifyUserGestureStart`，避免把进行中的 `history-prepend` 取消掉。
- `loadOlderMessagesAtTop` 用 epoch 锁包住请求到补偿，防止 `isLoadingHistory` 清掉后的空窗连发第二页。
- 手势中允许 `history-prepend` 补偿（上游滚动状态机，不抽走）。
- 手势中允许 `history-prepend` 补偿（上游滚动状态机，不抽走）。
- 程序滚动不预取。已在顶且只能 wheel 的路径仍走 idle 回调。
