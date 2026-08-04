# builtin-skill-sync-on-update

## Goal

应用升级后，内置技能（如 skill-creator）的提示词与脚本应同步到用户已安装副本，否则更新无效果。

## Acceptance

- 启动时若内置 `SKILL.md` 与用户副本不同，用内置整包覆盖（含 scripts 等）
- 全新安装行为不变
- 非内置用户自建技能不受影响

## Non-goals

- 不保留用户对内置技能的本地改写（内置技能由应用管理）
