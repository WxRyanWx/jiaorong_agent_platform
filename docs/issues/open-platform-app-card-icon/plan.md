# 实现方案

`useOpenPlatformApps` 已经在本地和服务端列表中提供 `iconSrc`。修改 `AppsPane.vue` 卡片头部模板，优先渲染 `<img :src="app.iconSrc">`，否则渲染现有 `Icon` 兜底；在开放平台样式中补充图片尺寸、圆角和自适应。

## 影响范围

- `src/jiaorong_src/open-platform/renderer/AppsPane.vue`
- `src/jiaorong_src/open-platform/styles/open-platform.less`

## 验证

- 检查模板使用 `iconSrc` 且兜底路径不变。
- 运行最小相关类型检查和格式检查。
