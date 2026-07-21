# Plan

## Approach

- 路由统一在 `jiaorong_src/router/`（`createJiaorongRoutes`）；子模块不维护 routes。
- SkillListPage：Tab / 搜索 / 分类 / 网格；`skillsStore.loadSkills()` 读本地技能。
