# 截图功能迁移说明

## 背景

本次从 `chat-pc` 迁移截图相关能力到 `jiaorong_agent_platform`，目标是让当前项目支持全局截图快捷键、截图选择层、截图工具栏、OCR、钉图以及后续问图/总结等入口。


## 本次主要改动

### 1. 接入截图主进程模块

- 新增 `src/main/screenShot/index.ts`。
- 新增 `src/main/screenShot/screenshot-ipc.ts`。
- 使用 `node-screenshots` 获取屏幕帧。
- 创建透明置顶截图窗口，用于承载 `tools-gui` 构建出的截图页面。
- 支持截图窗口复用，避免每次快捷键都重新加载截图页面。
- 支持按 `Escape` 关闭截图会话。
- macOS 上对齐 `chat-pc`：
  - 展示截图窗口时使用 `showInactive()`。
  - `setVisibleOnAllWorkspaces(true)` 不再传 `{ visibleOnFullScreen: true }`。
  - 关闭截图时执行 `setVisibleOnAllWorkspaces(false)` 和 `app.dock?.show()`，避免 Dock 中应用图标消失。

### 2. 接入截图资源

- 新增 `resources/screen-shot/`。
- 该目录从 `chat-pc/src/main/screen-shot/dist/` 同步而来。
- 截图窗口加载方式为：

```ts
screenshotWindow.loadFile(getScreenshotHtmlPath(), { hash: '/screen-shot' })
```

- 这样可以直接进入 `tools-gui` 的截图页面路由，避免落到默认工具页。
- 已对比过 `chat-pc` dist 和当前 `resources/screen-shot`，内容保持一致。

### 3. 接入截图 preload API

- 修改 `src/preload/index.ts`。
- 修改 `src/preload/index.d.ts`。
- `tools-gui` 截图页调用的是 `window.api.useMain`，因此当前项目补齐了对应桥接方法。
- 主要包含：
  - `getMousePosition`
  - `getDisplayMetrics`
  - `getScreenFrame`
  - `getScreenFrames`
  - `getScreenBase64`
  - `writeImageToClip`
  - `closeScreenWindow`
  - `getScreenshotToolbarConfig`
  - `onScreenshotToolbarConfig`
  - `onScreenshotStartupMark`
  - `onScreenshotRecapture`
  - `onScreenshotSessionDismiss`
  - `presentScreenshotSession`
  - `revealScreenshotSession`
  - `getScreenshotSessionTiles`
  - `exportSelectionBaseFromCache`
  - overlay 相关兼容方法
  - `debugLog`
  - `ocrRec`
  - `askByPic`
  - `askByPicNew`
  - `summary`
  - `extractTable`
  - `solveProblem`
  - `pinByPic`

### 4. 对齐截图启动时序

`chat-pc` 的截图流程不是立刻显示窗口，而是：

1. 主进程创建或复用隐藏截图窗口。
2. 主进程向 renderer 发送 `screenshot:startup-mark`。
3. renderer 收到 mark 后截屏、绘制 canvas 和蒙版。
4. renderer 调用 `screenshot:session-ready`。
5. 主进程以 opacity 0 展示窗口。
6. renderer 布局稳定后调用 `screenshot:session-reveal`。
7. 主进程再把窗口 opacity 设为 1。

当前项目已按这个时序迁移。

过程中排查到一个关键问题：当前项目 `electron-vite` 的 preload 产物是 `out/preload/index.mjs`，不是 `index.js`。截图页之前因为 preload 路径错误，导致 `window.api.useMain` 没有注入，表现为按快捷键后没有截图页面。现在已改为：

```ts
const getPreloadPath = (): string => join(__dirname, '../preload/index.mjs')
```

### 5. 接入截图快捷键

