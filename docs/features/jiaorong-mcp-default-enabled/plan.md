# 计划

- 私有清单：`getJiaorongDefaultEnabledMcpServerNames(isMacOS)`。
- 宿主 `McpSettings.getDefaultEnabledServerNames` 只引用该清单。
- 一次性迁移 key `jiaorongMcpDefaultAddonsV1`，仅 enable 对话历史搜索并 `startServer`。
- `conversationSearchServer.ts` 按 H79 写中文 title/description；`STATIC_TOOL_DISPLAY_NAMES` 补 fallback。
- 测例：darwin/linux 默认 enabled；迁移只动对话搜索。
