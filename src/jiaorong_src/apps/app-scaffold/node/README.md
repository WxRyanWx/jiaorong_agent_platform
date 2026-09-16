# Node

`app.json.spawn`：`node node/server.js`。Elysia 提供 `/api/health`、`POST /rpc`，默认听 `8787`（可用 `JIAORONG_NODE_PORT` 改）。页面 `initRendererBridge(同一端口)` 连上后，本进程发 `{msgType:'request'}` 调超级智能体。
