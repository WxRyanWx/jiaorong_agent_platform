# 计划

- 交融开关放 `@jiaorong/config/memorySettingsChrome`：配置按钮、面板内开关、诊断 Tab。
- `MemorySettings.vue`：`v-show` 藏配置按钮；旁边加 Switch，调 `updateDeepChatAgent({ memoryEnabled })`。
- `MemoryConfigInlinePanel.vue`：`v-show` 藏原开关，不删。
- 诊断 Tab `v-if` 关掉，并改 `grid-cols`。
- 空状态 `@enable` 改为打开长期记忆。
- 更新 MemorySettings 测例；只 format 改动文件。
