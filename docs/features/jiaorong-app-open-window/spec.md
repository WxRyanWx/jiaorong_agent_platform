# 子应用新开窗口

## 需求

交融子应用通过 `window.jiaorong.window.open` 新开一个独立窗口。地址可以是本应用页面，也可以是任意 `http` / `https`。新窗口注入同一个 `window.jiaorong`。

不把 Electron 的 `BrowserWindow` 交给页面。页面只能传地址、标题和宽高。

## 验收

1. `jiaorong.window.open({ url, title, width, height })` 由主进程创建窗口并加载解析后的地址。
2. 相对地址按调用页解析；调用页不是网页时，按本应用 `jiaorong-app://<appId>/...` 解析。
3. `file:`、`javascript:`、`data:` 以及其他应用的 `jiaorong-app://` 被拒绝。
4. 新窗口使用该应用的分区和 `jiaorongApp` preload，并绑定同一 appId。窗口内的 `window.open` 仍然关闭。
5. 同一应用同时最多 8 个这样的窗口。

## app.json

`openInWindow` 可选，只有布尔值 `true` 生效。

- 缺省或 `false`：点「打开」仍进入应用内页面，保留返回。
- `true`：交融应用或侧栏点「打开」新开独立窗口，不进入应用内页面。窗口加载 `entry`。同一入口已经开着时聚焦，不叠窗口。

开发者中心的调试窗口仍内嵌页面。

## 卡片上的打开方式

交融应用卡片在钉按钮旁边有一个打开方式按钮。

- 用户还没点过时，按钮状态跟已安装包的 `app.json.openInWindow` 一致。`true` 显示为新开窗口。
- 用户点击后把选择写进本机偏好，不改 `app.json`。之后以用户选择为准，包内参数改了也不覆盖。
- 未安装时按钮不切换，提示先安装。更新覆盖安装后偏好还在，卸载后清掉。
- 点「打开」和侧栏入口都看这个最终结果。

## 非目标

不放开 webview 里原来的 `window.open`。不提供关闭、移动窗口的接口。
