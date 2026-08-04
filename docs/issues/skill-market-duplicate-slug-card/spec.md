# skill-market-duplicate-slug-card

## Goal

远程中文 name 与本地英文目录名不一致时，市场列表不应出现双卡；已装卡应显示中文名。
目录合并与调用身份一律以唯一字段 `name` 为准；`displayName` 仅展示，允许重复。

## Acceptance

- 从市场安装时，将市场 `name` 写入本地 `metadata.displayName`（展示用）
- `mergeSkillMarketCatalog` **仅**在本地 `name` === 远程 `name` 时合并；不按 displayName 去重
- 市场安装后的「中文市场卡 + 英文目录卡」：列表用 `remoteInstallMap` 挂已装状态，并隐藏本地 slug 卡
- 市场列表描述优先用接口 `desc`，没有再用本地 SKILL.md `description`
- 调用技能使用 `name` / `installedSkillName`（本地目录名）
- 不使用远程 `alias`、不使用 `displayName` 做合并

## Non-Goals

- 不强制改写历史已装、且无 displayName 的 SKILL.md（需重新安装或自行补 displayName）
