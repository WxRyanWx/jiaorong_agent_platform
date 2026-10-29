# 远端资产版本同步（plan）

## 1. 版本号来源

发布侧新增必填 `version`（semver 三段式，与应用 manifest 同一格式）。
`OpenPlatformAssetSummary.version` 字段契约里本来就有（此前技能/连接器恒为 `null`），
mock 发布时写入真实值后，市场列表（`listConnectors('market')` / `listSkills`）
自然携带版本，客户端不需要新增请求。真实后端接入后按同一契约返回即可。

版本比较逻辑从 `mockApi.ts` 的私有 `compareVersion` 提取到
`src/jiaorong_src/api/openPlatform/version.ts`（`compareOpenPlatformVersions` /
`isValidOpenPlatformVersion`），mock 校验与客户端更新判定共用一份实现。

解析容错口径（发布校验与更新判定共用）：

- `parseVersionParts` 先剥掉 `v` / `V` 前缀，真实后端若返回 `v1.2.0` 这类 tag
  仍可比较，避免整条更新判定静默失效。
- `isValidOpenPlatformVersion` 保持严格（不接受 `v` 前缀），只用于发布入参校验。
- `isNewerOpenPlatformVersion(市场, 本地)`：市场为空或不可解析 → 不提示更新；
  本地为空或不可解析（历史写入、手改配置、后端换格式）→ 视为可更新，
  点击后用市场版本覆盖，不会永久卡在「无更新」状态。

## 2. 开放平台发布表单（AssetPane.vue）

- 每张卡片新增 `publishVersions[item.id]`，刷新时用 `item.version ?? ''` 预填，
  用户更新发布时只需把号往上抬。
- 输入框放在「提供组织」左边，同一行 `open-platform-pane__publish-meta` 内，
  复用 `__provider-field` 样式结构，必填红星一致。
- 发布 / 更新 / 重新发布按钮的 disabled 判定从 `isPublishProviderReady`
  扩为 `isPublishReady`（组织 + 版本都非空）；`startUpdate` 同步校验。
- 客户端只做非空预检；格式与递增校验交给 API（mock 返回中文错误信息直接展示），
  真实后端接入后校验口径不变。

## 3. mock 校验（mockApi.ts）

- `OpenPlatformSkillPublishInput` / `OpenPlatformConnectorPublishInput` 增加
  `version?: string`（与 `provider` 同模式：创建草稿不要求，发布必填）。
- `normalizeSkillInput` / `normalizeConnectorInput` 在 `requireProvider` 时
  校验 semver 格式并写入 `version`；草稿仍为 `null`。
- `publishAsset` 的递增校验从 `current.type === 'app'` 放宽到所有类型，
  并按场景分级（收敛到 `assertPublishVersion`）：
  - 提交新制品（`nextAsset.packagePath` 或 `config` 有值，或当前为已上架状态）：
    `compareVersion(next, current) <= 0` → `VERSION_NOT_INCREASED`（`新版本必须大于 x`）。
  - 仅恢复可见性（当前为 `unpublished` 且本次不带新制品）：沿用原版本号，
    仅 `compareVersion(next, current) < 0` 时报错（`重新上架的版本号不能低于 x`）。
  - 旧数据 `version: null` 首次发布跳过校验。
- `AssetPane.vue` 确认气泡文案区分两条路径：更新提示「版本号需高于 x」，
  重新发布提示「可沿用当前版本号」；版本输入框保持可编辑并预填当前版本，
  这样历史 `version: null` 的数据补填后仍可重新上架。

## 4. 连接器本地存储与更新

`MCPServerConfig`（`src/shared/types/mcp.ts`）新增可选字段：

```ts
/** 开放平台连接器落地时的远端版本号，用于检测更新。 */
sourceVersion?: string
```

主进程零改动（已核实）：

- `normalizeServerConfig`（`src/main/mcp/settings.ts:384`）clone + spread 全量保留自定义字段。
- `bindingMaterial`（`src/main/mcp/serverIdentity.ts:86`）只含
  `type` / `baseUrl` / `command` / `authorization`，写 `sourceVersion` 本身不触发重连。
- `generationMaterial` 含 `args` / `env` / `customHeaders` / `inheritEnv`，
  连接参数变化 → `configGeneration + 1` → 启用中的服务器由既有机制自动重连。

更新判定（`plugins/market/openPlatformConnectorInstall.ts`）：

```
findOutdatedConnectorServers(servers, marketItems) →
  本地 source === 'open-platform' 且按 sourceId 命中市场条目，
  且 isNewerOpenPlatformVersion(市场 version, 本地 sourceVersion) 为真
```

本地无 `sourceVersion` 或其值不可解析时视为可更新（历史安装补写版本），与应用中心
`installedVersion` 缺失时的语义一致。

更新动作（`stores/mcp.ts` 新增 `updateOpenPlatformConnector(serverName)`）：

```ts
const nextConfig = toUpdatableConnectorConfig(marketServer)
// = toInstallableConnectorConfig 去掉 enabled 字段
await updateServer(serverName, nextConfig)
```

