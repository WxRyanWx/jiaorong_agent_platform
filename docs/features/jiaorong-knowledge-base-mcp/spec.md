# jiaorong-knowledge-base-mcp

## Goal

用户选中知识库/文件夹/文件后发送消息：先正常发起对话；由模型在对话中调用远端 MCP `knowledge_base_retrieve`（展示 tool_call UI）；选中项以与附件一致的 pill 回显在用户消息气泡中。

## Acceptance

- 无选中：不启用/不强依赖知识库 MCP，不注入选中上下文。
- 有选中：发送前**不预取**检索结果；注册并启动远端 HTTP MCP；消息中带选中回显 + **强制工具调用说明**（独立配置 `knowledgeBaseMcpInstructions`）+ 供模型填参的 selections。
- 模型调用 `knowledge_base_retrieve`，入参 `{ request: { msg, selections } }`，助手区出现 tool_call UI。
- MCP URL：`{authApiOrigin}/api/mcp/knowledge-base`（与 auth config 同源）。
- 鉴权：`Fusion-Auth` + `Authorization: Bearer <token>` + `Product-Id`。
- DIRECTORY 不递归；id 为 string。
- 选中项气泡回显与附件同排同风格。

## Non-goals

- 发送前由前端直接 tools/call 并把结果当附件塞进 prompt。
- 改侧栏知识库 iframe。

## Exposure / permission constraints

- 远端 MCP 当前仅返回 `knowledge_base_retrieve` 一个工具。
- `autoApprove: ['all']`：因 ToolManager 将 retrieve 判为 write，用 all 才能自动执行（后端单工具前提下可接受）。
- 选中时的模型约束文案见 `knowledgeBaseMcpInstructions` / `docs/issues/jiaorong-kb-mcp-usage-instruction/`。