- 修改 `src/main/presenter/shortcutPresenter.ts`。
- 截图快捷键不再由截图模块单独注册，而是纳入 `ShortcutPresenter` 统一注册。
- 原因是 `ShortcutPresenter.registerSystemShortcuts()` 会调用 `globalShortcut.unregisterAll()`，如果截图模块自己注册快捷键，后续会被清掉。
- 现在截图快捷键和显示/隐藏主窗口等系统快捷键一起注册。
- 按下截图快捷键后调用：

```ts
openScreenShotWindow('hotkey')
```

### 6. 接入快捷键默认配置和设置面板

- 修改 `src/main/presenter/configPresenter/shortcutKeySettings.ts`。
- 默认截图快捷键为：

```ts
CommandOrControl+Alt+A
```

Electron accelerator 中 `Option` 使用 `Alt` 表示，因此 macOS 上对应 `CommandOrControl + Option + A`。

- 修改 `src/main/presenter/configPresenter/index.ts`。
- 兼容旧用户本地已保存的快捷键配置：
  - 如果本地配置缺少 `Screenshot`，会自动补默认值。
  - 如果本地仍保存旧默认值 `CommandOrControl+Shift+A`，会迁移到新默认值。

- 修改 `src/renderer/settings/components/ShortcutSettings.vue`。
- 在“系统 / 快捷键”里加入“截图”配置项。
- 修改多语言文案：
  - `src/renderer/src/i18n/zh-CN/settings.json`
  - `src/renderer/src/i18n/en-US/settings.json`
  - `src/renderer/src/i18n/zh-HK/settings.json`
  - `src/renderer/src/i18n/zh-TW/settings.json`

### 7. 接入主进程启动流程

- 修改 `src/main/appMain.ts`。
- 在 presenter 初始化后调用 `initScreenShotFeature()`。
- 传入读取主窗口 `localStorage.xkaitoken` 的函数，用于截图后需要登录态的动作。
- 传入读取当前截图快捷键配置的函数，用于截图工具栏展示当前快捷键状态。

### 8. 截图清晰度处理

- 当前已移除 “使用 `sharp` 缩小截图后再传输” 的方案。
- 截图链路不再引入或调用 `sharp` 做预缩小。
- 不再对 `node-screenshots` 获取到的 RGBA 帧做预缩小。
- 单屏 macOS / Windows 会使用原生像素 canvas backing：
  - 例如 Retina 屏逻辑尺寸 `1512x982`，canvas backing 会使用 `3024x1964`。
- 多屏场景仍保留 DIP 预览逻辑，避免跨屏坐标错位。
- 这样优先保证截图和蒙版清晰度，代价是单次传输数据量更大。

### 9. OCR 结果窗口

- 已迁移 `chat-pc` 的 `/ocr-result` renderer 路由组件。
- 新增 `src/renderer/src/components/ocrResult.vue`。
- 新增 `src/renderer/src/assets/exclamation-circle.png`。
- 主进程不再生成临时 `data:` HTML，而是创建 OCR `BrowserWindow` 后加载当前 renderer 的 `#/ocr-result`。
- 主进程通过 `ocr-result-data` channel 推送截图和识别结果。
- preload 新增 `onMessage` / `removeMessageListener` / `copyTextByMain`，用于 OCR 页面接收数据和复制全文。
- OCR 结果窗口保持 `chat-pc` 布局：
  - 665x520
  - 无边框
  - 白色面板
  - 左侧截图预览
  - 右侧识别预览
  - 底部“复制全文”
- `src/renderer/src/router/index.ts` 新增 `/ocr-result`。
- `src/renderer/src/App.vue` 把 OCR 页面作为轻量弹窗路由处理，避免显示主应用 AppBar/侧边栏。
- OCR 本地识别使用 `tesseract.js`，需要：
  - `resources/chi_sim.traineddata`
  - `resources/eng.traineddata`

### 10. 钉图窗口

