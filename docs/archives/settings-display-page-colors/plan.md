# 实现计划

## 实现思路

- 在 `DisplaySettings.vue` 的页面壳增加 `.settings-display-page`。
- 在 `FontSettingsSection.vue` 的重置按钮增加 `.settings-display-font-reset`。
- 为语言和字体选择触发器增加 `.settings-display-select`。
- 在品牌主题中以该 class 为作用域设置眉题、辅助文字、图标、按钮/下拉边框及 Switch 未选中态。
- 在 `HOST_TOUCHPOINTS.md` 登记宿主触点。

## 受影响接口与数据流

无。仅调整样式。

## 兼容性

复用现有 `.settings-page-eyebrow` 和组件 `data-slot`，不改变组件状态逻辑。

## 测试策略

- 确认选择器仅作用于显示设置页。
- 运行 i18n 检查和 lint，不运行格式化。
