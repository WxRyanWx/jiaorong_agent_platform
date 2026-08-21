# 任务

1. [x] `jiaorong_src/provider/builtinSecret.ts` 密封/解开
2. [x] `defaults.ts` 改为密封串
3. [x] 密封脚本放到 `jiaorong_src/provider/scripts`，复用 `builtinSecret.ts`
4. [x] 测试 + H71
5. [x] `tsconfig.app.json` 排除 `provider/scripts`，避免 `typecheck:web` 扫到 `.ts` 扩展名 import

