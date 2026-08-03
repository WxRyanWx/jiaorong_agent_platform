# Plan

1. 在 `sessionSkill.ts` 导出 `isSkillVisibleInMarket`
2. `SkillListPage` 的 `filteredSkills` / `marketCount` 使用该判断
3. 单测覆盖：remote、builtin、上传(Zip/Folder/Md) 边界
