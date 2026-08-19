import { createMcpClient } from '@api/McpClient'
import { getToken } from '../../auth/lib/local-user'
import { resolveAuthProductId } from '../../api/auth/config'
import { resolveKnowledgeBaseMcpUrl } from '../../api/knowledgeBase/mcpConfig'
import type { MCPServerConfig } from '@shared/types/mcp'
import { JIAORONG_KB_MCP_SERVER_NAME } from './knowledgeBaseMcpConstants'
import { JIAORONG_KB_MCP_SERVER_DESCRIPTION } from './knowledgeBaseMcpInstructions'

export {
  JIAORONG_KB_MCP_RETRIEVE_TOOL,
  JIAORONG_KB_MCP_SERVER_NAME
} from './knowledgeBaseMcpConstants'

let inFlight: Promise<void> | null = null

function buildCustomHeaders(token: string): Record<string, string> {
  return {
    'Fusion-Auth': token,
    // 主进程 MCP 客户端会把 Authorization 交给 OAuthProvider，需 Bearer 前缀
    Authorization: token ? `Bearer ${token}` : '',
    'Product-Id': resolveAuthProductId()
  }
}

function buildServerConfig(token: string): MCPServerConfig {
  // 不写 autoApprove：mcp/settings 会删该字段。免确认只在宿主 shouldBrokerMcpTool
  // 按 JIAORONG_KB_MCP_SERVER_NAME 跳过 broker，其它 MCP 仍走权限确认。
  // source/ownerPluginId 沿用 master 元数据；宿主按 server 名当普通 HTTP MCP 启停，
  // 避免上游「未注册插件」闸门拦住 startServer。
  return {
    command: '',
    args: [],
    env: {},
    descriptions: JIAORONG_KB_MCP_SERVER_DESCRIPTION,
    icons: '📚',
    enabled: true,
    type: 'http',
    baseUrl: resolveKnowledgeBaseMcpUrl(),
    customHeaders: buildCustomHeaders(token),
    source: 'plugin',
    ownerPluginId: 'jiaorong'
  }
}

function runtimeFingerprint(
  config: Pick<MCPServerConfig, 'baseUrl' | 'customHeaders' | 'descriptions'>
): string {
  return JSON.stringify({
    baseUrl: config.baseUrl ?? '',
    fusionAuth: config.customHeaders?.['Fusion-Auth'] ?? '',
    authorization: config.customHeaders?.Authorization ?? '',
    productId: config.customHeaders?.['Product-Id'] ?? '',
    descriptions: config.descriptions ?? ''
  })
}

function sameRuntimeConfig(existing: MCPServerConfig | undefined, next: MCPServerConfig): boolean {
  if (!existing) return false
  return runtimeFingerprint(existing) === runtimeFingerprint(next)
}

async function ensureOnce(): Promise<void> {
  const token = getToken() || ''
  if (!token) {
    throw new Error('未登录，无法启用知识库 MCP')
  }

  const mcpClient = createMcpClient()
  const nextConfig = buildServerConfig(token)
  const servers = await mcpClient.getMcpServers()
  const existing = servers[JIAORONG_KB_MCP_SERVER_NAME]
  const running = await mcpClient.isServerRunning(JIAORONG_KB_MCP_SERVER_NAME)

  // 配置未变且已在跑：直接复用，避免 update/stop/start 竞态
  if (existing && running && sameRuntimeConfig(existing, nextConfig)) {
    return
  }

  if (!existing) {
    const added = await mcpClient.addMcpServer(JIAORONG_KB_MCP_SERVER_NAME, nextConfig)
    if (!added) {
      throw new Error('注册知识库 MCP 失败')
    }
    await mcpClient.startServer(JIAORONG_KB_MCP_SERVER_NAME)
    return
  }

  if (!sameRuntimeConfig(existing, nextConfig)) {
    // updateMcpServer 在原先 running 时会自行 stop+start，这里不要再手动 stop/start
    await mcpClient.updateMcpServer(JIAORONG_KB_MCP_SERVER_NAME, {
      baseUrl: nextConfig.baseUrl,
      customHeaders: nextConfig.customHeaders,
      enabled: true,
      descriptions: nextConfig.descriptions,
      icons: nextConfig.icons,
      type: 'http',
      source: 'plugin',
      ownerPluginId: 'jiaorong'
    })
  }

  if (!(await mcpClient.isServerRunning(JIAORONG_KB_MCP_SERVER_NAME))) {
    await mcpClient.startServer(JIAORONG_KB_MCP_SERVER_NAME)
  }
}

/**
 * 注册并启动远端知识库 MCP，供对话中模型以 tool_call 调用。
 * 幂等：并发调用合并；URL/鉴权未变且已运行时 no-op。
 */
export async function ensureJiaorongKnowledgeBaseMcpServer(): Promise<void> {
  if (inFlight) {
    return inFlight
  }
  inFlight = ensureOnce().finally(() => {
    inFlight = null
  })
  return inFlight
}
