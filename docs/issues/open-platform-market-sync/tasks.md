# 开放平台市场融合修正（tasks）

## 1. 资产契约补字段

- [x] `api/openPlatform/types.ts`：`OpenPlatformAssetSummary` 增 `downloadUrl` / `categoryId`。
- [x] `api/openPlatform/httpApi.ts`：`toAssetSummary` 解析顶层 `downloadUrl` 与 `categoryId`
      （新增 `readCategoryId`，字符串 / 数字都收，其它类型按缺失）。
- [x] `api/openPlatform/mockApi.ts`：`toAssetSummary` 补同名字段，保持契约一致。
- [x] `plugins/market/openPlatformMarket.ts`：新增 `resolveAssetDownloadUrl`，
      应用与技能链路统一按「release 优先、顶层兜底」取地址。

## 2. 技能市场单一数据源

- [x] `skills/lib/skillMarketCatalog.ts`：`RemoteSkillListItem` 增 `version` / `provider` /
      `openPlatform`，`mergeSkillMarketCatalog` 两个分支都透传进 `metadata`
      （本地合并分支显式钉住，防 frontmatter 覆盖）。
- [x] `plugins/market/openPlatformMarket.ts`：新增 `listOpenPlatformMarketSkillListItems`，
      删除 `listOpenPlatformMarketSkillMetadata`。
- [x] `api/skills/index.ts`：`fetchSkillMarketCatalog` 换远程源；删 `listRemoteSkills` /
      `mapRemoteSkillList`。
- [x] `skills/lib/ensureDefaultSkills.ts`：默认补装改用新映射函数。
- [x] `SkillListPage.vue`：删掉开放平台卡追加逻辑；新增 `resolveRemoteInstallKey`
      （展示名优先、`remoteId` 兜底，兼容早期以 id 写入的 `remoteInstallMap`）；
      `hasSkillUpdate` 驱动「更新」按钮，点击复用 `handleInstall` 覆盖安装并写回新版本号。

## 3. 应用更新链路

- [x] `useJiaorongAppCenter.ts`：新增 `mergeRemoteAppCard`，合并远端 `version` /
      `downloadUrl` / `packageSha256` / `remotePackage`，按版本比较产出 `update_available`。
- [x] `plugins/market/openPlatformMarket.ts`：新增 `resolveAssetVersion` /
      `resolveMarketInstallStatus`，`installedVersion` 参数放宽到可空以对齐宿主类型。

## 4. MCP 初始化与对账

- [x] `stores/mcp.ts`：`init()` 改 `void loadOpenPlatformConnectors()`，
      单飞去重保证进入连接器页时仍会重试。
- [x] `stores/mcp.ts`：`syncOpenPlatformConnectors` 分离列表失败与对账失败，
      对账抛错不清空刚拿到的市场快照。

## 5. 发布卡片布局

- [x] `open-platform.less`：`provider-field` 改 `flex:none` 并去掉右对齐，
      版本号与发布组织紧随状态徽章相邻；删掉 `version-input` 的 110px 覆盖，
      与发布组织输入框同为 180px；`publish-meta` 加 `flex-wrap` 防窄窗溢出。
- [x] `open-platform.less`：`pane__body` 上下各留 14px 内边距（`pane__head` 的
      `margin-bottom` 由 18px 收到 4px 抵消），滚动容器不再裁掉首张卡片 hover 的上侧阴影。

## 6. 测试与文档

- [x] `skillMarketCatalog.test.ts` 无需改替身：默认 client 就是 http，
      仍复用同一份 interceptors mock，12 例全绿；新增用例落到下面的新文件。
- [x] 新增 `openPlatformSkillMarketSource.test.ts`（legacy 顶层 `downloadUrl` 兜底 /
      合并不翻倍 / 市场版本与来源标记不被 frontmatter 覆盖）。
- [x] 新增 `appCenterRemoteUpdate.test.ts`（更新状态、包信息合并、市场独占卡并存）。
- [x] `openPlatformConnectorStore.test.ts` 补「对账失败不清空市场列表」用例。
- [x] `docs/open-platform-backend-issues.md`：补 P1-8 `categoryId` 缺失、
      P1-9 顶层 `downloadUrl` 语义、P1-10 `skill/list` 与 `assets` 数据重叠，
      并修正 P2 第 11 条的客户端读取口径。
- [x] `docs/features/open-platform-real-api/tasks.md`：交叉引用本目标。
- [x] `src/jiaorong_src/HOST_TOUCHPOINTS.md`：登记 H174（`stores/mcp.ts`）。
- [x] `pnpm run typecheck` / `pnpm run lint` / `pnpm run i18n` / `oxfmt` / 相关 vitest 全绿。
- [ ] 手工验证：测试服发新版技能 → 技能市场出现「更新」→ 点击覆盖安装并记录版本号。

## 7. 用户复验反馈的回归修复

- [x] **刚安装就出现「更新」**：更新判定原先读 `metadata.version`，而该键会被包内
      `SKILL.md` 的 `metadata.version`（如 `dev-god` 的 `1.2.4`）污染；后端 `version` 为
      `null` 的资产（P1-6）没有市场版本可覆盖它，于是「市场版本 = 包自带版本、
      已装版本 = 空」→ 恒判可更新。改为专用键 `remoteVersion`，只由远程资产写入：
      `skillMarketCatalog.ts`、`SkillListPage.getSkillMarketVersion`、
      `SkillDetailPage.handleInstall`。
- [x] **默认技能补装不记版本**：`ensureDefaultSkills` 的 `rememberRemoteInstall` 没带版本，
      补装出来的技能同样会被判成可更新。`mapRemoteRaw` 改名并导出为
      `toRemoteSkillSeedItems`，`RemoteSkillSeedItem` 增 `version`，补装时一并落库。
- [x] **更新按钮与使用按钮贴在一起**：`skill-center-page__card-actions` 补 `gap: 8px`
      （此前同一时刻只会有一个按钮，没有间距也看不出问题）。
- [x] **两个必填字段应与右侧按钮成组**：`open-platform-pane__status` 加
      `margin-right: auto`，发布状态贴左，版本号 / 发布组织靠右紧邻卡片按钮。
- [x] 回归测试：`openPlatformSkillMarketSource.test.ts` 补「包内 frontmatter 版本不得
      被当成市场版本」；`defaultSkillsSeed.test.ts` 补 `toRemoteSkillSeedItems` 透传版本号。