- 已迁移 `chat-pc` 的 `/pin-by-pic` renderer 路由组件。
- 新增 `src/renderer/src/components/pinByPic.vue`。
- 主进程不再生成临时 `data:` HTML，而是创建钉图 `BrowserWindow` 后加载当前 renderer 的 `#/pin-by-pic`。
- 主进程通过 `pin-by-pic-image` channel 推送图片。
- `src/renderer/src/router/index.ts` 新增 `/pin-by-pic`。
- `src/renderer/src/App.vue` 把钉图页面作为轻量弹窗路由处理，避免显示主应用 AppBar/侧边栏。
- 已按 `chat-pc` 的窗口 bounds 思路调整：
  - 有框选区域时，窗口位置就是框选位置。
  - 窗口尺寸就是框选区域尺寸。
  - 只有框选区域超出当前屏幕工作区时，才会等比缩小并限制在屏幕内。
- 这样避免 Retina 下因为使用原始像素尺寸导致钉图窗口比框选区域大一倍。
- 钉图窗口已去掉 renderer 自定义关闭按钮，改用 Electron 原生窗口头部关闭。
- 原生窗口头部不显示标题文本：
  - `BrowserWindow` title 为空。
  - 拦截 `page-title-updated`，避免 renderer 路由把标题改回应用名或页面标题。
- 钉图窗口使用 `showInactive()`，避免点击钉图后把主窗口带到前台。
- 钉图窗口保持置顶：
  - 旧钉图窗口保留 `alwaysOnTop`。
  - 新创建的钉图窗口会提升到更高层级并 `moveTop()`。
  - 这样最后创建的钉图会显示在之前创建的钉图上面，同时避免反复 raise 全部窗口造成闪动。

### 10.1 Session capture cache / export base

- 新增 `src/main/screenShot/sessionCaptureCache.ts`。
- 新增 `src/main/screenShot/sessionExport.ts`。
- `screen:get-frames` 获取到 tiles 后会写入 session capture cache。
- `screenshot:get-session-tiles` 不再返回 `null`，会返回当前 session 的缓存 tiles。
- `screenshot:export-selection-base` 不再是兼容桥接，已迁移为从 session cache 裁剪底图 PNG：
  - 只裁剪选区相交的 tiles。
  - 不需要拼接整张 union 大图。
  - 支持 `outW/outH` 缩放输出。
- 每次新截图会话开始会清理旧 session cache，避免误用上一次截图数据。

### 11. 截图日志

- 当前项目增加了截图链路日志，方便排查快捷键、preload、窗口生命周期和 renderer 截屏流程。
- 新增 `src/main/screenShot/screenshotLogger.ts`，保留从 `chat-pc` 拆分出来的日志模块结构。
- 日志目录为：

```text
app.getPath('logs')/screenshot/
```

macOS 下通常是：

```text
~/Library/Logs/JiaorongAI/screenshot/
```

- 主要文件：
  - `app-init.log`
  - `latest-session.txt`
  - `sessions/screenshot-*.log`
  - `screenshot-debug.log`
- 日志格式已尽量对齐 `chat-pc`：
  - `[main]` / `[renderer]`
  - `SESSION START`
  - `SESSION END`
  - `PHASE  window`
  - `PHASE  capture`
  - `PHASE  render`
  - `PHASE  renderer`
- 额外补充了以下日志点：
  - session cache 写入
  - session tiles 返回
  - export base 裁剪参数、输出大小、耗时
  - OCR 开始、完成、失败
  - OCR 结果窗口创建和数据发送
  - 钉图窗口创建参数、归一化 rect、图片数据发送

### 12. 打包资源和依赖

- 修改 `package.json`：
  - 新增 `node-screenshots`。
  - 新增 `tesseract.js`。
  - 截图链路不再使用 `sharp` 缩小图片后传输。
  - `sharp` 仍保留在项目依赖中，因为当前项目其他模块仍有使用。
- 修改 `pnpm-lock.yaml`，同步依赖锁定信息。
- 修改 `electron-builder.yml`：
  - unpack `node-screenshots` 原生模块。
  - 打包 `resources/screen-shot/`。
  - 打包 OCR traineddata。

### 13. 启动卡顿和辅助功能权限处理

