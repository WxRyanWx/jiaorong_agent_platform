/** 交融子应用通过 `mcp.create` 注册的 MCP 来源标记。 */
export const JIAORONG_APP_MCP_SOURCE = 'jiaorong-app'

/**
 * 是否为交融子应用托管的 MCP。
 * 这类 MCP 随子应用打开 / 关闭起停，客户端启动时不应自动连接。
 */
export const isJiaorongAppOwnedMcpServer = (config?: { source?: string } | null): boolean =>
  config?.source === JIAORONG_APP_MCP_SOURCE
