# 任意 URL 应用入口

## 目标

`app.json` 的 `entry` 允许填写任意绝对 URL，客户端直接在子应用 webview 中打开该地址。

## 需求

- `entry` 支持包内相对路径和任意绝对 URL（`http` / `https` / `file` / 其它外部 scheme）。
- URL 入口使用独立 persist partition，并继续注入应用 preload。
- 保持 `contextIsolation`、禁用 Node、开启 `webSecurity`、禁止嵌套 webview。
- 外部 `https` 页面只能在已绑定的应用 webview 中调用 `window.jiaorong`。

## 验收

- `entry: "https://www.baidu.com"`、`http://example.com`、`file:///...` 都能打开页面，不再显示「找不到该应用」。
- `entry` 不能写成其它应用的 `jiaorong-app://`，避免跨应用伪造。
- URL 入口的 `appId` 只从宿主生成的 partition 绑定，不信任 URL 参数。
- 既有包内入口与本机回环入口行为不变。

## 非目标

- 不实现域名白名单、跨站登录托管或远程应用签名。
