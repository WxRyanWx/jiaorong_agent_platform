# 实现计划

## 实现思路

- 在 `CommonSettings.vue` 的页面壳组件上增加 `.settings-general-page`。
- 为 `SettingsPageShell.vue` 的眉题增加 `.settings-page-eyebrow`。
- 在品牌主题中以常规设置页为作用域，覆盖眉题、图标、普通按钮边框和 Switch 未选中态。
- 在 `HOST_TOUCHPOINTS.md` 登记宿主 class 触点。

## 受影响接口与数据流

无。仅调整样式。

## 兼容性

保留组件原有 Tailwind 类与组件状态逻辑。

## 测试策略

- 检查选择器仅作用于常规设置页。
- 运行 i18n 检查和 lint，不运行格式化。
