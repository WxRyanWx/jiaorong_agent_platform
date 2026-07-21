# Jiaorong 私有包（`src/jiaorong_src`）

交融定制代码的独立小子项目。开源主仓只通过 `@jiaorong` 别名与 `mountJiaorong()` 挂载。

## 目录

```text
jiaorong_src/
  index.ts           # 唯一出口：mountJiaorong()
  HOST_TOUCHPOINTS.md
  api/               # 调用自有后端（与登录同域）
    auth/            # 扫码/账号登录 HTTP
    skills/          # 技能市场 API（占位）
  auth/              # 扫码登录 UI + 门禁/会话 lib
    pages/LoginPage/
    components/      # CodeLogin / UserCompact
    lib/             # guard / session / deeplink …
    assets/
  skills/            # V0.6 技能中心
    routes.ts module.ts
    pages/SkillListPage/ SkillDetailPage/
  utils/ runtime/
```

## 约定

1. **新业务默认写这里**，不要散落到 `src/main` / `src/renderer` 开源路径。
2. **新模块**：建 `xxx/module.ts` 并 `export default`，再在 `runtime/discover.ts` 的 `BUILTIN_MODULES` 里显式 `import` 一行（禁止 `import.meta.glob({ eager: true })`，以免拖慢首屏）。
3. **调自有后端**：放 `api/`，复用 `api/auth` 的 origin（`c4ai.ccccltd.cn` / `VITE_AUTH_API_ORIGIN`）。
4. **改开源主仓**：必须记入 `HOST_TOUCHPOINTS.md`。

## 引用

```ts
import { mountJiaorong } from '@jiaorong'
import { FeatchUserInfo } from '@jiaorong/api/auth'
import { setupAuthGuard, getToken } from '@jiaorong/auth'
import { SKILL_ROUTE_DEFS } from '@jiaorong/skills/routes'
```

兼容：`import … from '@api/auth'` → HTTP 薄 re-export（`src/renderer/api/auth`）。  
门禁/会话请直接 `import … from '@jiaorong/auth/lib/…'`（已无 `@/lib/auth` shim）。
