# 交融子应用 MCP 随应用启停（tasks）

1. [x] 新增共享判定 `isJiaorongAppOwnedMcpServer`
2. [x] 启动初始化、全局开关与工具快照期望源跳过子应用 MCP
3. [x] 失败通知过滤子应用 MCP
4. [x] AppHost 打开 / 离开应用时启停子应用 MCP
5. [x] 补充 serverManager / mcpService 回归用例
6. [x] 运行定向测试与 format / lint / typecheck
7. [x] 修复「连接中更新配置仍沿用旧 token」竞态

## 验证结果

- `test/main/mcp`：244 通过（2 跳过）
- `test/main/jiaorong`：205 通过
- `pnpm run typecheck:node`、`pnpm run lint`、`oxfmt`：通过
- `pnpm run i18n:validate`：仓库既有缺口（`settings.mcp.serverStartFailedDesc`
  仅 zh-CN / en-US 有值），与本次改动无关
- `test/main/tool/codeMode/toolModeTools.test.ts`：仓库既有失败
  （`omits direct Loop tools from generated SDK declarations`），该用例只依赖
  `@/tool/codeMode/toolModeTools`，与本次改动无引用关系
