# chat-history-open-slow

## Goal

点击侧栏对话记录进入已有会话时，消息区域尽快出现；上翻时更早消息以小页懒加载补齐。

## Problem

1. `ChatPage` 用 `scheduleStartupDeferredTask` 推迟 restore，最多空等约 800ms idle。
2. `selectSession` 先 `await activate` 再导航，激活 IPC 挡住进入页。
3. **上翻分页 IPC 失败**：`nextCursor` 经 Pinia 变成 Vue Proxy，`listMessagesPage` IPC structured clone 失败。
4. restore 贴底 programmatic scroll 与顶部 scroll/wheel 触发 race。
5. 过大分页 / 进页预取会一次拉满；贴顶才触发又容易看到加载中。
6. `content-visibility` + 300px 占位在 prepend 后收矮，造成上翻回跳。

## Acceptance

- 切换会话后立即发起 restore（无 startup idle）。
- `selectSession` 先导航再 `activate`。
- 首屏 restore 约 8 条；不做进页整页预取。
- 更早消息按每次约 16 条分页；预取阈值约 `max(200px, 0.25 * 视口高度)`。
- 每次触发只补一页；优先依赖浏览器 overflow-anchor；若 prepend 后锚点消息相对视口漂移 ≥2px，再用一次性 JS 消息锚定回退修正（不连续 heightDelta 追赶）。
- 补历史期间禁止 `scrollToBottom` / auto-follow 贴底。
- 消息行关闭 `content-visibility` 占位，避免 prepend 后视口回跳。
- 顶部 loading 绝对定位，不挤占文档流；`wheel` 在贴顶时可触发加载。

## Non-goals

- 全量虚拟列表重做。
- 跨会话 LRU / hover 预取。
- 将 DeepChat 宿主 ChatPage/message store 整体迁入 `jiaorong_src`。
