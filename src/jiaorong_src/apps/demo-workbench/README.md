# 应用脚手架

下载后修改应用 id 和业务文案，即可接入交融侧栏。完整字段说明见组件库「交融超级智能体模块 → 应用脚手架」。

```text
demo-workbench/
  app.json              # 应用清单
  icon.png
  web-ui/               # 构建产物，客户端打开这个
  web/                  # Vue 页面
  node/                 # 本机转发（Egg 单进程）
  skill/
```

## 两种接入

| 路由 | 说明 |
| --- | --- |
| `#/` | 页面直连 SDK，组件自己发对话 |
| `#/node` | 页面用 `getContext().nodeBase` 拼 HTTP / SSE，对话由 Node 转发 |

## 使用约定

1. Vite `base` 为 `'./'`，路由用 `createWebHashHistory()`。
2. `app.json` 声明 `node.entry` 和 `node.startCommand`。Node 调 SDK 不走 HTTP。页面要访问本应用 Node 时，用 `getContext().nodeBase`。
3. SDK：`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`。web 和 Node 同一份。
4. Egg 用 `egg.start` 单进程，不要 `startCluster`。
5. 本机调试可在系统终端 `cd node && node server.js`（交融客户端须已启动并登录，应用须已安装）。默认 `127.0.0.1:8787`。侧栏打开后页面仍用 `nodeBase`，不要写死 `8787`。

改页面后重建：

```bash
cd web
pnpm install
pnpm build
```

`pnpm build` 产物会写到 `web-ui/`。本仓库 / 下载的脚手架带 `web/`，方便自己改、自己启动。交给交融客户端安装的应用包只带 `web-ui/`，不要带 `web/` 源码和 `web/node_modules`。有 Node 时必须带 `node/node_modules`。客户端只拉起 Node，不会执行 npm / pnpm。
