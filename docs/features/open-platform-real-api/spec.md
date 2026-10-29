# 开放平台真实接口接入（spec）

## 背景

开放平台的技能、连接器、应用三条链路此前全部走 `mockApi`（localStorage 存储）。
后端 `deepchat-ext/assets` 系列接口已在测试环境就绪，实测 7 个接口全部可用：

- `GET  /assets?type=&scope=&page=&pageSize=`：资产列表（分页 `hasMore`）
- `POST /assets/draft`：新建技能 / 连接器草稿（multipart：`type`、`manifest`）
- `POST /assets/publish`：发布技能 / 连接器（multipart：`type`、`id`、`version`、`file`）
- `POST /assets/app/publish`：发布应用（multipart：`id`、`manifest`、`file`）
- `POST /assets/actions`：`unpublish` / `republish` / `remove`（JSON）
- `GET  /assets/{type}/{id}/package`：包下载（**需要鉴权头**，裸请求 401）

实测细节与后端待修问题另见 `docs/open-platform-backend-issues.md`。

## 用户需求

把开放平台的 mock 数据源整体换成真实接口，插件中心（技能 / 连接器 / 应用）
照常显示与启用；后端遗留的小问题单独出一份文档交后端统一修复。

## 目标

- 新增 `httpApi`：用现有鉴权 axios 实例实现同一个 `OpenPlatformClient` 契约，
  默认 client 从 mock 切到 http；mock 仅保留给单测使用。
- 页面（`OpenPlatformPage` / `AssetPane` / `AppsPane`）与插件中心
  （`stores/mcp.ts`、`SkillListPage`、应用中心）零业务改动，只补契约必需的入参。
- 发布链路把真实 zip 送到后端：技能 / 连接器复用页面已选的 `File`，
  应用复用开发者中心已校验并回写 `app.json` 的临时包。
- 远端包下载统一带鉴权：技能安装与应用安装都不再裸 `fetch`。
- 连接器下架对账只在「市场快照完整」时执行，分页中途失败不得误删本地连接器。

## 用户可见行为

1. 开放平台技能 / 连接器 / 应用列表来自测试服真实数据，创建、发布、更新、
   下架、重新发布、移除全部落到后端。
2. 插件中心连接器 Tab 展示市场连接器，开关启用后可在对话里调用其工具（沿用既有链路）。
3. 插件中心技能 Tab 展示市场技能，安装 / 更新走真实下载地址。
4. 应用中心展示开放平台应用，安装时下载远端 zip 并校验 sha256。
5. 后端返回的中文错误消息（如「新版本必须大于当前版本」「同模块 ID 已存在」）
   原样展示在页面错误区。

## 验收标准

- [x] `getOpenPlatformClient()` 默认返回 http client；`setOpenPlatformClient` 仍可注入替身。
- [x] `listApps` / `listSkills` / `listConnectors` 循环分页直到 `hasMore === false`；
      任一页失败即抛错，不返回半份快照。
- [x] `scope=mine` 的技能列表只显示当前用户资产，市场列表只显示 `published`。
- [x] 新建草稿：`POST /assets/draft` 只带 `type` + `manifest`，返回 `status=draft`。
- [x] 发布技能 / 连接器：`POST /assets/publish` 带 `type`、`id`、`version`、`file`；
      缺 zip 时前端拦下并提示重新选择安装包，不发请求。
- [x] 发布应用：首次不带 `id`，更新带 `id`；上传的是回写过 `app.json` 的临时包。
- [x] 重新上架走 `POST /assets/actions { action: 'republish' }`，不再要求上传新包，
      版本号沿用原值。
- [x] `remove` 只对 `draft` / `unpublished` 生效；`published` 直接移除时透出后端错误。
- [x] 业务错误（HTTP 200 + `code != 200`）转成带 `code` 的 `OpenPlatformApiError`，
      消息用后端中文原文。
- [x] 技能包 / 应用包下载带 `Fusion-Auth` + `Product-Id`；非私有源地址行为不变。
- [x] 应用中心安装开放平台应用：主进程下载 → sha256 校验 → `installAppFromPackage`。
- [x] 连接器市场拉取失败或分页不完整时不触发下架对账，本地配置不被删。
- [x] `pnpm run typecheck`、`pnpm run lint`、`pnpm run i18n`、`oxfmt --check .`、相关 vitest 全绿。
- [ ] 手工验证：测试服发布连接器 → 插件中心启用 → 对话调用工具 → 下架 → 本地移除。

## 约束

- 代码位置遵循 `docs/architecture/open-platform-boundary/`：调后端的实体放
  `src/jiaorong_src/api/openPlatform/`，市场映射放 `src/jiaorong_src/plugins/market/`，
  开放平台页面目录只保留页面与上传解析。
- 不改既有 MCP 启动链路（`toggleServer → setMcpServerEnabled → startServer`）。
- 复用 `api/auth` 的 axios 实例与拦截器（自动注入 `Fusion-Auth` / `Product-Id`、
  401 静默续期重试），不新建 http 客户端。
- 主仓触点只允许 `src/preload/index.ts` / `index.d.ts`：一个新增转发方法
  （`installAppCenterRemotePackage`）、`publishDevApp` 的一个入参与一个返回字段，
  登记为 `src/jiaorong_src/HOST_TOUCHPOINTS.md` 的 H173。
- 后端未提供的字段（`provider`、`iconUrl`、`connectorType`）按可缺省处理，
  前端不得因此崩，也不得伪造。

## 非目标

- 不做后端问题的前端兜底伪造（如自己造 `provider`、自己算版本号），
  这些进 `docs/open-platform-backend-issues.md` 等后端修。
- 不引入接口层缓存、离线队列、失败重试策略。
- 不改 mock 的存储结构与既有单测语义（mock 仅作测试替身保留）。
- 不做开放平台目录迁出演练（属 `docs/architecture/open-platform-boundary/`）。
- 不改远端资产版本同步的判定口径（属 `docs/features/remote-asset-version-sync/`）。
