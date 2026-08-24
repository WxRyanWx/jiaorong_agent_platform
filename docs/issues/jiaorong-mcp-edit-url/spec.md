# MCP 编辑服务器无反应、看不到知识库 URL

## 问题

`jiaorong-knowledge-base` 带 `source:plugin`。主进程已按 server 名不当插件闸门，渲染进程 `mcp` store 仍把它滤出列表。用户只能点到「内置知识库检索」，编辑会 `router.push('settings-knowledge-base')`，主窗口无此路由，点击无反应。详情只显示 `command`，HTTP 的 `baseUrl` 看不到。

## 验收

- MCP 列表能看到 `jiaorong-knowledge-base`，详情/编辑能看到生产 URL。
- 主窗口点内置知识库「编辑」会打开设置窗知识库页，不再静默失败。

## 非目标

- 不改远端 RAG `8200` 配置。
