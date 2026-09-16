# 应用脚手架

下载后修改应用 id 和业务文案，即可接入交融侧栏。

```text
app-scaffold/
  app.json                      # id / name / spawn
  icon.png
  web-ui/                       # 构建产物，客户端打开这个
  web/                          # Vue 源码
  node/                         # 包内后端，spawn 拉起
  skill/
```

`app.json.spawn` 在点开时由宿主执行一次（可用 `&&`）。宿主不向子进程注入通信。

只有一种模式：**客户端 → web-ui → 服务端**。页面经 WebSocket 连包内 Node（从 8787 起探口，握手带 `appId`）。对话请求发给 Node；Node 需要宿主能力时，经同一条 WS 让页面代调 `window.jiaorong`。服务端不和客户端直接通信。

改页面后重建：

```bash
cd web
pnpm install
pnpm build
```
