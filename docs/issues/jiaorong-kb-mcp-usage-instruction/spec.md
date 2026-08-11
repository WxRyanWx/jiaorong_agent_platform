# jiaorong-kb-mcp-usage-instruction

## Goal

用户选中知识库范围时，用知识库 MCP 的**独立配置文案**明确告诉模型：必须先调用 `knowledge_base_retrieve`，只能基于工具结果回答，禁止自行编造。

## Acceptance

- 独立配置文件承载 MCP 说明与选中提示文案（不散落在业务函数里）。
- 有选中：发送仍立即进对话；合成上下文文件含强制调用说明 + 可用 arguments。
- MCP server `descriptions` 同步使用同一套说明。
- 不发送前 await 检索；不改其它 MCP server / ToolManager 逻辑。
- 不跑全仓 format。

## Non-goals

- toolChoice / 运行时强制 tool_call。
- 预取检索注入。
