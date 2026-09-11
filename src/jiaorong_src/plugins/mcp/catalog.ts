import type { MCPServerConfig } from '@shared/types/mcp'
import { resolveMcpServerListName as resolveKnowledgeBaseMcpServerListName } from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'
import { TENCENT_MEETING_MCP } from './servers/tencentMeeting'
import { overlayTencentMeetingToolPresentation } from './servers/tencentMeetingTools'
import type { JiaorongPluginMcpDefinition } from './types'

/**
 * 插件中心预置 MCP 注册表。新增：
 * 1. 在 `servers/` 加定义
 * 2. 推进本数组
 * 3. 补 `mcp.inmemory.<name>` i18n
 * 4. 若插件中心不展示，写入 `hidden.ts`
 * 5. 有卡片图就写 `icons.ts`
 */
export const JIAORONG_PLUGIN_MCP_SERVERS: readonly JiaorongPluginMcpDefinition[] = [
  TENCENT_MEETING_MCP
]

export const JIAORONG_PLUGIN_MCP_DEFAULT_SERVERS: Record<
  string,
  Omit<MCPServerConfig, 'enabled'>
> = Object.fromEntries(JIAORONG_PLUGIN_MCP_SERVERS.map((server) => [server.name, server.config]))

const serversByName = new Map(
  JIAORONG_PLUGIN_MCP_SERVERS.map((server) => [server.name, server] as const)
)

export function getJiaorongPluginMcpServer(
  serverName: string | undefined
): JiaorongPluginMcpDefinition | undefined {
  if (!serverName) {
    return undefined
  }
  return serversByName.get(serverName)
}

export function usesJiaorongPluginMcpLegacyWire(serverName: string | undefined): boolean {
  return getJiaorongPluginMcpServer(serverName)?.legacyRemoteWire === true
}

export function resolveJiaorongMcpServerListName(serverName: string): string {
  return (
    getJiaorongPluginMcpServer(serverName)?.displayName ??
    resolveKnowledgeBaseMcpServerListName(serverName)
  )
}

/** 仅预置插件 MCP 叠本地中文 title；description / 协议 id 保持远端原样。 */
export function overlayJiaorongPluginMcpToolPresentation(
  serverName: string,
  toolName: string,
  current: { title: string; description: string }
): { title: string; description: string } {
  return overlayTencentMeetingToolPresentation(serverName, toolName, current)
}

/** 插件 MCP 下拉展示中文点名；开关/调用仍用英文 toolName。其它 MCP 原样。 */
export function resolveJiaorongPluginMcpToolListLabel(
  serverName: string,
  toolName: string,
  displayName?: string
): string {
  if (!getJiaorongPluginMcpServer(serverName)) {
    return toolName
  }
  const overlayTitle = overlayJiaorongPluginMcpToolPresentation(serverName, toolName, {
    title: displayName?.trim() || '',
    description: ''
  }).title
  return overlayTitle || toolName
}

/** 连接时补上目录里缺失的必填头（如 X-Skill-Version），不覆盖用户已填的值。 */
export function withJiaorongPluginMcpRequiredHeaders(
  serverName: string | undefined,
  headers: Record<string, string>
): Record<string, string> {
  const catalogHeaders = getJiaorongPluginMcpServer(serverName)?.config.customHeaders
  if (!catalogHeaders) {
    return headers
  }
  const next = { ...headers }
  const existingKeys = new Set(Object.keys(next).map((key) => key.toLowerCase()))
  for (const [key, value] of Object.entries(catalogHeaders)) {
    if (/^YOUR_[A-Z0-9_]+$/.test(value) || existingKeys.has(key.toLowerCase())) {
      continue
    }
    next[key] = value
  }
  return next
}
