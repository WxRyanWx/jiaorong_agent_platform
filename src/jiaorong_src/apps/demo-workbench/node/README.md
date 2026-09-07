# Node 转发

客户端按 `app.json` 的 `node.entry` / `node.startCommand` 启动本目录的 `server.js`。用 `egg.start` 单进程，不要 `egg.startCluster`。

Node 调 SDK 走客户端提供的连接，不走 HTTP。本机 HTTP 只给页面或本地调试用；页面用 `getContext().nodeBase` 访问。

本机调试：交融客户端已启动并登录后，可在系统终端执行 `node server.js`，默认 `127.0.0.1:8787`。应用须已安装。侧栏拉起的那份和终端这份都可以连 SDK；页面 HTTP 始终走 `getContext().nodeBase`。

业务只改 `app/service/biz.js`。

```text
node/
  server.js
  app/lib/attachJiaorong.js # 终端调试时连上客户端
  app/controller/sdk.js     # POST /api/sdk、GET /api/events
  app/service/jiaorong.js   # connect({ runtime: 'node' })
  app/service/biz.js        # 业务钩子
```

SDK：`https://c4ai.ccccltd.cn/xkprosdk/jiaorong-app-sdk-1.0.0.tgz`。
