# 计划

- `src/cli/discovery.ts` 默认 profile 从 `DeepChat` 改为 `JiaorongAI`。
- 契约增加 `JIAORONG_CLI_USER_DATA_DIR`；发现顺序：该变量 → `DEEPCHAT_E2E_USER_DATA_DIR` → 默认 profile。
- 智能体 exec 注入真实 userData：新 CLI 读 `JIAORONG_CLI_USER_DATA_DIR`；已打包的旧 CLI 只认 E2E 变量，因此同时写入 `DEEPCHAT_E2E_USER_DATA_DIR`。
- `composition.ts` 把 `app.getPath('userData')` 交给 `AgentCliCommandAccess`。
- 用户可见 CLI 不可用文案同步品牌。
- `jiaorong-cli` 技能：当前会话模型不走 CLI；CLI 失败不要拿 `providers.json` 当现网配置。
- `pnpm cli:build` 重建 `out/cli/deepchat.mjs`，否则开发态仍跑旧包。
