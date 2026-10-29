# 任务清单（远端资产版本同步）

方案已由需求方确认：发布侧必填版本号（semver、递增校验），
客户端按版本号显示「更新」按钮，点击手动触发；「最近同步时间」需要新增
本地时间戳字段，本期不做。

## 1. 发布侧版本号（开放平台 + mock）

- [x] `api/openPlatform/version.ts`：从 mockApi 提取 `compareOpenPlatformVersions` /
      `isValidOpenPlatformVersion`，mockApi 改为引用。
- [x] `api/openPlatform/version.ts`：解析容忍 `v` 前缀；`isNewerOpenPlatformVersion`
      对本地脏版本按可更新处理，市场版本不可解析时不提示更新。
- [x] `types.ts`：技能/连接器 PublishInput 增加 `version?: string`。
- [x] `mockApi.ts`：发布时校验版本格式；`publishAsset` 递增校验放宽到全部类型。
- [x] `mockApi.ts`：抽出 `assertPublishVersion`，提交新制品严格递增、
      下架后沿用原包重新上架沿用原版本号（仅拒绝降版本）。
- [x] `AssetPane.vue`：版本输入框（提供组织左边、必填、预填当前版本），
      发布/更新/重新发布带版本并做非空预检。
- [x] `AssetPane.vue`：更新确认气泡提示「版本号需高于 x」，
      重新发布确认气泡提示「可沿用当前版本号」。
- [x] routes i18n × 20 语言。

## 2. 连接器更新链路

- [x] `shared/types/mcp.ts`：`MCPServerConfig` 增加 `sourceVersion?: string`。
- [x] `openPlatformMarket.ts`：`toMcpServerConfig` 写入 `sourceVersion`；
      `listOpenPlatformMarketSkillMetadata` metadata 增加 `version` / `downloadUrl`。
- [x] `openPlatformConnectorInstall.ts`：`toInstallableConnectorConfig` 透传
      `sourceVersion`；新增 `toUpdatableConnectorConfig`（不带 enabled）与
      `findOutdatedConnectorServers`。
- [x] `stores/mcp.ts`：computed `connectorUpdatesAvailable` +
      action `updateOpenPlatformConnector`（成功/失败通知），store return 暴露。
- [x] `McpServerCard.vue`：`updateAvailable` / `isUpdating` props + `update` emit + 按钮。
- [x] `McpServers.vue`：接线更新按钮与 loading。
- [x] settings i18n × 20 语言。

## 3. 技能更新链路

- [x] `sessionSkill.ts`：remoteInstallMap 值支持 `{ localName, version }`，
      兼容旧字符串；新增 `loadRemoteInstallVersions`；`rememberRemoteInstall`
      第三参可选版本；forget/prune 适配。
- [x] `SkillListPage.vue`：`hasSkillUpdate` 判定 + 已安装卡片「更新」按钮 +
      安装成功记录版本；开放平台卡片刷新后凭 remoteInstallMap 恢复已安装态，
      同名本地卡继承市场 metadata（否则刷新后更新判定丢失）。
- [x] `SkillDetailPage.vue`：详情页安装成功时同步记录市场版本号。

## 4. 测试与验证

- [x] mock 发布版本校验用例（缺版本/非法/不递增/首发布/草稿不带版本）。
- [x] mock 重新上架用例（沿用原版本号成功、降版本报错、带新 zip 重新发布要求递增）。
- [x] 连接器更新用例（可更新判定、更新载荷不含 enabled、旧安装补写、版本相同不触发、
      卡片按钮渲染与 emit）。
- [x] sessionSkill 版本映射兼容用例（`remoteInstallVersions.test.ts`）。
- [x] 版本工具用例（`openPlatformVersion.test.ts`：格式校验、比较、v 前缀、
      本地脏数据、市场坏版本）。
- [x] `pnpm run typecheck`、`pnpm run lint`、`oxfmt`、`pnpm run i18n` 通过；
      open-platform / skills / mcp 相关 220 用例全绿。
- [ ] 手工验证：发布带版本 → 插件中心出现更新按钮 → 点击更新 → 配置刷新、
      启用中的服务按参数变化自动重连。（待用户验证；mock 阶段技能 zip 不落盘，
      技能更新按钮显隐可验证，实际重装需真实后端下载地址）

## 5. 收尾

- [x] `HOST_TOUCHPOINTS.md` 新增 H172 登记 `McpServerCard.vue`、`shared/types/mcp.ts`、
      `stores/mcp.ts` 与 i18n 触点。
- [x] 本文档勾选状态与实现对齐。
