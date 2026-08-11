# Plan

## Approach

1. `ensureJiaorongKnowledgeBaseMcpServer`：注册远端 HTTP MCP（plugin-owned），幂等启停，鉴权头随登录 token。
2. `prepareKnowledgeBaseSendFiles`：有选中时附加气泡回显 metadata（JSON 字符串）+ 工具参数提示；**不**预取检索。
3. ChatPage / NewThreadPage：发送前 merge KB 文件；MCP ensure 失败不阻断发送。
4. MessageItemUser：识别合成文件，渲染 KB pills。

## Cleanup notes

- 已删除首版「发送前 fetch MCP」客户端 `mcpRetrieve.ts`（SSE 易挂死且无 tool_call UI）。
- metadata 必须存 JSON 字符串，避免 SendMessageInput Zod 校验失败。

## Exposure converge

1. `MCPServerConfig.allowedTools` → `McpClient.listTools` / `callTool` 过滤。
2. KB ensure：`autoApprove: ['read']` + ToolManager 将 `retrieve` 归为 read。
3. `skipPromptResourceListing` → `listPrompts` / `listResources` 直接空结果。
