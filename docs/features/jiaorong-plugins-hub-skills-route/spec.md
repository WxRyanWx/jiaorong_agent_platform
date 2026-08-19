# 插件 Hub 技能 Tab 进交融技能中心

## 目标

插件页顶栏「技能」跳到交融私有技能中心（`/skills`），不再进上游 `plugins-skills`。

## 验收

1. Hub 技能 Tab 的 `name` 为 `skills`，文案键 `routes.skills`。
2. 上游 `/plugins/skills` 路由仍保留（引导/e2e 等入口）。

## 非目标

- 不删 `SkillsPluginsPage`。
- 不改侧栏技能中心入口。
