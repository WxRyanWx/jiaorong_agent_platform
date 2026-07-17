# ScreenShot 主进程模块

该目录负责 Electron 主进程中的截图窗口、屏幕采集、OCR、钉图和跨进程通信。

## 目录结构

```text
screenShot/
├── index.ts                         # 功能入口和核心业务编排
├── README.md                        # 模块结构与维护说明
├── capture/
│   ├── displayMetrics.ts            # 多显示器坐标、缩放和画布计算
│   └── imageUtils.ts                # 图片转换、Base64、剪贴板
├── contracts/
│   ├── ipc.ts                       # IPC channel 和跨进程协议
│   └── types.ts                     # 截图领域类型
├── features/
│   ├── index.ts                     # 具体功能动作分发
│   ├── ocr.ts                       # OCR 识别和 OCR 结果窗口
│   ├── pin.ts                       # 钉图窗口、坐标换算和置顶管理
│   └── windowUtils.ts               # 功能窗口共用的加载与显示工具
├── ipc/
│   └── registerScreenshotIpc.ts     # IPC handler 注册
├── logging/
│   └── runtimeLogger.ts             # 截图会话运行日志
└── session/
    ├── captureCache.ts              # 当前截图会话缓存
    └── exportSelection.ts           # 从缓存导出选区

resources/screen-shot/
├── index.html                       # 截图选区主页面构建产物入口
├── pin.html                         # 轻量钉图页面
└── ocr.html                         # 轻量 OCR loading/结果页面
```

## 分层约定

- `contracts/` 只保存跨进程协议和领域类型，可被 main 与 preload 共同引用。
- `capture/` 负责屏幕坐标、原始像素和图片格式等底层能力，不处理具体业务动作。
- `features/` 负责 OCR、钉图等用户可感知的具体功能实现。
- `session/` 只管理一次截图会话内的数据缓存和选区导出。
- `ipc/` 负责将 IPC channel 适配到具体功能，不承载图片处理算法。
- `logging/` 负责截图链路日志，不依赖具体业务窗口。
- `index.ts` 负责初始化、截图主窗口生命周期和各模块编排，是主进程调用截图功能的公共入口。

新增功能时优先放入 `features/`，通用能力再下沉到 `capture/`、`session/` 或 `logging/`，避免继续扩大 `index.ts`。

## 截图完整链路

### 总览

```text
应用初始化
  -> 快捷键或 Renderer 请求启动截图
  -> 创建/复用截图窗口
  -> Renderer ready
  -> 主进程采集所有显示器
  -> Renderer 绘制截图和选区工具
  -> Renderer reveal
  -> 用户选择 OCR / 钉图等动作
  -> 主进程统一校验并分发到具体 feature
```

### 阶段 0：应用初始化

