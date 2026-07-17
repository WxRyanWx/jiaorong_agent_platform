# HighlightedText 主进程模块

该目录负责全局划词监听、选中文本获取、划词工具条、翻译窗口和相关 IPC。

## 目录结构

```text
highlightedText/
├── index.ts                         # 功能入口、弹窗/IPC 编排和翻译智能体调用
├── README.md                        # 目录结构与运行链路
├── contracts/
│   └── types.ts                     # uiohook、选区等共享类型
├── input/
│   ├── accessibility.ts             # macOS 辅助功能权限检查
│   └── registerSelectionListeners.ts # 鼠标/键盘事件及取词状态机
├── selection/
│   ├── activeWindow.ts              # 获取当前前台窗口信息
│   ├── clipboardSnapshot.ts         # 文本/文件剪贴板快照与恢复
│   ├── filterSelection.ts           # 应用及系统文件对话框过滤
│   ├── getSelected.ts               # Windows UIA 与模拟复制取词
│   └── nativeSelection.ts           # Rust selection Node 模块加载
└── windows/
    └── windowUtils.ts               # 物理坐标到 Electron DIP 转换
```

## 分层约定

- `contracts/` 只定义跨模块类型，不加载原生模块。
- `input/` 负责权限和全局鼠标键盘事件的取词状态机。
- `src/jiaorong_src/highlightedText/input/uiohookRuntime.ts` 在应用进程加载 uiohook。
- `selection/` 只负责判断是否应该取词以及获取选中文本，不创建窗口。
- `windows/` 保存划词窗口共用的坐标和窗口辅助能力。
- `index.ts` 是公共入口，负责组合上述能力、维护弹窗生命周期并注册 IPC。

## 完整链路

### 1. 初始化

1. `appMain.ts` 读取持久化设置 `highlightedTextEnabled`；该值默认是 `true`。
2. 设置开启时调用 `initHighlightedTextFeature(mainWindow)`；关闭时不加载 uiohook。
3. `registerIpcHandlers()` 注册工具条、翻译、复制和拖动窗口 IPC。
4. `loadLocalUiohookRuntime()` 从交融私有目录加载并启动 `uiohook-napi`。
5. `checkAccessibilityPermission()` 在 macOS 检查辅助功能权限。
6. `registerSelectionListeners()` 注册 `mousedown`、`mouseup`、`wheel`、`keydown`、`keyup`。

### 运行时启用与关闭

“设置 → 通用设置 → 启用划词组件”通过 typed settings route 持久化
`highlightedTextEnabled`。主进程监听 `CONFIG_EVENTS.SETTING_CHANGED`，因此切换后无需重启：

```text
开启
  -> initHighlightedTextFeature
  -> 加载/启动 uiohook
  -> 重新注册全局鼠标键盘监听

关闭
  -> destroyHighlightedTextFeature
  -> 关闭 CardPopup 和翻译窗口
  -> stop uiohook
  -> removeAllListeners
```

关闭后不会继续读取选中文本或模拟复制。再次开启时会重新初始化原生 hook。设置缺失时按
`true` 处理，以保持旧版本升级后的既有行为。

### 2. 鼠标选择文本

```text
mousedown
  -> 记录鼠标位置
  -> Windows 读取当前前台窗口
  -> 过滤系统文件对话框
  -> 双击时直接进入 getSelected

mouseup
  -> 判断拖动距离是否超过 5px
  -> 过滤不支持的应用
  -> 调用 getSelected
  -> 排除拖动窗口误触
  -> 计算 selectionAnchorRect
  -> showCardPopup
```

### 3. `getSelected` 取词顺序

1. Windows 调用 `nativeSelection.ts` 加载 Rust 编译的 `bin/selection`。
2. 调用 UIA `getSelectedText()`；成功时直接返回，不修改剪贴板。
3. 原生取词无结果或加载失败时，保存当前文本/文件剪贴板。
4. 写入临时空标记并通过 uiohook 模拟 `Ctrl+C` 或 `Command+C`。
5. 等待目标应用更新剪贴板并读取文本。
6. 如果用户期间执行了真实复制，则保留用户的新剪贴板；否则恢复原快照。

### 4. 键盘状态机

