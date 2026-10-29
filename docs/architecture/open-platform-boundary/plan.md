# 开放平台目录边界划分（plan）

## 1. 迁移前的依赖现状（已核对）

### 1.1 客户端 → open-platform（9 处静态 import）

| 客户端文件 | 引用内容 | 归属判断 |
| --- | --- | --- |
| `src/renderer/src/stores/mcp.ts` | `listOpenPlatformMarketConnectors`、`canEnableOpenPlatformConnector`、落地与对账 helper | 插件中心逻辑，必须迁出 |
| `src/renderer/src/components/mcp-config/components/McpServers.vue` | `canEnableOpenPlatformConnector`、`isOpenPlatformConnectorConfig` | 同上 |
| `src/renderer/src/pages/plugins/SkillsPluginsPage.vue` | `listOpenPlatformMarketSkills` | 同上 |
| `src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue` | `listOpenPlatformMarketSkillMetadata` | 同上 |
| `src/jiaorong_src/appHost/appCenter/renderer/useJiaorongAppCenter.ts` | `listOpenPlatformMarketApps` | 同上 |
| `src/renderer/src/components/WindowSideBar.vue` | `useOpenPlatformAccess` | 侧栏入口，依赖客户端 `config/appCenterAccess` + router |
| `src/jiaorong_src/router/apps.ts` | `import('../open-platform/renderer/OpenPlatformPage.vue')` | 平台页面路由，属开放平台功能本身 |

`src/main`、`src/preload`、`src/shared` 对 open-platform **零引用**，主进程无需改动。

### 1.2 open-platform → 客户端（保留，迁出时随目录复制）

`../../appHost/types`、`../../appHost/manifestRules`、
`../../config/{appCenterAccess,storedUserInfo,identityWhitelist}`、
`../../auth/lib/local-user`、`@jiaorong/auth/host`、
`../../assets/open-platform-home/*`（9 个图片）、
`@/components/use-toast`、`@/stores/ui/project`、`window.jiaorongApps`。

## 2. 落位方案（遵循 `jiaorong_src/README.md` 既有约定）

```text
jiaorong_src/
  api/openPlatform/            ← 接口层（约定 3：调后端放 api/）
    types.ts                   原 open-platform/types.ts，契约与 client 接口
    index.ts                   原 open-platform/api/index.ts，get/setOpenPlatformClient
    mockApi.ts                 原 open-platform/api/mockOpenPlatformApi.ts
  plugins/market/              ← 插件中心融合层（plugins/ 已是插件中心私有目录）
    openPlatformMarket.ts      远端条目 → MCPServerConfig / UnifiedSkillItem / JiaorongAppCenterItem
    openPlatformConnectorInstall.ts  重名解析、sourceId 去重、落地配置、下架检出
  router/useOpenPlatformAccess.ts   ← 侧栏入口（约定 2：路由与入口只在 router/）
  open-platform/               ← 只剩平台自身
    renderer/*.vue  useOpenPlatformApps.ts  clientAppCapabilities.ts  knowledgeCenter.ts
    packages/parseOpenPlatformPackage.ts  styles/
```

选择理由：

- 接口 client 与契约类型是「调开放平台后端」，按约定归 `api/`；
  真实后端接入时只改 `api/openPlatform/`，插件中心不动。
- 市场映射与连接器落地服务的是插件中心，按既有 `plugins/mcp/` 的先例归 `plugins/market/`。
- 侧栏入口只依赖客户端 `config` 与 `vue-router`，本来就是客户端代码，归 `router/`。
- 不引入注册表 / `import.meta.glob` / 端口注入：迁出 open-platform 时
  只需删掉 `router/apps.ts` 的页面 loader、`apps.meta.ts` 的路由定义与侧栏入口按钮，
  这三处本来就是「开放平台功能」的组成部分。

## 3. 迁出 open-platform 时的操作清单（未来执行，非本次范围）

1. 复制 `open-platform/` 到独立仓库，连同它引用的
   `appHost/{types,manifestRules}`、`config/{appCenterAccess,storedUserInfo,identityWhitelist}`、
   `auth/lib/local-user`、`assets/open-platform-home/` 一起带走。
2. 删除客户端 `router/apps.ts` 的 `jiaorong-open-platform` loader 与 `apps.meta.ts` 的路由定义。
3. 删除 `WindowSideBar.vue` 的开放平台按钮与 `router/useOpenPlatformAccess.ts`，
   或改为跳转外部地址。
4. 删除 `ChatMainApp.vue` 里 `route.name === 'jiaorong-open-platform'` 的判断。
5. 把 `api/openPlatform/mockApi.ts` 换成真实 HTTP client（`api/openPlatform/index.ts` 的
   `setOpenPlatformClient` 已是替换点），插件中心与启动链路不需要改动。

## 4. 兼容性与风险

- 纯目录归位 + import 路径调整，无逻辑改写；`git mv` 保留文件历史。
- 已落地的连接器配置（`source: 'open-platform'`、`sourceId`）不受影响，
  下架对账仍按 `sourceId` 比对，不会误删。
- 测试里的 `vi.mock` 路径同步更新（4 个测试文件），
  引用 open-platform 保留模块（`packages/`、`useOpenPlatformApps`、`clientAppCapabilities`）
  的路径不变。
- 上游文件只有 import 行变化（`stores/mcp.ts`、`McpServers.vue`、`WindowSideBar.vue`、
  `SkillsPluginsPage.vue`），已登记 `HOST_TOUCHPOINTS.md` H171。

## 5. 验证

- `pnpm run typecheck`（node + web）通过，证明所有新路径可解析。
- `test/renderer/open-platform/`（51 用例）、`test/renderer/jiaorong/appCenter/`、
  `test/renderer/stores/mcpStore.test.ts`、`test/renderer/components/Mcp*.test.ts` 全绿。
- `oxfmt --check`、`pnpm run lint`、`pnpm run i18n` 通过。
- 交付前补做「迁出演练」：临时移出 `open-platform/` 目录跑 typecheck，确认只剩
  路由 loader 与侧栏入口两类预期报错。
