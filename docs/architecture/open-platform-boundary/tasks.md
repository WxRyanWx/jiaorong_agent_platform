# 任务清单（开放平台目录边界划分）

## 1. 接口层归位（已完成）

- [x] `open-platform/types.ts` → `api/openPlatform/types.ts`（`git mv`，保留历史）。
- [x] `open-platform/api/index.ts` → `api/openPlatform/index.ts`，内部 import 改 `./mockApi`、`./types`。
- [x] `open-platform/api/mockOpenPlatformApi.ts` → `api/openPlatform/mockApi.ts`，内部 import 改 `./types`。
- [x] open-platform 内 5 处 `../types` / `../api` 改为 `@jiaorong/api/openPlatform[/types]`
      （`packages/parseOpenPlatformPackage.ts`、`AppsPane.vue`、`AssetPane.vue`、
      `useOpenPlatformApps.ts`、`OpenPlatformPage.vue`）。

## 2. 插件中心融合层归位（已完成）

- [x] `open-platform/renderer/openPlatformMarket.ts` → `plugins/market/openPlatformMarket.ts`。
- [x] `open-platform/renderer/openPlatformConnectorInstall.ts` → `plugins/market/openPlatformConnectorInstall.ts`。
- [x] 迁出文件的 import 改为 `@jiaorong/api/openPlatform`、`@jiaorong/api/openPlatform/mockApi`、
      `@jiaorong/api/openPlatform/types`；`../../appHost/types` 层级不变。
- [x] 5 个消费方改指向 `@jiaorong/plugins/market/*`：`stores/mcp.ts`、`McpServers.vue`、
      `SkillsPluginsPage.vue`、`SkillListPage.vue`、`useJiaorongAppCenter.ts`。

## 3. 侧栏入口归位（已完成）

- [x] `open-platform/renderer/useOpenPlatformAccess.ts` → `router/useOpenPlatformAccess.ts`，
      `../../config/appCenterAccess` 改 `../config/appCenterAccess`。
- [x] `WindowSideBar.vue` 改指向 `@jiaorong/router/useOpenPlatformAccess`。

## 4. 测试与文档（已完成）

- [x] 4 个测试文件的 import 与 `vi.mock` 路径更新：
      `test/renderer/open-platform/` 三个文件、`test/renderer/jiaorong/appCenter/appCenterBackRoute.test.ts`。
- [x] 引用 open-platform 保留模块的路径不变（`packages/parseOpenPlatformPackage`、
      `renderer/useOpenPlatformApps`、`renderer/clientAppCapabilities`）。
- [x] `jiaorong_src/README.md` 补 `api/openPlatform/`、`plugins/market/`、`open-platform/` 目录说明
      与「开放平台边界」约定第 5 条。
- [x] `HOST_TOUCHPOINTS.md` 新增 H171，登记本次涉及的上游文件与改动性质。

## 5. 验证（已完成）

- [x] `pnpm run typecheck` 通过（node + web）。
- [x] `test/renderer/open-platform`、`test/renderer/jiaorong/appCenter`、`stores/mcpStore`、
      `components/McpServers`、`components/McpSettings` 共 93 用例通过。
- [x] `oxfmt --check`、`pnpm run lint`、`pnpm run i18n` 通过。
- [x] `rg "@jiaorong/open-platform" src/renderer src/main src/preload` 无结果。

## 6. 迁出演练（已完成）

- [x] 临时把 `src/jiaorong_src/open-platform` 移出仓库，并删除 `router/apps.ts` 的页面
      loader 与 `router/apps.meta.ts` 的路由定义（二者必须同时删：loader Record 的 key
      来自 meta 的 `AppRouteName` 类型）。
- [x] `electron-vite build` 成功（✓ built，约 35s），证明除路由注册外客户端对
      open-platform 目录零构建期依赖；`ChatMainApp.vue` / `useOpenPlatformAccess.ts`
      只引用路由名字符串 `'jiaorong-open-platform'`，不 import 目录内文件。
- [x] 演练后恢复目录、还原两处路由文件；复跑 `pnpm run typecheck` 通过，
      open-platform / appCenter / mcpStore / settings 相关 81 用例通过。
- [x] 遗留失败与本次无关：`McpIndicator.test.ts`（mock store 缺 `config` 字段，
      组件本次未改）、`pluginCenterRoutes.test.ts`（`skills-apps` 路由在 HEAD 已存在，
      测试断言未跟上）。
- [ ] 启动应用手工确认插件中心三个 Tab、MCP 设置、技能中心、应用中心正常（待用户验证）。

### 真实迁出时需一并复制的反向依赖（open-platform → 客户端）

`appHost/types`、`appHost/manifestRules`、`auth/host`、`auth/lib/local-user`、
`config/storedUserInfo`、`config/identityWhitelist`、`assets/open-platform-home/*`（图片）。
客户端侧只需删除 `router/apps.ts` loader + `router/apps.meta.ts` 路由定义 +
`WindowSideBar.vue` 侧栏入口三处。

## 7. 未来真实迁出时的操作清单

见 `plan.md` 第 3 节（复制反向依赖、删路由与侧栏入口、替换 mock client）。

## 8. mock 彻底移出生产代码（已完成，2026-10-28）

- [x] `api/openPlatform/mockApi.ts` → `test/renderer/open-platform/helpers/mockOpenPlatformClient.ts`，
      仅作渲染层单测替身；内部 import 改 `@jiaorong/api/openPlatform/{types,version}`。
- [x] 生产代码零 mock 依赖：`plugins/market/openPlatformMarket.ts` 删除 `isMockOpenPlatformClient` /
      `getOpenPlatformMockAppPackagePath` 分支，`remotePackage` 直接取下载地址，
      `localPackagePath` 恒为 `null`（本地 zip 链路只服务本地 / 调试应用）。
- [x] `useOpenPlatformApps.ts` 删除 `packagePath` 兼容字段，发布只送 `package`（Blob）。
- [x] 注释中的 mock 措辞清理：`api/openPlatform/{types,version,httpApi}.ts`、`appHost/{channels,types}`、
      `appHost/appCenter/main/appCenter.ts`、`appHost/main/register.ts`。
- [x] 测试同步：`openPlatformConnectorEnable.test.ts`、`openPlatformMockAndPackage.test.ts` 改引用测试替身；
      删除只覆盖 mock 本地包路径的用例。
