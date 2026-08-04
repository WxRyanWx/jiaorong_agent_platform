# Plan

1. `api/skills`：`listSkillCategories` → `{ id, categoryName }[]`；列表映射 `categoryId`
2. `skillCategories.ts`：按 id 匹配；内置 name→id
3. `SkillListPage`：pill 展示名、选中 id；分类请求与列表解耦
4. 单测覆盖真实分类 JSON
