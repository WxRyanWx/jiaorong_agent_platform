# 计划

- `fillMissingSkillBindings`：catalog 缺 binding 写 `assigned: true`；不看技能开关。
- `ensureAgentBindingsInitialized` / `materializeProviderBindingsForExistingAgents` / `getAllSkills` / watcher 补缺。
- `isSkillVisible`：已绑定 **且** 开关开启。系统提示、skill_view 对所有 Agent 生效。
- `validateSkillNames` 只认绑定，避免关开关把会话钉选写掉。
- `setSkillSwitchStatus(On)` 不再 `setSkillDisabled(false)`。
- 测：新 Agent 默认绑定；开关关闭时绑定仍在、目录对所有 Agent 隐藏；开启不碰 assignment。
