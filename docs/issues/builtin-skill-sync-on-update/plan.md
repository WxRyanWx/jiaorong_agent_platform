# Plan

将 `syncBuiltinSkillFrontmatter`（只同步 description/displayName）改为：比对内置与用户 `SKILL.md`，不同则 `installFromDirectory(..., { overwrite: true })`。
