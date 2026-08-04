# skill-catalog-stale-after-builtin-sync

## Goal

统一数据请求 `fetchSkillMarketCatalog`（本地扫盘 + 远程合并）；页面仅进页 / 上传后调用。

## Acceptance

- 页面只调 `@jiaorong/api/skills` 的 `fetchSkillMarketCatalog`
- 不改开源仓；无重试/轮询旧逻辑