- `keydown` 记录 Ctrl/Command 按下时间。
- 50ms 内出现的复制组合键视为程序模拟复制，不关闭工具条。
- 超过 50ms 的组合键视为用户真实操作；复制键会设置 `copyFlag`。
- `keyup` 根据按键持续时间判断真人操作，并释放取词锁。

### 5. 弹窗链路

```text
showCardPopup
  -> 创建或复用 CardPopup
  -> 固定 242x32 和 zoom=1
  -> 根据选区左上角计算工作区内位置
  -> 推送 card-popup-text
  -> 用户选择翻译 / 解释 / 复制
```

### 6. 翻译智能体链路

用户点击工具条中的“翻译”后，完整调用过程如下：

```text
CardPopup 点击翻译
  -> renderer 发送 highlighted-text:show-translation
  -> showTranslatePopup(text) 打开或复用翻译窗口
  -> 翻译窗口调用 highlighted-text:translate(text, locale)
  -> getMainWindowToken() 从主窗口 localStorage 读取 xkaitoken
  -> POST /api/fusion-ai/chatSession/create
  -> 从响应中取得 chatSessionId
  -> POST /api/fusion-ai/chat/streamChat
  -> 按 SSE 事件解析数据
  -> 累加 cmpl 事件的 choices[0].delta.content
  -> 返回完整译文给翻译窗口
```

#### 认证方式

- 两个接口都通过请求头 `Fusion-Auth` 传递登录 Token。
- Token 不使用 curl 示例中的固定 JWT，也不硬编码 Cookie。
- `getMainWindowToken()` 从主窗口 `localStorage.xkaitoken` 读取当前登录 Token。
- 如果取不到 Token，会直接返回“登录状态已失效，请重新登录”，不会发起匿名翻译请求。
- 创建会话接口额外传递 `Product-Id`，值为翻译产品 ID。

#### 创建翻译会话

接口：`POST /api/fusion-ai/chatSession/create`

```json
{
  "chatSessionName": "选中文本的前 25 个字符",
  "agentId": "ctzvuyfju16txq4iie9e"
}
```

响应会兼容读取 `chatSessionId`、`conversation_id`、`conversationId` 或 `sessionId`。

#### 请求流式翻译

接口：`POST /api/fusion-ai/chat/streamChat`

- `conversation_id` 使用上一步创建的会话 ID。
- `messages[0].content` 包含目标语言和用户选中的原文。
- `agentId` 固定使用翻译智能体 `ctzvuyfju16txq4iie9e`。
- 文件问答、推荐问题、思考过程和联网搜索均关闭，流式返回开启。
- 正文来自 `event === "cmpl"` 的 `choices[0].delta.content`。
- `event === "stop"` 时使用 `message` 作为无增量正文时的兜底。
- `event === "error"` 时终止解析并把服务端错误返回给翻译窗口。

旧版 `/build_agent/v1/chat-messages` 实现仍以注释形式保留在
`translateWithChatPcAppLegacy()` 中，目前不会执行。

#### 翻译相关代码位置

| 方法 | 文件位置 | 作用 |
| --- | --- | --- |
| `getMainWindowToken()` | `index.ts:105` | 从主窗口读取当前登录 Token |
| `translateWithChatPcAppLegacy()` | `index.ts:128` | 已注释的旧版翻译实现 |
| `getCreatedSessionId()` | `index.ts:173` | 兼容提取创建接口返回的会话 ID |
| `readTranslationStream()` | `index.ts:181` | 解析 SSE 并拼接翻译正文 |
| `translateWithChatPcApp()` | `index.ts:225` | 创建会话并调用翻译智能体 |
| `showTranslatePopup()` | `index.ts:559` | 创建或展示翻译窗口 |
| `registerIpcHandlers()` | `index.ts:587` | 注册翻译窗口和翻译请求 IPC |

### 7. Windows 原生资源

Windows 取词依赖单独由 Rust 编译的 Node 模块：

```text
bin/selection/index.js
bin/selection/selection.win32.node
```

开发环境从项目 `bin/selection` 加载；安装包通过 `electron-builder.yml` 复制到 `resources/bin/selection`。Windows 前台窗口识别使用 `bin/win-info-win32.exe`。