- 迁移过程中曾尝试新增 `node-mac-permissions` 来检查 macOS 辅助功能权限。
- 实际验证发现该原生依赖可能导致 Electron 启动阶段卡住或被 macOS 标记为“应用程序没有响应”。
- 当前已移除 `node-mac-permissions`：
  - `package.json` 中不再依赖它。
  - `pnpm-lock.yaml` 已同步移除。
  - `electron-builder.yml` 中不再 unpack 该原生模块。
  - 代码中不再 `require('node-mac-permissions')`。
- 辅助功能权限改用 Electron 自带 API：

```ts
systemPreferences.isTrustedAccessibilityClient(false)
```

- 用户点击授权提示中的“立即去设置”时，再调用：

```ts
systemPreferences.isTrustedAccessibilityClient(true)
```

- 该调整属于本次截图迁移过程中的启动稳定性修复：它不是截图功能本身，但发生在同一批未提交改动里，目的是避免截图迁移联调期间引入新的启动阻塞点。

## 涉及文件

### 新增文件和目录

- `src/main/screenShot/index.ts`
- `src/main/screenShot/screenshot-ipc.ts`
- `src/main/screenShot/sessionCaptureCache.ts`
- `src/main/screenShot/sessionExport.ts`
- `src/main/screenShot/screenshotLogger.ts`
- `src/renderer/src/components/ocrResult.vue`
- `src/renderer/src/components/pinByPic.vue`
- `src/renderer/src/assets/exclamation-circle.png`
- `resources/screen-shot/`
- `resources/chi_sim.traineddata`
- `resources/eng.traineddata`
- `docs/screenshot-feature-migration.md`

### 修改文件

- `electron-builder.yml`
- `package.json`
- `pnpm-lock.yaml`
- `src/main/appMain.ts`
- `src/main/highlightedText/index.ts`
- `src/main/presenter/configPresenter/index.ts`
- `src/main/presenter/configPresenter/shortcutKeySettings.ts`
- `src/main/presenter/shortcutPresenter.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/App.vue`
- `src/renderer/src/router/index.ts`
- `src/renderer/settings/components/ShortcutSettings.vue`
- `src/renderer/src/i18n/en-US/settings.json`
- `src/renderer/src/i18n/zh-CN/settings.json`
- `src/renderer/src/i18n/zh-HK/settings.json`
- `src/renderer/src/i18n/zh-TW/settings.json`
- `test/main/presenter/shortcutPresenter.test.ts`

## 已验证

- `pnpm run typecheck:node`
- `pnpm vitest run test/main/presenter/shortcutPresenter.test.ts`

说明：本次文档更新前后，`pnpm run typecheck:node` 可通过。`pnpm run typecheck:web` 之前曾通过；当前本地再次执行时失败在既有 `@shadcn/components/ui/input` 路径解析问题，和截图迁移、钉图、OCR、辅助功能权限调整无直接关系。

## 当前注意事项

- OCR 结果窗口和钉图窗口已改为 `chat-pc` 风格的 renderer 路由组件，不再使用主进程临时 HTML。
- `askByPic`、`summary`、`extractTable`、`solveProblem` 目前保留入口和登录校验，但没有完全迁移 `chat-pc` 的总结弹窗、问图弹窗和业务流。
- `exportSelectionBaseFromCache` 已接入 session capture cache / export base 逻辑，后续可以继续对齐 `chat-pc` 的多 overlay / mixed DPI 更完整路径。
- 当前日志保留用于继续排查截图问题，等截图迁移稳定后可以考虑减少或移除部分调试日志。
- 如测试截图快捷键，需要完全退出旧的 JiaorongAI 进程后重新启动当前项目，否则系统全局快捷键可能仍由旧进程响应。
- 如测试辅助功能权限提示，需要先在 macOS 系统设置中移除或关闭当前应用的辅助功能权限，再重新启动应用观察提示是否异步出现；该提示不应该阻塞主窗口初始化。
