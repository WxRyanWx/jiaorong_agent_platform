# Plan

1. `sessionSkill.ts` 增加 `isProtectedSystemSkill`（内置集合 + 默认市场名/displayName/install map）
2. `SkillDetailPage`：`canDeleteSkill` 控制按钮；`openUninstallConfirm` / `uninstallSkill` 双保险
3. 单测覆盖内置、默认市场中文名、默认市场英文目录+map、普通上传可删
