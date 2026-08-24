# 方案

`JIAORONG_DEFAULT_ENABLED_MCP_SERVERS` 去掉 `builtinKnowledge`。已有安装用一次性 key `jiaorongMcpBuiltinKnowledgeDefaultOffV1` 把它关掉。

展示名常量放在 `knowledgeBaseMcpConstants`。`McpServerCard` / 详情标题走该常量；列表搜索同时匹配中文名。
