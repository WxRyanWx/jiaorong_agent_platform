# 生产包装出来知识库 MCP 仍是测试地址

## 问题

正式包 MCP 详情里 `jiaorong-knowledge-base` 的基础 URL 仍是 `http://106.63.7.106:10001/api/knowledge-base/mcp`。代码按 Vite mode 选 origin，正式包应对 `https://c4ai.ccccltd.cn`。地址只在选知识库发送时 `ensure`，打开 MCP 页只读本机已存配置；测试包和生产包共用 `JiaorongAI` userData。

## 验收

- 已登录启动或进入 chat 后，把该 MCP 的 `baseUrl` 写成当前 mode 的 `{auth origin}/api/ai-mcp/knowledge-base`。
- 正式包应为 `https://c4ai.ccccltd.cn/api/ai-mcp/knowledge-base`。
- 未登录不注册、不覆盖。

## 非目标

- 不改扫码 / 知识库 iframe 地址选择。
- 不删用户其它自定义 MCP。
