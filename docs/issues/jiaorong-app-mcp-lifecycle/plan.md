# 交融子应用 MCP 随应用启停（plan）

## 判定

新增共享判定 `isJiaorongAppOwnedMcpServer(config)`（`src/shared/mcp/`），
只认 `source === 'jiaorong-app'`，供主进程 MCP 服务与 AppHost 复用。

## 改动

1. `src/main/mcp/index.ts`
   - `initialize()` 与 `setMcpEnabled(true)` 的自动启动循环跳过子应用托管 MCP。
   - 新增 `startAppOwnedMcpServers(appId)` / `stopAppOwnedMcpServers(appId)`：
     按 `source === 'jiaorong-app' && sourceId === appId` 选出服务器；
     启动复用 `startServerInBackground`（不阻塞调用方），只启动 `enabled !== false` 的条目；
     停止走 `stopServerDirect`，不改持久化 `enabled`，下次打开可再次启动。
2. `src/main/mcp/index.ts`（续）
   - `updateMcpServer` 的「运行中才重启」放宽为「运行中或连接中」：打开应用时后台连接最长
     可占用 45s，子应用此时重新下发 token 若不重启，会继续沿用旧 header 完成连接。
3. `src/main/mcp/serverManager.ts`
   - 连接失败通知条件追加「非子应用托管」，走日志与 `serverLastErrors` 诊断。
4. `src/jiaorong_src/appHost/main/register.ts`
   - 打开应用成功后异步启动该应用名下 MCP；`leave` 停 spawn 的同一位置异步停止。
5. `src/jiaorong_src/appHost/main/deps.ts`
   - `JiaorongAppMcpPort` 增加两个可选方法，避免影响现有构造点与测试桩。

## 兼容性

- `mcp.create` 的写入与启用流程不变；配置更新后运行中 / 连接中的客户端都会重启，
  子应用重新下发 token 时立即生效。
- 插件托管 MCP 的判定顺序不变，仅在通知条件上追加来源判断。
- 停止只按 `sourceId` 命中的应用，不会误停内置、用户自建或插件 MCP。

## 数据流

打开应用 → `JIAORONG_APP_OPEN_CHANNEL` → spawn 子进程 → `startAppOwnedMcpServers`
→ 子应用 `mcp.create` 写入新 token 并重启服务器 → 对话可调用工具。
离开应用 → `JIAORONG_APP_LEAVE_CHANNEL` → `stopApp` → `stopAppOwnedMcpServers`。

## 测试策略

- `test/main/mcp/serverManager.test.ts`：子应用 MCP 失败不产生语义通知，仍保留诊断错误。
- `test/main/mcp/mcpService.test.ts`：初始化跳过子应用 MCP；按 appId 精确启停。
- 回归：`test/main/mcp`、`test/main/jiaorong/appHostMcpCreate.test.ts`。
