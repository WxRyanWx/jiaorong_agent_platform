# Plan

1. 在 `.skill-detail-page` 启用 `container-type: inline-size`，用 `@container` 按内容区宽度断点（非视口）。
2. 断点：`<=720` 中等（2 列 / 收紧间距），`<=520` 窄（1 列 / hero 堆叠）。
3. 仅改 `SkillDetailPage.vue` scoped less；顺手修 shadow 的 less `/` 透明度问题。
