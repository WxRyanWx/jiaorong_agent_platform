# skill-root-level-uninstall-fail

## Problem

卸载技能 `test-case-design` 失败，报错：

`Skill "test-case-design" is outside the managed skills directory`

实际原因是该技能的 `SKILL.md`、`_meta.json`、`references/` 等被误放在
`~/.jiaorongchat/skills/` **根目录**，而不是 `skills/test-case-design/`。
发现逻辑把根目录当成 `skillRoot`，卸载校验拒绝 `rm` 整个 skills 目录（安全正确），
但用户无法卸载或清理该技能。

## Goal

- 启动/发现时自动把根目录误安装迁移到 `skills/<name>/`。
- 卸载时若仍落在 skills 根目录，只删除该技能 companion 文件，绝不删除 skills 根目录。
- 发现扫描忽略 depth=0 的 `SKILL.md`，避免再次把根目录登记为技能。

## Acceptance

- 根目录存在 `SKILL.md` 且 frontmatter `name` 合法、目标子目录不存在时，发现前自动迁移。
- 迁移后技能位于 `skills/<name>/`，可正常卸载。
- 根目录误安装且无法迁移时，`uninstallSkill(name)` 仍能清理根目录 companion，成功返回。
- 真正位于 managed skills 目录外的技能（如 plugin）仍拒绝卸载并保留原错误语义。
- 其他已正确安装在子目录中的技能行为不变。

## Non-goals

- 追查并修复所有历史误安装来源（手工解压等）。
- 改动技能市场下载安装的产品交互。
- 国际化该英文底层错误字符串（本次仍以行为修复为主）。

## Constraints

- 不得 `rmSync(skillsDir)`。
- 迁移只移动白名单 companion，避免误伤其他技能子目录。
