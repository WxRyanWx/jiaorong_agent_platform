# 实现方案

1. 将 `cleanupCancelledNewSession` 泛化为按“无消息”判定回滚的 `cleanupEmptyNewSession`。
2. 在新建会话首轮启动失败的 catch 中统一调用回滚；该方法内部继续用 `hasMessages` 保护已有用户消息。
3. 在 `test/main/session/lifecycle.test.ts` 增加首轮普通失败且无消息的回滚断言。

## 影响面

- `src/main/session/lifecycle.ts`
- `test/main/session/lifecycle.test.ts`

## 验证

- 运行 `test/main/session/lifecycle.test.ts`。
- 运行现有格式、i18n、lint 检查。
