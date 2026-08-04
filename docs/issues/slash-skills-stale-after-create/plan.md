# Plan

1. `utils/refreshSkillsCatalog.ts`：`discoverSkills` → 更新 `skillsStore.skills`
2. `useChatInputMentions`：`/` 的 `items` 改为 async，菜单打开时 await 刷新一次；`onExit` 重置
3. 导出到 `@jiaorong/utils`；更新 HOST_TOUCHPOINTS H23
