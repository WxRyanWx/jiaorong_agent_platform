# 开放平台市场融合修正（plan）

## 实现思路

### 1. 资产契约补字段

后端 `assets` 列表项里，`downloadUrl` 是**顶层字段且所有条目都有**；
`latestRelease.downloadUrl` 只有 `source:'open-platform'` 的条目才有。
客户端此前只读后者，导致 legacy 技能没有下载地址。

- `api/openPlatform/types.ts`：`OpenPlatformAssetSummary` 增 `downloadUrl: string`
  与 `categoryId?: string`。
- `api/openPlatform/httpApi.ts`：`toAssetSummary` 解析顶层 `downloadUrl`、`categoryId`。
- `api/openPlatform/mockApi.ts`：同步补这两个字段，保持契约一致。
- `plugins/market/openPlatformMarket.ts`：新增 `resolveAssetDownloadUrl(item)`，
  口径为 `latestRelease.downloadUrl || 顶层 downloadUrl`；应用与技能两条链路共用。

### 2. 技能市场单一数据源

数据流改为：

```
assets?type=skill&scope=market
  → listOpenPlatformMarketSkillListItems()   // plugins/market，映射成 RemoteSkillListItem
  → buildSkillMarketCatalog({ fetchRemote }) // skills/lib，本地扫盘 + 远程合并
  → SkillListPage                            // 只渲染 merged，不再追加第二份
```

- `RemoteSkillListItem` 增可选 `version` / `openPlatform`；`mergeSkillMarketCatalog`
  在有值时透传进 `metadata`，供更新判定使用。
- 映射口径：`id` = 资产 id、`name` = 资产 name（中文展示名，`ensureDefaultSkills` 依赖）、
  `description` = 资产 description、`downloadUrl` = `resolveAssetDownloadUrl`、
  `categoryId` 容错、`version` = `item.version || latestRelease.version`、`openPlatform` = true。
- `api/skills/index.ts`：`fetchSkillMarketCatalog` 的 `fetchRemote` 换成上面的函数；
  删除 `listRemoteSkills` / `mapRemoteSkillList`（旧列表接口不再有调用方）；
  `getSkillDetail` / `listSkillCategories` 保持不动。
- `skills/lib/ensureDefaultSkills.ts`：默认技能补装改用同一映射函数，
  `RemoteSkillSeedItem` 结构不变（仍按中文 name 匹配）。
- `plugins/market/openPlatformMarket.ts`：删除 `listOpenPlatformMarketSkillMetadata`
  （唯一调用方是 `SkillListPage`，改造后不再需要第二份数据）。
- `SkillListPage.vue`：删掉 `openPlatformByName` / `openPlatformCards` 追加逻辑；
  `attachLocalInstall` 增加按 `metadata.remoteId` 的兜底查找，
  让此前以资产 id 为键写入的 `remoteInstallMap` 记录仍能识别为已安装。

### 3. 应用更新链路

- `useJiaorongAppCenter.refresh()`：本地卡与远端卡按 id 合并时，除 `provider` 外
  一并带入 `version` / `downloadUrl` / `packageSha256` / `remotePackage`，
  并用 `isNewerOpenPlatformVersion(远端 version, 本地 installedVersion)`
  把 `installStatus` 抬成 `update_available`。
- 安装分支不变：`localPackagePath` > `downloadUrl` > OSS 目录，
  更新会自然走 `installAppCenterRemotePackage`（主进程带鉴权下载 + sha256 校验）。
- `AppCenterPage.vue` 无需改动：`primaryActionKey` / `versionLabel` / `showPrimaryAction`
  已经按 `update_available` 与 `remotePackage` 工作。

### 4. MCP 初始化不阻塞

- `stores/mcp.ts` 的 `init()`：`await loadOpenPlatformConnectors()` 改为 `void`，
  让 `loadPrompts / loadTools / loadClients` 不再等开放平台网络请求。
  进入连接器页时 `McpPluginsPage.onMounted` 仍会拉取；`loadOpenPlatformConnectors`
  内部已有单飞去重（`connectorSyncPromise`），不会重复请求。
