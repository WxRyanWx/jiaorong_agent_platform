# 计划

- Spotlight 隐藏名单与设置侧栏 `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 共用；`isSettingsSpotlightItemHidden` 走同一判断。
- Spotlight 动作补 `routeName`，MCP / OCR / 远程才能被滤掉。
- `WindowSideBar.vue` 插件按钮 `v-if`；`McpIndicator` 打开插件页的齿轮同样判断。
- 宿主 `/plugins` 父路由 `beforeEnter`：`isMainSidebarItemHidden('plugins')` 则去 `chat`。
