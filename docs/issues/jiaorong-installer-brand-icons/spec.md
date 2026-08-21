# 安装包品牌图标

## 目标

Mac / Windows / Linux 安装包和系统应用图标显示交融 logo，不再出现 DeepChat 海豚标或 “Drag DeepChat”。

## 验收

1. `build/icon.png`、`build/icon.ico`、`build/icon.icns` 与 `resources/icon.png` 为同一交融图形（圆角应用标）。
2. Mac DMG 背景无海豚、无 DeepChat 字样；引导文案为 `Drag JiaorongAI to Applications`；画布仍为 660×400 / 1320×800，图标坐标不变。
3. Windows NSIS 与 Linux AppImage 使用 `build/icon.ico` / `build/icon.png`，安装界面与桌面快捷方式为交融标。`build/icon.ico` 必须含至少一档 ≥256×256（electron-builder Win 下限），不能只有 72×72。

## 非目标

- 不改公证、包名、协议 scheme。
- 不重做托盘模板以外的应用内 UI logo。`resources/icon.png` 必须保留，主进程 `splashWindow.ts` 等以 `?asset` 引用它。
