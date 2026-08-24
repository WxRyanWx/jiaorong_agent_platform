# builtinKnowledge 默认关闭，知识库 MCP 显示「交融知识库」

## 问题

`builtinKnowledge`（内置知识库检索）被当成默认开启，和登录后注册的 `jiaorong-knowledge-base` 容易混淆。后者在 MCP 列表里显示英文 id。

## 验收

- 新装默认开启：`Artifacts`、对话搜索；macOS 另加 Apple。不含 `builtinKnowledge`。
- 已有安装升级一次后，`builtinKnowledge` 关掉；用户之后再开不强制关。
- MCP 列表和详情标题把 `jiaorong-knowledge-base` 显示为「交融知识库」。服务 id、工具名、URL 不变。

## 非目标

- 不删除 `builtinKnowledge`，用户仍可手动开启。
- 不改远端 MCP 协议名。
