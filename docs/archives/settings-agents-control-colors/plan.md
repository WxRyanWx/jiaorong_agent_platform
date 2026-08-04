# 实现计划

## 实现思路

- 为智能体设置页增加 `.settings-agents-page` 作用域。
- 为选中卡片增加 `.settings-agent-card-selected`。
- 为页面内下拉选择触发器增加 `.settings-agent-select`，通过 focus/open 状态应用品牌样式。
- 在品牌主题中通过组件 `data-slot` 覆盖 Input/Textarea 聚焦态，并通过 Switch
  `data-state` 区分启用和未启用。
- 为页面内 Switch 显式增加 `.settings-agent-switch`，提高品牌规则优先级。
- 在页面作用域内统一常规 `border-color`，并保留选中卡片蓝色边框。
- 为选中的头像类型按钮增加 `.settings-agent-avatar-option-selected`。
- 为列表和编辑器头部头像容器增加 `.settings-agent-avatar-container`。
- 更新 `HOST_TOUCHPOINTS.md`。

## 受影响接口与数据流

无。仅调整样式。

## 兼容性

保留现有 Tailwind 类和 Vue 状态逻辑。

## 测试策略

- 检查动态 class 与 Input/Textarea/Switch 状态选择器。
- 运行 i18n 检查和 lint，不运行格式化。

## 验证结果

- 针对性 OxLint 通过。
- `DeepChatAgentsSettings.test.ts` 共 9 项，1 项通过、8 项因测试数据未加载导致编辑器整体未渲染而失败；失败断言不涉及本次新增的样式 class。
