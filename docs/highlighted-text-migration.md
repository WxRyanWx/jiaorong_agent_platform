  # 划词功能迁移说明

## 背景

本次从 `chat-pc` 迁移划词相关能力到 `jiaorong_agent_platform`，目标是让本项目支持全局划词后弹出操作面板，并提供翻译、复制等能力。

## 本次主要改动

### 1. 接入全局划词监听

- 新增 `src/jiaorong_src/highlightedText/index.ts`。
- 使用 `uiohook-napi` 监听全局鼠标、键盘事件。
- 支持鼠标拖选文本后弹出划词操作面板。
- 支持双击选中文本后弹出划词操作面板。
- 通过模拟 `Cmd/Ctrl + C` 获取当前选中文本。
- 获取文本后会恢复用户原剪贴板内容，避免破坏用户剪贴板。

### 2. 接入划词面板窗口

- 新增 `CardPopup` 小面板窗口。
- 面板包含拖拽、翻译、解释、复制等按钮。
- `CardPopup` 的解释按钮只迁移了 UI 和入口，不迁移 `chat-pc` 原来的解释调用逻辑。
- 当前解释按钮点击后只关闭面板，未接入旧项目的解释业务，也不会触发登录校验或唤起主窗口。
- 复制按钮改为使用划词专用 IPC：`highlighted-text:copy`，避免复用通用 `clipboard-write` 导致主窗口被带起。
- 修复了本地启动时只显示 Vite 图标的问题：弹窗路由现在绕过主应用布局，直接渲染弹窗组件。
- 修复了 `CardPopup` 内容没有居中显示的问题。
- 针对首次打开 `CardPopup` 时 IPC 监听可能尚未挂载的问题，主进程会保存当前划词文本，组件也会通过 `getCurrentCardPopupText()` 主动兜底读取。

### 3. 接入翻译弹窗

- 新增 `SelectionTranslatePopup` 翻译结果弹窗。
- 支持展示原文和翻译结果。
- 支持选择目标语言。
- 支持复制译文。
- 修复了点击翻译后弹窗没有文本的问题：
  - 主进程会等待弹窗页面加载完成后发送选中文本。
  - 主进程会保存当前翻译文本。
  - 翻译弹窗挂载后会通过 `getCurrentTranslatePopupText()` 主动兜底读取。
  - `runTranslate()` 在发现原文为空时会再次读取当前翻译文本，避免首次打开时 `sourceText` 为空。

### 4. 翻译接口迁移

- 划词翻译不再调用本项目当前会话的 `agentSessionPresenter.translateText`。
- 已改为使用 `chat-pc` 中配置的固定翻译应用接口。
- 请求路径为 `/build_agent/v1/chat-messages`。
- 请求体保持 `chat-pc` 结构：
  - `query`：划词文本
  - `response_mode`：`blocking`
  - `inputs.target_lang`：目标语言
  - `user`：固定用户标识
- 翻译鉴权包含两部分：
  - 翻译应用自身的固定 app token
  - 当前项目主窗口登录态中的 `xkaitoken`，作为 `Fusion-Auth` 请求头
- 当前 `zh-CN` 会转换为 `zh`，避免和 `chat-pc` 翻译应用的语言参数不一致。

### 5. Token 获取逻辑调整

- 主进程新增 `getMainWindowToken()`。
- 通过主窗口 `localStorage.getItem('xkaitoken')` 读取当前登录 token。
- `CardPopup` 会同步主窗口 token 到自己的 localStorage。
- 翻译请求会把该 token 带到 `Fusion-Auth` 请求头。
- preload 暴露了 `getAuthToken()`，供划词相关 renderer 逻辑使用。

### 6. uiohook 关闭保护

- 增加 `destroyHighlightedTextFeature()`。
- 在应用 `before-quit` 和 `will-quit` 阶段强制清理 `uiohook`。
- 清理动作包含：
  - 关闭划词面板
  - 关闭翻译弹窗
  - `uIOhook.stop()`
  - `uIOhook.removeAllListeners()`
- 该逻辑用于降低关闭辅助功能权限或退出应用时 `uiohook` 未销毁导致系统卡死的风险。

### 7. 主进程启动接入

- 修改 `src/main/appMain.ts`。
- 在应用主窗口和 presenter 初始化后调用 `initHighlightedTextFeature()`。
- 划词能力随应用启动自动初始化。

### 8. Preload 和 Renderer API 接入

