# Node HTTP 脚手架（Egg）

宿主 spawn 本目录的 `server.js`，并注入 `globalThis.jiaorong`。必须**单进程**启动，不要 `egg.startCluster`，否则 worker 拿不到桥。

入口和转发层都加了中文注释，按文件头说明改。业务只动 `app/service/biz.js`。

```text
node/
  server.js                 # egg.start 单进程 + listen
  app.js                    # SSE 客户端集合
  app/controller/sdk.js     # POST /api/sdk、GET /api/events，默认原样转发
  app/service/jiaorong.js   # 只在这里 connect({ runtime: 'node' })
  app/service/biz.js        # 业务钩子，默认空
  config/                   # 关 CSRF、开 CORS
```

业务改 `app/service/biz.js` 的 `beforeInvoke` / `afterInvoke`，不要改转发层。

前端所有 SDK 调用都走 `POST /api/sdk`，body 为 `{ method, args }`。method 清单在 `app/service/jiaorong.js` 的 `dispatch`。

SDK 用 1.0.0：`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`。

Egg 启动后会写 `run/`、`logs/`，已在应用 `.gitignore` 里，不要提交。
