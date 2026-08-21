# Spotlight 非管理员不显示服务商

> 后续已改为与设置侧栏 `SETTINGS_SIDEBAR_HIDDEN_ROUTES` 共用名单，见 `docs/features/jiaorong-sidebar-plugins-admin`。

## 目标

非管理员在搜索面板看不到服务商设置入口（固定动作「服务商」和具体服务商结果）。

## 验收

1. 非管理员空搜、搜「服务商/模型/openai」都没有 `open-providers` 和 `settings-provider` 结果。
2. 管理员行为不变。

## 非目标

- 不改设置侧栏白名单号码。
- 不做服务端鉴权。
