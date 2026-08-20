# 启动 Splash 品牌图

## 目标

应用启动时屏幕中央显示交融 logo，圆形底色与描边跟 logo 的电蓝/青色一致。

## 验收

1. Splash 加载态中间大图使用 `src/renderer/src/assets/logo.png`（深色系统）与 `logo-dark.png`（浅色系统）。
2. 解锁/恢复面板小标使用同一套图。
3. 不再内联 `assets/splash/logo-v3-*.svg`。
4. 加载态保留圆形底、描边、光晕和扫描线；圆底为近黑 + 电蓝/青光，不要 DeepChat 灰描边和紫光。
5. Logo 大于原先 176px。Electron Splash 窗保持透明、无窗口阴影框。

## 非目标

- 不改 Dock/`resources/icon.png`。
- 不改 recovery 残留英文产品名。
- 不新做透明底 SVG 资源。
- 不改解锁/恢复表单布局。
