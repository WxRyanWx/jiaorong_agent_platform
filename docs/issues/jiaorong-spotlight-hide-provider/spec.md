# Spotlight 非管理员不显示服务商

## 目标

非管理员在搜索面板看不到服务商设置入口（固定动作「服务商」和具体服务商结果）。隐藏名单在 `settingsSidebarAdmin.ts` 维护，与侧栏隐藏名单分开。

## 验收

1. 非管理员空搜、搜「服务商/模型/openai」都没有 `open-providers` 和 `settings-provider` 结果。
2. 管理员行为不变。
3. 不藏 MCP、远程、智能体等其它动作。
4. 搜索过滤路由写在 `SETTINGS_SPOTLIGHT_HIDDEN_ROUTES`，当前仅 `settings-provider`。

## 非目标

- 不改设置侧栏白名单号码。
- 不做服务端鉴权。
- 不把侧栏整份 `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 套到搜索上。
