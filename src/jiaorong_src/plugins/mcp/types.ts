import type { MCPServerConfig } from '@shared/types/mcp'

/** 插件中心预置 MCP。新增服务在 `servers/` 写定义，再注册进 catalog。 */
export type JiaorongPluginMcpDefinition = {
  name: string
  displayName: string
  /** 云端不认 era probe / 未知 capabilities 时设 true */
  legacyRemoteWire?: boolean
  config: Omit<MCPServerConfig, 'enabled'>
}
