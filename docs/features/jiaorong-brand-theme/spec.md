# jiaorong-brand-theme

## Goal

在 `jiaorong_src/brand/theme.less` 维护交融主题覆盖；开源仓仅静态加载该文件，避免大面积改宿主样式。

## Acceptance

- 窗口侧栏（`.window-sidebar-shell`）背景为 `#EFF5FF`
- 顶部标题栏（`.app-bar`）背景为 `#EFF5FF`
- 隐藏左侧侧栏主题切换、设置外观页主题选择
- 宿主通过一行 `import '@jiaorong/brand/theme.less'` 接入
- 触点记入 `HOST_TOUCHPOINTS.md`（含 H36/H37 注释隐藏）

## Non-goals

- 不改开源 `style.css` 色板本体
- 本切片不覆盖暗色主题专属色
