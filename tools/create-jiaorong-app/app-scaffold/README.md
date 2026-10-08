# 示例应用

改应用 id 和业务文案即可接入交融，默认挂在应用中心。目录结构与《快速开始》一致。

```text
app-scaffold/
  app.json                      # id / name / entry / spawn
  icon.png                      # 应用图标
  web-ui/                       # 构建产物，客户端打开这个
  web/                          # Vue 源码，位置不限，构建产物拷进 web-ui/
  node/                         # 本机服务，spawn 拉起；业务代码在 node/service/
  skill/                        # 应用自带技能，一个目录一份 SKILL.md；example 是模板，换成你自己的
```

链路：页面 `POST /rpc` → 本机服务（`node/`）→ WS 桥 → 页面 `window.jiaorong` → 超级智能体。页面不直接调宿主能力，本机服务也不直连超级智能体。

`app.json.spawn` 在点开应用时由应用平台执行一次（可用 `&&`）。客户端不向子进程注入超级智能体 IPC，只带握手环境变量 `JIAORONG_APP_ID` / `JIAORONG_BRIDGE_TOKEN`。

两个端口写在前后端常量里，客户端不探口、不管冲突：

| 端口 | 用途 | 环境变量 | 页面侧常量 |
| --- | --- | --- | --- |
| 47821 | WS 桥，页面 `initRendererBridge` 连它 | `JIAORONG_NODE_PORT` | `NODE_PORT` |
| 47822 | HTTP，页面业务请求打 `POST /rpc` | `JIAORONG_NODE_HTTP_PORT` | `NODE_HTTP_PORT` |

桥在 `web/src/main.ts` 里挂载一次，页面卸载时调 `stop()`；业务请求见 `web/src/api/index.ts`；方法名映射见 `node/service/forward.js`。

```bash
cd web && pnpm --ignore-workspace install && pnpm --ignore-workspace run build
cd ../node && pnpm --ignore-workspace install
```

`--ignore-workspace` 只有 pnpm 需要：项目落在某个 `pnpm-workspace.yaml` 下面时，不加它会把依赖装进上级工作区、退出码却还是 0；npm / yarn 不用加。

调试时把 `app.json` 的 `entry` 改成 `pnpm run dev` 打印的地址，交付前改回 `web-ui/index.html`。改了 `node/` 之后，离开应用再打开。
