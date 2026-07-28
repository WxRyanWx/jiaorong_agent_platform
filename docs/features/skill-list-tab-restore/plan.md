# Plan

1. 共用 `parseSkillMarketTab`（`market` | `installed`）
2. 列表 `openDetail`：`query.tab = activeTab`
3. 详情 `goBack` / 卸载回列表：带回 `query.tab`
4. 详情 `router.replace` 保留现有 `query`
5. 列表根据 `route.query.tab` 设置 `activeTab`
