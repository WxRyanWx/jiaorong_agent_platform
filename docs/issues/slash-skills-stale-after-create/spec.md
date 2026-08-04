# slash-skills-stale-after-create

## Problem

用 skill-creator 创建技能后，同一对话里输入 `/` 看不到新技能；退出再进才出现。

## Root Cause

`/` 建议列表来自 `skillsStore.skills`，打开 `/` 时不会重新扫盘；进对话只在 store 为空时 `loadSkills()` 一次。创建写盘后若 cache/事件未及时反映到 store，列表会过期。

## Goal

提供私有刷新方法；每次打开 `/` 菜单时刷新一次技能目录，创建完成后无需重开对话即可看到。

## Acceptance

- `@jiaorong/utils` 导出 `refreshSkillsCatalog`（discover + 写回 store）
- 打开 `/` 建议时调用一次刷新（同一次菜单打开不重复扫）
- 尽量少改宿主：仅触点 `useChatInputMentions.ts`

## Non-goals

- 不改 skill-creator 提示词流程
- 不每次按键全量扫盘
