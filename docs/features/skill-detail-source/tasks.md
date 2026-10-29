# 任务清单

1. [x] `api/openPlatform/types.ts`：新增 `OpenPlatformAssetSource` 与
       `OpenPlatformAssetSummary.assetSource`
2. [x] `api/openPlatform/httpApi.ts`：`toAssetSummary` 解析 `item.source`
3. [x] `api/openPlatform/mockApi.ts`：技能 / 连接器摘要标 `assetSource`
4. [x] `skills/lib/skillMarketCatalog.ts`：`SkillAssetSource`、
       `RemoteSkillListItem.source`、合并时钉住远程 `source`、`readSkillAssetSource`
5. [x] `plugins/market/openPlatformMarket.ts`：市场技能条目带上 `source`
6. [x] `api/skills/index.ts`：`SkillDetailResponse.source` 解析
7. [x] `SkillDetailPage.vue`：按 `source` 决定是否调用旧详情接口，并回写 session
8. [x] 补测试：市场 source 透传、详情解析、来源门禁
9. [x] `docs/open-platform-backend-issues.md`：记录 `GET /skill/{id}`
       对开放平台技能返回 500、`orgNames` 与 `provider` 并存待收敛
10. [x] 运行 typecheck / oxlint / i18n / oxfmt / 相关 vitest
