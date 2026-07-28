# Plan

1. `skills/lib/skillCategories.ts`：固定分类 + 内置映射 + `tabList` 解析/匹配
2. `RemoteSkillListItem.tabList` → merge 进 `metadata.tabList`
3. `api/skills` list 映射 `tabList`
4. `SkillListPage` 用 `skillMatchesCategoryFilter`
5. 单测覆盖映射、解析、merge 保留
