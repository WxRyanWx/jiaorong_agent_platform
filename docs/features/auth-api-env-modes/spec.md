# auth-api-env-modes

## Goal

自有后端 API 根地址按 Vite mode 选择；唯一维护在私有 `api/auth/config.ts`。

## Acceptance

- `pnpm dev`（mode=development）→ 测试服
- `pnpm build`（mode=production）→ 正式服
- `pnpm build:test` / GitHub Build Test Application（mode=test）→ 测试服
- 改地址只改 `src/jiaorong_src/api/auth/config.ts` 一处；无需改 .env

## Non-goals

- 在仓库根维护多份 `.env.[mode]` 重复写 origin
- 改 axios / interceptor 业务请求逻辑
