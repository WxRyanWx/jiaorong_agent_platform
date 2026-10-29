# 实现方案

## 数据流

```
GET /assets?type=skill&scope=market
  └─ item.source: 'open-platform' | 'legacy'
       │  httpApi.toAssetSummary → OpenPlatformAssetSummary.assetSource
       │  mockApi.toAssetSummary → assetSource: 'open-platform'
       ▼
  openPlatformMarket.listOpenPlatformMarketSkillListItems
       └─ RemoteSkillListItem.source
            ▼
  skillMarketCatalog.mergeSkillMarketCatalog（读写 skillAssetSource.readSkillAssetSource）
       └─ SkillMetadata.metadata.source   （远程事实，本地 frontmatter 不得覆盖）
            ▼
  SkillListPage.openDetail → saveJiaorongSkillToSession(metadata.source)
            ▼
  SkillDetailPage：source==='open-platform' 时跳过旧详情接口
                   否则 getSkillDetail(remoteId)，并把 source 合并回 nextMeta
```

## 受影响接口

- `OpenPlatformAssetSummary` 新增可选 `assetSource`（不改名 `source`，避免与
  `OpenPlatformAppAssetSummary.source: 'builtin' | 'store'` 交叉成 `never`）。
- `RemoteSkillListItem` 新增可选 `source: SkillAssetSource`；
  `SkillAssetSource` 与 `readSkillAssetSource` 单独放在
  `skills/lib/skillAssetSource.ts`（详情页只需读标识，不该被拖进扫盘依赖），
  与 `OpenPlatformAssetSource` 结构同形，skills 侧不反向 import 开放平台类型。
- `SkillDetailResponse` 新增 `source: SkillAssetSource | ''`，解析旧详情接口的
  `raw.source`（后端目前没有该键，解析为 `''`，属向前兼容）。

## 关键实现点

1. `mergeSkillMarketCatalog` 的本地合并分支按远程事实钉住 `source`，
   与既有 `remoteVersion` / `openPlatform` 同一套写法。
2. `SkillListPage.attachLocalInstall` 已经是 `...localMeta.metadata, ...skill.metadata`
   的展开顺序，远程 `source` 天然覆盖本地，无需额外钉字段。
3. `SkillDetailPage` 只在 `metadata.source === 'open-platform'` 时跳过请求；
   `''`（老 session / 深链 / 后端未返回）保持原行为，向后兼容。
4. `readSkillAssetSource` 收敛成一个纯函数，非法值一律返回 `''`。

## 兼容性

- 老 session 里没有 `metadata.source`：详情页照旧尝试旧接口，行为不变。
- mock client：技能统一标 `open-platform`，与真实市场里开放平台发布项一致；
  mock 阶段详情页会跳过旧接口，而 mock 本来也没有旧接口数据，无回归。
- 后端将来在 `GET /skill/{id}` 补 `source` 时，`SkillDetailResponse.source`
  自动生效，作为 metadata 缺失时的兜底。

## 测试策略

- `test/renderer/open-platform/openPlatformSkillMarketSource.test.ts`：
  断言市场条目带 `source`，合并后 metadata 也带，且本地 frontmatter 的
  `metadata.source` 不能覆盖远程值。
- `test/renderer/jiaorong/skills/skillMarketCatalog.test.ts`：
  `getSkillDetail` 解析 `source`，缺字段时为 `''`。
- `test/renderer/open-platform/openPlatformHttpApi.test.ts`：
  `assets` 列表项的 `source` → `assetSource`，非法值丢弃。
- `test/renderer/jiaorong/skills/skillAssetSource.test.ts`（新增）：
  `readSkillAssetSource` 的取值收敛与合并钉住行为。
- 全量校验：`pnpm run typecheck`、`npx oxlint`、`pnpm run i18n`、`npx oxfmt`、
  相关 vitest 套件。
