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

`app.json.spawn` 在点开时由应用平台执行一次（可用 `&&`）。不向子进程注入超级智能体 IPC，只带握手环境变量 `JIAORONG_APP_ID` / `JIAORONG_BRIDGE_TOKEN`。

页面启动时调用注入的 `window.initRendererBridge(约定端口)`。端口写在前后端常量里（默认 8787），客户端不探口、不管冲突。业务请求走 `POST /rpc`。

```bash
cd src/jiaorong_src/apps/app-scaffold/web && pnpm install --ignore-workspace && pnpm build
cd ../node && pnpm install --ignore-workspace
```
