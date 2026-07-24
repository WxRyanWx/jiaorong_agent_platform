# Plan

## Approach

1. 在 `SkillPresenter` 增加根目录误安装 companion 白名单：
   `_meta.json`、`skill-card.md`、`references`、`scripts`、`assets`、`templates`。
2. `discoverSkills` 开始时调用 `repairRootLevelSkillInstall()`：
   - 若根目录有 `SKILL.md`，解析 `name`；
   - 目标 `skills/<name>` 不存在则创建并 `rename` SKILL.md + 白名单条目；
   - 目标已存在则打日志，不覆盖。
3. `collectSkillManifestPaths`（主线程 + discovery worker）在 `depth === 0` 时忽略 `SKILL.md`。
4. `uninstallSkill`：
   - `skillRoot === skillsDir` → `uninstallRootLevelSkill(name)`（校验 frontmatter 后删 companion）；
   - 真正 outside（`..` / 绝对相对路径）→ 保持原错误。
5. 补充单测覆盖：修复迁移、根目录卸载、outside 仍拒绝。

## Compatibility

不改公开 API；仅收紧发现与卸载边界处理。已正确安装在子目录的技能路径不变。
