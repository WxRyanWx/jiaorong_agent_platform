# 应用脚手架（demo-workbench）

拷贝本目录即可做一个交融侧栏应用。宿主打开 `app.json` 的 `entry` 时会注入 `window.jiaorong`。

```text
demo-workbench/
  app.json
  icon.png
  web-ui/               # Vue 构建产物（不要手改）
  web/                  # 页面源码
  node/                 # Egg 单进程 HTTP 转发
  skill/
```

## 必须遵守

1. Vite `base` 必须是 `'./'`。
2. 路由必须 `createWebHashHistory()`。
3. `NODE_BASE` 必须等于 `app.json` 的 `node.port`。
4. SDK 用 **1.0.0**：`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`。
5. Egg 必须单进程。不要 `startCluster`。

## 两个示例页

| 路由 | 说明 |
| --- | --- |
| `#/` | 直连：页面和组件 `connect()` 走 `window.jiaorong` |
| `#/node` | 页面只 HTTP 调 Node；Node 里才调 SDK；页面把 JSON 灌进两个组件（`external`） |

`#/node` **不要** `import { connect } from 'jiaorong-app-sdk'`。页面和 Node 入口都有中文注释，按注释改即可。

列表默认淡蓝 `#eff5ff`，可用组件 `class` 改颜色。不引用 `chat-kit`。

## 重建

开发机 / 打包机执行。用户机器**不要** `pnpm install`：宿主用 Electron 自带 Node（`ELECTRON_RUN_AS_NODE=1`），没有 npm / pnpm。依赖随 `node/node_modules` 打进安装包。

```bash
cd src/jiaorong_src/apps/demo-workbench/web && pnpm install --ignore-workspace && pnpm build
cd ../node && pnpm install --ignore-workspace
```
