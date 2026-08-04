# 实现计划

## 实现思路

在 `src/renderer/settings/App.vue` 中仅增加设置页语义 class，并在设置页入口静态加载品牌主题：

- `.settings-page-header`
- `.settings-navigation`
- `.settings-navigation-item`
- `.settings-navigation-item-active`
- `.settings-navigation-icon`

对应颜色规则统一定义在 `src/jiaorong_src/brand/theme.less`。
移除导航容器原有的 `bg-muted/10`，避免它与品牌背景规则竞争。

## 受影响接口与数据流

无。仅改变模板样式类，不涉及组件输入、路由或状态数据流。

## 兼容性

保留现有布局、Tailwind 类、窗口控制和导航逻辑。

## 测试策略

- 检查模板类与路由选中条件绑定正确。
- 检查导航项 hover 与选中态使用相同背景色和文字颜色。
- 不运行格式化；运行 i18n 检查和 lint。