- 不传 `enabled`，主进程 `{...current, ...config}` 合并后保留原开关状态；
  `authorization` 不在更新载荷里，配置项本身保留。
  注意：`sourceVersion` 不进 `bindingMaterial` / `generationMaterial`，只抬版本号
  不会抬升 `configGeneration`；连接参数真的变了才会重启服务，
  此时主进程 `updateMcpServer` 会按既有策略清掉该 `serverId` 的 OAuth 凭据，
  需要重新认证的服务器由卡片上既有的认证按钮兜底。
- 成功 → `notifyRenderer` info `settings.mcp.openPlatformConnectorUpdated`；
  失败 → error `settings.mcp.openPlatformConnectorUpdateFailed`，旧配置不动。
- store 暴露 computed `connectorUpdatesAvailable: Record<serverName, marketServer>`
  供卡片判定，市场列表本身不出 store。

## 5. 连接器 UI（McpServerCard / McpServers）

- `McpServerCard.vue` 新增可选 props `updateAvailable` / `isUpdating` 与
  `update` emit；按钮放在底部控制区认证按钮与开关之间，
  outline 小按钮 + `lucide:arrow-up-circle` 图标 + `settings.mcp.updateAvailable` 文案，
  更新中显示 Spinner。props 缺省时卡片与现状完全一致（其他调用方零感知）。
- `McpServers.vue` 接线：`:update-available="Boolean(connectorUpdates[server.name])"`、
  `@update="handleUpdateConnector(server.name)"`，组件内维护
  `updatingConnectorNames`（与 `installingConnectorNames` 同模式）。

## 6. 技能版本与更新

- `listOpenPlatformMarketSkillMetadata` 的 metadata 增加
  `version`（`item.version`）与 `downloadUrl`（`item.latestRelease.downloadUrl`），
  安装链路 `getDownloadUrl` / `handleInstall` 无需改动即可工作。
  mock 阶段该 URL 不可真实下载（mock 不存 zip），按钮显隐逻辑可验证，
  端到端安装需真实后端，属 mock 既有限制。
- `skills/lib/sessionSkill.ts` 的 `remoteInstallMap` 存储值扩展为
  `string | { localName, version }`，读取时归一化：
  - `loadRemoteInstallMap()` 签名不变（marketName → localName），既有消费方零改动。
  - 新增 `loadRemoteInstallVersions()`（marketName → version）。
  - `rememberRemoteInstall(market, local, version?)` 第三参可选，旧调用兼容。
  - `forgetRemoteInstall` / `pruneRemoteInstallMap` 适配对象值。
- `SkillListPage.vue`：
  - `remoteInstalledVersions` 随 `refreshMarket` / `markRemoteSkillInstalled` 同步。
  - `hasSkillUpdate(skill)`：`metadata.openPlatform === true` 且已安装且市场版本非空
    且 `isNewerOpenPlatformVersion(市场版本, 已装版本)` 为真
    （无已装版本记录或记录值不可解析都算可更新）。
  - 卡片已安装分支新增「更新」按钮（硬编码中文，与该页既有文案风格一致），
    点击复用 `handleInstall`；成功后 `rememberRemoteInstall` 带上市场版本。
    同名目录冲突由 `installSkillFromZipUrl` 既有覆盖确认弹窗兜底。

## 7. i18n（20 语言）

- `routes.json`：`openPlatformPublishVersion`（版本号）、
  `openPlatformPublishVersionPlaceholder`、`openPlatformPublishVersionRequired`。
- `settings.json`：`settings.mcp.updateAvailable`（更新）、
  `openPlatformConnectorUpdated` / `openPlatformConnectorUpdatedDesc`（{name} 占位）、
  `openPlatformConnectorUpdateFailed`。

## 8. 测试策略

- mock API（`openPlatformMockAndPackage.test.ts`）：技能/连接器发布缺版本号报错、
  非法格式报错、递增校验、首发布跳过校验；改写原
  「publishes and updates skills without version checks」用例。
- 重新上架口径（同上文件）：应用/连接器下架后沿用原版本号重新发布成功、
  版本号降低时报 `VERSION_NOT_INCREASED`、下架后带新 zip 重新发布仍要求递增。
- 连接器 store（`openPlatformConnectorStore.test.ts`）：市场版本更高 →
  `connectorUpdatesAvailable` 命中；点击更新 → `updateServer` 载荷不含 `enabled`、
  含新 `sourceVersion`；版本相同不命中；本地无 `sourceVersion` 命中（补写）。
- 纯函数（`openPlatformConnectorEnable.test.ts` 或新文件）：
  `findOutdatedConnectorServers` 边界（空市场、非 open-platform 源、sourceId 不匹配）。
- sessionSkill：旧字符串 map 归一化、带版本读写、prune/forget 保留版本。
- 回归：`test/renderer/open-platform/` 全部 + `stores/mcpStore` + MCP 组件用例全绿。

## 9. 实施顺序

1. `api/openPlatform/version.ts` 提取 + mock 校验 + types（发布侧闭环，先可单测）。
2. `AssetPane.vue` 版本输入框 + routes i18n。
3. `shared/types/mcp.ts` + 融合层（market / install）+ `stores/mcp.ts` + 卡片 UI + settings i18n。
4. 技能侧（market metadata + sessionSkill + SkillListPage）。
5. 测试补充与全量验证，更新 `HOST_TOUCHPOINTS.md`（McpServerCard、shared/types 首次触及）。
