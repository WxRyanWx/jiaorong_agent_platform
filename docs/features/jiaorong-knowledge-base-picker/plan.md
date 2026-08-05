# Plan

1. API / selection / Dialog / Button / Chips：放在 `jiaorong_src`
2. 开源宿主：
   - `ChatInputToolbar` `#after-attach`
   - `ChatInputBox` `#context-chips` + `hasContextChips`
   - `ChatPage` / `NewThreadPage` 直接挂载按钮与 chips，提交成功后 clear selection
3. 不使用 Vite alias 包装 `ChatInputBox` / `ChatInputToolbar`（避免 expose/事件穿透与双层组件开销）
