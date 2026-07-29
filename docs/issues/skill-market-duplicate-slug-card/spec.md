# skill-market-duplicate-slug-card

## Goal

远程中文 name 与本地英文目录名不一致时，市场列表不应出现双卡；已装卡应显示中文名。

## Acceptance

- 从市场安装时，将市场 `name` 写入本地 `metadata.displayName`
- 合并：本地 `displayName` 等于远程 `name` 时并成一张中文卡（已安装）
- 市场列表描述优先用接口 `desc`，没有再用本地 SKILL.md `description`
- 总数 = 远程 + 仅本地且无对应 displayName 的技能（无双计）
- 不使用远程 `alias` 做合并

## Non-Goals

- 不强制改写历史已装、且无 displayName 的 SKILL.md（需重新安装或自行补 displayName）
