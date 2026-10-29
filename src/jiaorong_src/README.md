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
    openPlatform/    # 开放平台资产接口 + mock；客户端只读市场列表，契约见 types.ts
  auth/              # 扫码登录 UI + 门禁/会话 lib
    pages/LoginPage/
    components/      # CodeLogin / UserCompact
    lib/             # guard / session / deeplink / ensureSm4 …
    vendor/sm4/      # 账号密码登录按需加载
    assets/
  config/            # 设置侧栏白名单等私有配置
  prompts/           # 默认系统提示词文案（非设置页 UI）
  brand/             # APP_NAME / UA / 水印；theme.less 主题覆盖
  router/            # 私有路由唯一维护处（子模块不维护 routes）
    index.ts         # createJiaorongRoutes()
    auth.ts skills.ts skills.meta.ts
  auth/host.ts       # 宿主登录薄入口
  runtime/sidebar.ts # 侧栏贡献同步列表
  skills/            # 技能中心页面 + module（无 routes）
    pages/SkillListPage/ SkillDetailPage/
  utils/ runtime/
  appHost/           # 嵌入应用平台：目录、扫描、权限、协议、preload、window.jiaorong
  plugins/           # 插件中心私有目录
    mcp/             # 预置 MCP 触点
    market/          # 远端资产 → 插件中心模型的映射、连接器落地与下架对账
  open-platform/     # 开放平台页面（上传 / 发布 / 管理），可整体迁出
```

## 约定

1. **新业务默认写这里**，不要散落到 `src/main` / `src/renderer` 开源路径。
2. **新模块**：建 `xxx/module.ts`（侧栏等贡献）并在 `runtime/modules.ts` 登记；**路由只加 `router/`**，子模块不写 routes。
3. **调自有后端**：放 `api/`，地址在 `api/auth/config.ts` 按 Vite mode 全自动选择（dev/test→测试服，production→正式服）。
4. **改开源主仓**：必须记入 `HOST_TOUCHPOINTS.md`。
5. **开放平台边界**：插件中心要用的东西（接口 client、契约类型、市场映射、连接器落地）
   一律放 `api/openPlatform/` 与 `plugins/market/`，**不要写进 `open-platform/`**；
   `open-platform/` 只放平台自身页面与上传解析，保证该目录整体迁走后客户端照常编译运行。

## 引用

```ts
import { mountJiaorong } from '@jiaorong'
import { createJiaorongRoutes } from '@jiaorong/router'
import { FeatchUserInfo } from '@jiaorong/api/auth'
import { bootstrapJiaorongRendererAuth, getToken, loadLoginPage } from '@jiaorong/auth/host'
import { listJiaorongSidebarItems } from '@jiaorong/runtime/sidebar'
import { APP_NAME } from '@jiaorong/brand'
import '@jiaorong/brand/theme.less' // 宿主 main.ts 静态加载主题覆盖
```


兼容：`import … from '@api/auth'` → HTTP 薄 re-export（`src/renderer/api/auth`）。  
宿主登录相关请走 `@jiaorong/auth/host`；**私有页面路由请走 `@jiaorong/router`**，勿在宿主散落各子模块 loader。
