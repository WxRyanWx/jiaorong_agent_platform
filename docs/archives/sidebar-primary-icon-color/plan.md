# 实现计划

1. 在 `WindowSideBar.vue` 中为三个目标 `Icon` 添加语义化品牌 class。
2. 在 `src/jiaorong_src/brand/theme.less` 中将该 class 的颜色定义为 `#4f698d`。
3. 运行格式化、i18n 检查和 lint，确认改动符合仓库规范。

## 兼容性与测试

- 颜色通过现有交融主题覆盖机制实现，不改变组件接口或数据流。
- 通过静态检查与仓库质量命令验证。
