# Plan

1. `config.ts`：`AUTH_API_ORIGIN_BY_MODE` + `resolveAuthApiBaseUrl()`
2. 删除 `.env.development` / `.env.production` / `.env.test`
3. `.env.example` 仅保留可选覆盖说明
4. `build:test` / `build-test.yml` 仍靠 `--mode test` 选表，无需再写 env 文件
