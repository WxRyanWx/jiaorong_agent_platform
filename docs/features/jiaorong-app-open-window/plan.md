# 实现

`preload.ts` 增加 `window.open`，走已有的 `window.open` 桥方法。

`appWindow.ts` 负责：

- 解析地址。绝对 `http` / `https` 原样使用。相对地址用调用页做基准；没有网页调用页时落到 `jiaorong-app://<appId>/`。
- 创建 `BrowserWindow`。`nodeIntegration` 关闭，`contextIsolation` 打开，`sandbox` 关闭（preload 需要 Electron），分区用该应用的 persist 分区，preload 用 `jiaorongApp.mjs`。
- 打开前 `bindGuestAppId`，关闭时 `unbindGuest`。导航只允许 `http` / `https` 和本应用协议。
- 宽高缺省 1100×760，并限制在合理范围内。每个应用最多 8 个窗口。
- 只拦顶层导航。子框架不拦，避免网页里的 iframe 被截断。加载失败时把窗口显示出来。
- 这些窗口全部关掉、且应用内 webview 也不在了，才停 Node。应用内页面还开着时，关掉额外窗口不停进程。

`app.json` 的 `openInWindow: true` 由 `parseAppManifest` 读出。用户偏好在 `open-window-apps.json`，按应用 id 记布尔值；没有记录才回落到包内字段。打开信息和侧栏项都用这个最终结果。渲染进程看到结果为真后不进应用页，改调 `jiaorong-app:open-in-window`。

卡片按钮走 `jiaorong-app:open-window-preference`，写法对齐钉到菜单：只改本机文件，成功后刷新目录。

测试覆盖地址解析、开窗参数、重复打开聚焦，不启动真实 Electron。
