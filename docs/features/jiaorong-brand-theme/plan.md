# Plan

1. 在 `jiaorong_src/brand/theme.less` 覆盖 `.window-sidebar-shell` / `.app-bar` 背景。
2. `src/renderer/src/main.ts` 静态 import（避免 idle mount 闪色）。
3. 隐藏主题切换：左侧侧栏按钮、设置外观页主题块（宿主注释，见 H36/H37）。
4. 更新 `HOST_TOUCHPOINTS.md` 与 `jiaorong_src/README.md`。
