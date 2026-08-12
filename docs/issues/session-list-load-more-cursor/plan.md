# Plan

1. `SessionClient.listLightweight`：对 `cursor` 做 plain `{ updatedAt, id }` clone（与 `listMessagesPage` 同模式）。
2. 测试：reactive cursor 可 structuredClone。