- 修改 `src/preload/index.ts` 和 `src/preload/index.d.ts`。
- 新增划词相关桥接方法：
  - `getAuthToken`
  - `getCurrentCardPopupText`
  - `getCurrentTranslatePopupText`
  - `translateSelectedText`
  - `startWindowDrag`
  - `moveWindowDrag`
  - `endWindowDrag`
- 修改 `src/renderer/api/runtime.ts`，封装 runtime API。
- 新增 `src/renderer/api/HighlightedTextClient.ts`，集中封装划词弹窗使用的 IPC 和 runtime 调用，避免组件直接访问 `window`。
- `HighlightedTextClient` 负责封装划词面板、翻译弹窗、复制、拖拽、关闭等 IPC 行为。

### 9. 首次文本为空问题处理

- `CardPopup` 首次打开时，主进程会将划词文本保存到 `currentCardPopupText`。
- `/card-popup` 路由会尝试通过 query 携带文本。
- `CardPopup` 初始化时先读路由文本，挂载后再通过 IPC 兜底读取主进程缓存文本。
- 翻译弹窗打开时，主进程会将文本保存到 `currentTranslatePopupText`。
- `SelectionTranslatePopup` 挂载和执行翻译前都会兜底读取主进程缓存文本。
- 该处理用于解决首次窗口创建时 renderer IPC 监听尚未注册，导致第一次划词翻译原文为空的问题。

### 10. 路由和应用壳处理

- 修改 `src/renderer/src/router/index.ts`。
- 新增两个路由：
  - `/card-popup`
  - `/selection-translate`
- 修改 `src/renderer/src/App.vue`。
- 对划词弹窗路由使用独立渲染，不进入主应用侧边栏、登录页、启动页等布局。

### 11. 资源和依赖

- 新增资源文件：
  - `resources/translate.svg`
  - `resources/AIfile.svg`
  - `resources/copy.svg`
  - `resources/drag.svg`
- 修改 `package.json`，新增 `uiohook-napi`。
- 修改 `pnpm-lock.yaml`，同步依赖锁定信息。
- 修改 `electron-builder.yml`，增加 `uiohook-napi` 原生模块 unpack 配置，保证打包后原生模块可用。

### 12. 调试日志状态

- 过程中曾临时加入划词和翻译弹窗调试日志，用于定位首次 `sourceText` 为空的问题。
- 当前这些调试日志、自动打开 DevTools、`highlighted-text:debug-log` IPC 和 `logs/highlighted-text.log` 已全部移除。
- 当前代码只保留修复后的文本兜底逻辑，不再持续写入划词日志文件。

## 涉及文件

### 新增文件

- `src/jiaorong_src/highlightedText/index.ts`
- `src/renderer/api/HighlightedTextClient.ts`
- `src/renderer/src/components/highlighted-text/CardPopup.vue`
- `src/renderer/src/components/highlighted-text/SelectionTranslatePopup.vue`
- `resources/translate.svg`
- `resources/AIfile.svg`
- `resources/copy.svg`
- `resources/drag.svg`
- `docs/highlighted-text-migration.md`

### 修改文件

- `electron-builder.yml`
- `package.json`
- `pnpm-lock.yaml`
- `src/main/appMain.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/api/runtime.ts`
- `src/renderer/src/App.vue`
- `src/renderer/src/router/index.ts`
- `src/renderer/src/components/highlighted-text/CardPopup.vue`
- `src/renderer/src/components/highlighted-text/SelectionTranslatePopup.vue`
- `src/renderer/api/HighlightedTextClient.ts`

## 已验证

- `pnpm exec oxfmt src/jiaorong_src/highlightedText/index.ts`
- `pnpm run typecheck`
- `pnpm run lint`

说明：`pnpm run lint` 通过，但项目中已有文件仍存在 warning，主要集中在 `fixed-agent-iconfont` 和 `sm4` 等既有代码中，不是本次划词迁移新增的问题。

## 当前注意事项

- 解释按钮只迁移了入口和 UI，没有迁移 `chat-pc` 的解释调用方法。
- 划词弹窗和翻译弹窗都保留了首次文本兜底读取逻辑，用于规避窗口首次创建时 IPC 监听时序问题。
- 当前已移除调试日志和自动打开 DevTools，如需再次排查问题，需要重新开启临时日志。
- 如果翻译仍失败，需要看接口实际返回内容，重点排查：
  - 当前登录 token 是否存在或过期
  - 本机是否能访问翻译服务域名
  - 翻译应用接口是否要求额外鉴权或参数
  - `Fusion-Auth` 是否符合当前环境要求
