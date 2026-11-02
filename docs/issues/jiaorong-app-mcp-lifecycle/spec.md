# 交融子应用 MCP 随应用启停（spec）

## 现象

客户端启动即报「无法连接到 cowork」。`cowork` 是协同平台子应用通过桥
`mcp.create` 注册的 HTTP MCP（`source: 'jiaorong-app'`，`sourceId` 为应用 id），
用户没有打开该子应用时也会被主进程自动连接；配置里的
`customHeaders.Authorization` 是子应用下发的短期 JWT，过期后连接失败，
失败又以全局语义通知（toast）的形式弹出。

## 根因

1. `mcp.create` 把子应用私有 MCP 写入全局 MCP 表并默认启用。
2. `McpService.initialize()` 自动连接所有 enabled 的 MCP，只跳过插件托管来源，
   没有跳过 `source === 'jiaorong-app'`。
3. `ServerManager` 的连接失败通知同样只过滤插件来源，子应用 MCP 失败会弹全局提示。
4. 客户端启动阶段连接时用的是上次持久化的 token，必然早于子应用本次启动下发的
   新 token，属于无效连接尝试。

## 目标

- 客户端启动不再自动连接子应用托管 MCP，消除未打开子应用时的启动报错。
- 子应用打开时启动其名下 MCP，关闭（离开应用 / 关窗触发 leave）时停止。
- 子应用 MCP 连接失败只记录日志与诊断，不弹全局通知。
- 保证子应用每次打开时下发的 token 能生效（运行中的服务器随配置更新重启）。

## 验收标准

- 启动客户端后，`source === 'jiaorong-app'` 的 MCP 不进入连接流程。
- 打开协同平台后，其名下 enabled 的 MCP 被启动，工具可在对话中调用。
- 关闭协同平台后，其名下 MCP 停止，其他 MCP（内置 / 用户自建 / 插件）不受影响。
- 子应用 MCP 连接失败不触发 `mcp.connectionFailed` 语义通知。
- `mcp.create` 更新运行中服务器的 token 后，服务器按新配置重启并连接成功。
- 全局 MCP 开关关闭时，子应用打开也不启动其 MCP（与现有开关语义一致）。

## 非目标

- 不迁移全局 MCP 表结构，不改变 `mcp.create` 的写入契约与 `enabled` 语义。
- 不改变插件托管（`source === 'plugin'`）MCP 的启停与通知规则。
- 不改变 MCP 设置页对子应用 MCP 的展示。
- 不为多窗口打开的同一应用做引用计数；停止时机与现有 `spawn` 生命周期保持一致。
