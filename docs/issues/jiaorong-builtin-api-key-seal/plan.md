# 计划

1. 密封/解开放在 `@jiaorong/provider/builtinSecret`；`defaults.ts` 只存 `jrk1` 串并 reveal。
2. 旋转密钥用 `seal-builtin-secret.mjs`，内部调用同一份 `builtinSecret.ts`。
3. 测试：往返加密、内置 Provider 解开后非空。
