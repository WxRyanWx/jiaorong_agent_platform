# 主侧栏插件 / OCR 入口仅管理员可见

## 目标

主窗口「插件」、设置 OCR、以及会跳到这两处的搜索与齿轮入口，只对管理员白名单用户显示。配置放在 `settingsSidebarAdmin.ts`。

## 验收

1. `MAIN_SIDEBAR_ADMIN_ONLY_ROUTES` 含 `plugins`。
2. 非管理员看不到 `app-plugins-button`。
3. 非管理员 Spotlight 不出现侧栏已隐藏的设置项（与 `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 同一名单）。
4. 非管理员打开 `/plugins*` 会被重定向到聊天。
5. 管理员仍能从侧栏、搜索、齿轮进入插件 Hub / OCR。

## 非目标

- 不改设置页侧栏 CSS 隐藏实现。
- 不改 MCP 安装 deeplink 协议；非管理员点开后落到聊天。
- 不处理远程控制按钮（仅通道开启时出现）。