| 顺序 | 方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `initScreenShotFeature` | [index.ts:528](./index.ts#L528) | 注入登录令牌、快捷键读取器并初始化截图模块。 |
| 2 | `registerIpcHandlers` | [registerScreenshotIpc.ts:34](./ipc/registerScreenshotIpc.ts#L34) | 幂等注册截图窗口、采集、缓存、OCR 和钉图 IPC。 |
| 3 | `globalShortcut.register` | [shortcutPresenter.ts:306](../../main/presenter/shortcutPresenter.ts#L306) | 注册全局截图快捷键，回调中调用 `openScreenShotWindow('hotkey')`。 |

### 阶段 1：触发截图

截图有两个入口：

| 入口 | 调用链 | 代码位置 |
| --- | --- | --- |
| 全局快捷键 | `globalShortcut -> openScreenShotWindow('hotkey')` | [shortcutPresenter.ts:306](../../main/presenter/shortcutPresenter.ts#L306) |
| Renderer 菜单/按钮 | `preload.openScreenShotWindow -> screen-shot:open -> openScreenShotWindow('ipc')` | [preload/index.ts:159](../../preload/index.ts#L159)、[registerScreenshotIpc.ts:39](./ipc/registerScreenshotIpc.ts#L39) |

主进程随后执行：

| 顺序 | 方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `openScreenShotWindow` | [index.ts:207](./index.ts#L207) | 创建截图日志会话；创建或复用透明截图窗口。 |
| 2 | `startScreenshotSession` | [index.ts:169](./index.ts#L169) | 清空旧缓存、准备窗口并安排 startup mark。 |
| 3 | `prepareScreenshotWindow` | [index.ts:152](./index.ts#L152) | 对齐多屏边界、设置置顶，并保持 `opacity=0`。 |
| 4 | `pushStartupMark` | [index.ts:136](./index.ts#L136) | 向 Renderer 发送 `screenshot:startup-mark` 和显示器指标。 |
| 5 | `getDisplayMetricsPayload` | [displayMetrics.ts:62](./capture/displayMetrics.ts#L62) | 计算联合区域、画布大小、缩放和布局模式。 |

窗口复用规则：截图窗口加载完成后不会在每次截图结束时销毁，而是隐藏。下一次调用 `openScreenShotWindow` 会复用窗口，但会清空会话缓存并重新采集屏幕。

### 阶段 2：Renderer 就绪并采集屏幕

| 顺序 | 调用/方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `notifyScreenshotSessionReady` | [preload/index.ts:239](../../preload/index.ts#L239) | Renderer 通知主进程截图页面已经就绪。 |
| 2 | `screenshot:session-ready` handler | [registerScreenshotIpc.ts:43](./ipc/registerScreenshotIpc.ts#L43) | 接收 ready 事件。 |
| 3 | `presentScreenshotWindow` | [index.ts:178](./index.ts#L178) | 显示仍为透明状态的截图窗口，让 Renderer 稳定布局。 |
| 4 | `getScreenFrames` | [preload/index.ts:220](../../preload/index.ts#L220) | Renderer 通过 `screen:get-frames` 请求屏幕分片。 |
| 5 | `screen:get-frames` handler | [registerScreenshotIpc.ts:78](./ipc/registerScreenshotIpc.ts#L78) | 调用采集方法并组装 IPC payload。 |
| 6 | `captureDisplayTiles` | [index.ts](./index.ts) | 临时隐藏截图窗口，并在交融私有模块中调用 `node-screenshots` 采集所有显示器。 |
| 7 | `node-screenshots` | [index.ts](./index.ts) | 在应用进程直接获取各显示器 RGBA 数据，避免首次 Helper 冷启动与跨进程传输。 |
| 8 | `resolveFramePlacement` | [displayMetrics.ts:41](./capture/displayMetrics.ts#L41) | 计算每个显示器 tile 在联合画布中的目标坐标和大小。 |
| 9 | `storeSessionCaptureCache` | [index.ts:60](./index.ts#L60) | 将本次采集 tiles 写入当前会话缓存。 |
| 10 | `setSessionCaptureCache` | [captureCache.ts:31](./session/captureCache.ts#L31) | 保存缓存，供后续选区底图导出。 |

Renderer 收到 frames 后绘制底图、蒙版、选区和工具栏。首帧完成后继续执行：

| 顺序 | 调用/方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `revealScreenshotSession` | [preload/index.ts:241](../../preload/index.ts#L241) | Renderer 调用 `screenshot:session-reveal`。 |
| 2 | reveal handler | [registerScreenshotIpc.ts:48](./ipc/registerScreenshotIpc.ts#L48) | 接收 reveal 事件。 |
| 3 | `revealScreenshotWindow` | [index.ts:195](./index.ts#L195) | 将截图窗口透明度恢复为 `1` 并聚焦。 |

### 阶段 3：用户触发选区功能

Renderer 将选区图片字节、宽高、`selectionRect` 和 `anchorRect` 组成 `ScreenshotPayload`。

| 功能 | Preload 方法 | IPC handler | 功能入口 |
| --- | --- | --- | --- |
| OCR | [`ocrRec`](../../preload/index.ts#L258) | [`screenshot:ocr-rec`](./ipc/registerScreenshotIpc.ts#L238) | [`runOcrAction`](./features/ocr.ts#L129) |
| 钉图 | [`pinByPic`](../../preload/index.ts#L270) | [`screenshot:pin-by-pic`](./ipc/registerScreenshotIpc.ts#L239) | [`runPinAction`](./features/pin.ts#L232) |

两个动作首先进入 [`handleScreenshotAction`](./index.ts#L480)：

1. 校验图片字节，并写入系统剪贴板。
2. 钉图先创建功能窗口，再关闭截图蒙版，避免窗口层级被抢占。
3. 其他动作先关闭截图蒙版，再执行具体功能。
4. [`runPostScreenshotAction`](./features/index.ts#L6) 根据 action 分发到 OCR 或钉图。
5. [`closeScreenshotWindow`](./index.ts#L313) 发送 `screenshot:session-dismiss` 并隐藏截图窗口。

### 阶段 4A：OCR 功能链路

| 顺序 | 方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `warmOcrWorker` | `features/ocr.ts` | 截图会话打开时后台预热 `chi_sim+eng` 模型。 |
| 2 | `runOcrAction` | `features/ocr.ts` | 将图片转为 Base64，创建结果窗口并启动识别。 |
| 3 | `createOcrResultWindow` | `features/ocr.ts` | 加载 `resources/screen-shot/ocr.html`，先展示原图和“识别中”，不加载主 Vue Renderer。 |
| 4 | `ocrImage` | `features/ocr.ts` | 复用已初始化的 Tesseract worker；并发请求通过队列串行识别。 |
| 5 | OCR payload handler | `ipc/registerScreenshotIpc.ts` | OCR 页面通过 `screenshot:get-ocr-result-data` 获取原图和 loading 状态。 |
| 6 | `sendOcrResultWindowData` | `features/ocr.ts` | 识别完成后发送 `ocr-result-data` 更新文字或错误信息。 |

OCR 调用链：

`openScreenShotWindow -> warmOcrWorker`（后台预热）

`ocrRec -> screenshot:ocr-rec -> handleScreenshotAction -> runPostScreenshotAction -> runOcrAction -> loadFile(ocr.html) -> ocrImage -> sendOcrResultWindowData`

OCR worker 正常情况下会跨请求复用，应用退出时统一释放；如果识别异常，会丢弃当前 worker，下一次请求重新初始化。

### 阶段 4B：钉图功能链路

| 顺序 | 方法 | 代码位置 | 作用 |
| --- | --- | --- | --- |
| 1 | `runPinAction` | [pin.ts:232](./features/pin.ts#L232) | 记录动作并创建钉图窗口。 |
| 2 | `createPinByPicWindow` | `features/pin.ts` | 计算窗口尺寸和位置，并加载 `resources/screen-shot/pin.html`，不加载主 Vue Renderer。 |
| 3 | `normalizePinRect` | [pin.ts:38](./features/pin.ts#L38) | 将高分屏原生像素选区换算成 Electron DIP 坐标。 |
| 4 | `applyPinImage` | `resources/screen-shot/pin.html` | 页面加载完成后由主进程注入 Base64，并等待图片 decode。 |
| 5 | `raisePinByPicWindows` | `features/pin.ts` | 图片 decode 后显示窗口；降低旧钉图层级，并将最新钉图提升到最高层。 |

钉图调用链：

`pinByPic -> screenshot:pin-by-pic -> handleScreenshotAction -> runPostScreenshotAction -> runPinAction -> loadFile(pin.html) -> applyPinImage -> raisePinByPicWindows`

轻量页面在开发环境从 `resources/screen-shot` 加载；安装包通过 `electron-builder.yml` 的
`extraResources` 复制到 `app.asar.unpacked/resources/screen-shot`。
`getScreenshotFeatureHtmlPath()` 统一处理两种路径。

### 阶段 5：关闭、缓存与选区导出

| 方法 | 代码位置 | 作用 |
| --- | --- | --- |
| `closeScreenshotWindow` | [index.ts:313](./index.ts#L313) | 隐藏截图窗口；macOS 下恢复工作区和 Dock 状态。 |
| `screen:close-window` handler | [registerScreenshotIpc.ts:172](./ipc/registerScreenshotIpc.ts#L172) | Renderer 主动关闭截图窗口。 |
| `exportSelectionBaseFromCache` | [exportSelection.ts:95](./session/exportSelection.ts#L95) | 从当前会话 tiles 中裁剪并导出选区底图。 |
| export selection handler | [registerScreenshotIpc.ts:190](./ipc/registerScreenshotIpc.ts#L190) | 处理 `screenshot:export-selection-base` 请求。 |

截图窗口采用“隐藏并复用”策略；OCR 和钉图窗口拥有独立生命周期，不会随截图蒙版隐藏而销毁。
