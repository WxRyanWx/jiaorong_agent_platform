# 启动时动态获取 Jiaorong 服务商 Key

## 用户需求

内置 `jiaorong` 服务商的 key 目前写死在代码里。改为客户端启动时用扫码登录的
`xkaitoken` 调用私有接口动态获取：

1. `POST /api/model-center/project/init`，请求头 `Fusion-Auth: <xkaitoken>`，取返回数组第一项的 `id`。
2. `POST /api/model-center/apiKey/create?projectId=<id>&source=1`，请求头同上，请求体
   `{ "projectId": "<id>", "source": 1 }`，取 `data` 字符串作为 `jiaorong` 服务商 key。

接口地址跟随客户端现有环境切换：`pnpm dev` / `build:test` 走测试服，正式包走正式服。

## 验收

1. 源码中不再存在写死的 Jiaorong key，`DEFAULT_PROVIDERS` 里 `jiaorong.apiKey` 为空串。
2. 每次客户端启动、且本地已有登录会话时，调用一次 `project/init` 和 `apiKey/create`，把返回 key
   写入 `jiaorong` 服务商并触发 provider 变更事件。
3. 首次扫码登录（会话刚写入主进程）后立即刷新一次，无需重启客户端。
4. 未登录（无 token）时清除已存的 Jiaorong key，避免换账号后继续使用上一个账号的额度。
5. 接口失败时保留现有 key，只记录告警，不阻塞启动。
6. 两个接口的实现全部位于 `src/jiaorong_src` 私有目录，并复用现有私有 API 的 axios 实例。
7. `jiaorong` 服务商 `baseUrl` 同步区分环境：测试构建为测试服 `/api/compatible/v1`，
   正式包为 `https://c4ai.ccccltd.cn/api/compatible/v1`；已有配置在启动换 key 时一并校准。

## 非目标

- 不调整 `jiaorong` 服务商的模型目录和默认模型。
- 不把 key 写入 localStorage，不新增 IPC 通道；写 provider 复用现有 provider client。
- 不处理 key 的撤销与多账号并行登录。

## 约束

- 启动链路不能等待网络请求完成，避免拖慢首屏。
- 同一 token 的并发刷新只发一条请求；冷启动补写会话时不能重复建 key。
