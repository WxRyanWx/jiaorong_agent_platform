# 实现

1. SDK `localize.ts`：映射 `common.error.*` 与错误码；`isUserCanceledError` 识别手动停止。
2. `chat.stream.failed` 若是用户取消，不写顶部 `errorText`；`JiaorongAgentChat` 再过滤一层。
3. `MessageBlockError` / `JiaorongChatContent`：取消 key 走「已停止生成」，其它内容走中文映射。
4. `connect` / `client` / `http` / `helpers` throw 文案改中文；demo `formatError` 走 SDK 格式化。
