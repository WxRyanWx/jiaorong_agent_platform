# skill-market-display-name-on-install

## Goal

市场安装时，zip 包常为英文 `name`；用列表/详情接口的中文 `name` 写入 `metadata.displayName`，使 `/` 菜单与列表一致。

## Acceptance

- 从技能市场列表/详情安装后，本地 SKILL.md 含 `metadata.displayName`（市场中文名）
- `/` 技能列表显示该中文名
- 市场安装传入的 displayName **优先于** 包内已有 displayName（避免包内英文/旧名导致双卡）
- 本地上传未传市场名时行为与现网一致（不强行造中文）

## Non-Goals

- 不批量迁移已装技能（可另做修补或重装）
- 不改主仓 slash 解析逻辑
