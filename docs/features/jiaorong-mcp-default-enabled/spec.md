# 默认开启对话历史搜索 MCP

## 目标

交融默认开启的内置 MCP 清单放在私有目录。在现有 Artifacts、macOS 系统助手、内置知识库检索之上，增加对话历史搜索，并把该服务的工具名与描述改成中文。

## 验收

1. `src/jiaorong_src/mcp/defaultEnabledServers.ts` 是唯一清单。
2. 新安装默认开启：`Artifacts`、`builtinKnowledge`、`deepchat-inmemory/conversation-search-server`；macOS 另加 `deepchat/apple-server`。
3. 已有安装一次性打开对话历史搜索，不把用户关掉的其它 MCP 重新打开。
4. 四个对话搜索工具的 `annotations.title` 与 `description` 为中文；函数 `name` 仍为英文。

## 非目标

- 不改对话搜索 SQL / 召回逻辑。
- 不默认开启博查、Brave、深度研究等其它内置 MCP。