- `syncOpenPlatformConnectors`：把「列表拉取失败」与「下架对账失败」分开 catch，
  对账抛错时保留已成功拉取的市场列表，不再清空。

### 5. 发布卡片布局

- `open-platform.less`：`.open-platform-pane__provider-field` 由 `flex:1 1 auto` +
  `justify-content:flex-end` 改为 `flex:none` + 左对齐，两个字段紧随状态徽章相邻排列；
  `.open-platform-pane__version-input` 宽度对齐 `.open-platform-pane__provider-input`（180px），
  使「请输入版本号，例如 1.0.0」完整可见。按钮组仍由 `card-actions` 的 `margin-left:auto` 靠右。

## 受影响接口与文件

| 文件 | 改动 |
| --- | --- |
| `src/jiaorong_src/api/openPlatform/types.ts` | summary 增 `downloadUrl` / `categoryId` |
| `src/jiaorong_src/api/openPlatform/httpApi.ts` | 解析顶层 `downloadUrl` / `categoryId` |
| `src/jiaorong_src/api/openPlatform/mockApi.ts` | 契约对齐 |
| `src/jiaorong_src/plugins/market/openPlatformMarket.ts` | 新增 `resolveAssetDownloadUrl` / `listOpenPlatformMarketSkillListItems`；删 `listOpenPlatformMarketSkillMetadata` |
| `src/jiaorong_src/skills/lib/skillMarketCatalog.ts` | `RemoteSkillListItem` 增 `version` / `openPlatform` 并透传 |
| `src/jiaorong_src/api/skills/index.ts` | 远程源换新接口；删旧列表函数 |
| `src/jiaorong_src/skills/lib/ensureDefaultSkills.ts` | 默认补装改用新映射 |
| `src/jiaorong_src/skills/pages/SkillListPage/SkillListPage.vue` | 删重复追加；`remoteId` 兜底 |
| `src/jiaorong_src/appHost/appCenter/renderer/useJiaorongAppCenter.ts` | 合并远端版本与包信息，算 `update_available` |
| `src/renderer/src/stores/mcp.ts` | init 不阻塞；对账失败不清列表 |
| `src/jiaorong_src/open-platform/styles/open-platform.less` | 版本号 / 发布组织布局 |

## 兼容性

- `remoteInstallMap` 历史数据：早期以资产 id 为键、后续以中文 name 为键，
  读取侧按「name 优先、remoteId 兜底」双查，旧记录不会让市场卡退回未安装态。
- 分类筛选：新接口暂无 `categoryId`，远程技能在选择具体分类时不出现（「全部」正常）。
  后端补字段后无需改客户端。
- 旧列表接口下线只影响客户端调用方；`getSkillDetail` 仍走旧详情接口，后端若要下线需另行通知。

## 测试策略

- `test/renderer/jiaorong/skills/skillMarketCatalog.test.ts`：把 `fetchSkillMarketCatalog`
  的替身从 axios interceptors 换成开放平台 client，并补「legacy 条目取顶层 downloadUrl」
  「version 透传进 metadata」两例。
- 新增 `test/renderer/open-platform/openPlatformSkillMarketSource.test.ts`：
  用测试服真实数据形状断言技能卡不翻倍、legacy 可安装、市场版本更高时判定为可更新。
- 新增 `test/renderer/jiaorong/appCenter/appCenterRemoteUpdate.test.ts`：
  断言远端版本更高时 `installStatus === 'update_available'` 且带 `downloadUrl` / `packageSha256`；
  远端版本不更高时保持 `installed`。
- `test/renderer/open-platform/openPlatformConnectorStore.test.ts`：补「对账失败不清空市场列表」一例。
- 既有 `openPlatformMockAndPackage` / `openPlatformHttpApi` / `remoteInstallVersions` 跟随契约调整。
