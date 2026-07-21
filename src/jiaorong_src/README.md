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
    lib/             # guard / session / deeplink / ensureSm4 …
    vendor/sm4/      # 账号密码登录按需加载
    assets/
  config/            # 设置侧栏白名单等私有配置
  prompts/           # 默认系统提示词文案（非设置页 UI）
  brand/             # APP_NAME / UA / 水印等品牌常量
  router/            # 私有路由唯一维护处（子模块不维护 routes）
    index.ts         # createJiaorongRoutes()
    auth.ts skills.ts skills.meta.ts
  auth/host.ts       # 宿主登录薄入口
  runtime/sidebar.ts # 侧栏贡献同步列表
  skills/            # 技能中心页面 + module（无 routes）
    pages/SkillListPage/ SkillDetailPage/
  utils/ runtime/
```

## 约定

1. **新业务默认写这里**，不要散落到 `src/main` / `src/renderer` 开源路径。
2. **新模块**：建 `xxx/module.ts`（侧栏等贡献）并在 `runtime/modules.ts` 登记；**路由只加 `router/`**，子模块不写 routes。
3. **调自有后端**：放 `api/`，复用 `api/auth` 的 origin（`c4ai.ccccltd.cn` / `VITE_AUTH_API_ORIGIN`）。
4. **改开源主仓**：必须记入 `HOST_TOUCHPOINTS.md`。

## 引用

```ts
import { mountJiaorong } from '@jiaorong'
import { createJiaorongRoutes } from '@jiaorong/router'
import { FeatchUserInfo } from '@jiaorong/api/auth'
import { bootstrapJiaorongRendererAuth, getToken, loadLoginPage } from '@jiaorong/auth/host'
import { listJiaorongSidebarItems } from '@jiaorong/runtime/sidebar'
import { APP_NAME } from '@jiaorong/brand'
```

兼容：`import … from '@api/auth'` → HTTP 薄 re-export（`src/renderer/api/auth`）。  
宿主登录相关请走 `@jiaorong/auth/host`；**私有页面路由请走 `@jiaorong/router`**，勿在宿主散落各子模块 loader。
