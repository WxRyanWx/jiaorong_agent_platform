# Node

`app.json.spawn`：`node node/main.js`。入口只做装配与启动，业务代码在 `service/` 下。

```text
node/
  main.js             # 入口：装配依赖、起桥、起 HTTP、启动动作
  config.js           # 端口、智能体与技能常量
  bridge.js           # 页面 ↔ 本进程的 WS 桥，见《快速开始》5.1
  service/
    forward.js        # 方法名映射 HOST_METHODS 与转发
    agent.js          # 技能路径与系统提示词，补齐 agent.create 入参
    http.js           # Elysia：GET /api/health 与 POST /rpc
    startup.js        # 订阅宿主事件、同步智能体
```

两个端口写在 `config.js`，客户端不探口、不管冲突：

| 端口 | 用途 | 环境变量 |
| --- | --- | --- |
| 47821 | WS 桥，页面 `initRendererBridge` 连它 | `JIAORONG_NODE_PORT` |
| 47822 | HTTP，页面业务请求打 `POST /rpc` | `JIAORONG_NODE_HTTP_PORT` |

页面连上桥之后，本进程发 `{msgType:'request'}` 调页面里的 `window.jiaorong`。事件只能由页面转发，所以页面每次连上都会重发一次订阅；智能体在启动时同步一次，页面还没连上时请求会在桥里排队，连上后自动补发。

`/rpc` 入参 `{ method, args }`，出参 `{ ok, data }` 或 `{ ok, error: { code, message } }`。`method` 用 SDK 方法名，例如 `session.send`。只有四个方法名与宿主不同，在 `service/forward.js` 的 `HOST_METHODS` 里映射，其余同名直传；需要限制页面能调哪些方法时，把这张表改成白名单。`agent.create` 会补上 `skill/` 下的技能与系统提示词。

`jr.invoke` / `jr.setDebug` / `jr.getPathForFile` 转发不了：前两个是页面自己的开关，`File` 过不了 JSON，只能在页面里调（见 `web/src/api/index.ts` 的 `getPathForFile`）。

```bash
pnpm install --ignore-workspace
```
