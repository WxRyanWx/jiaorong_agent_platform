import { createMcpClient } from '@api/McpClient'
import { getToken } from '../../auth/lib/local-user'
import { isTrue } from '../../api/auth/interceptors/rules'
import { resolveKnowledgeBaseMcpUrl } from '../../api/knowledgeBase/mcpConfig'
import type { MCPServerConfig } from '@shared/presenter'
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
    'Product-Id': isTrue() ? '9e59fc68bbe539556206d9d3f6b973c1' : 'f5831af6faf190db5f9818a1ab71d68c'
  }
}

function buildServerConfig(token: string): MCPServerConfig {
  return {
    command: '',
    args: [],
    env: {},
    descriptions: JIAORONG_KB_MCP_SERVER_DESCRIPTION,
    icons: '📚',
    // ToolManager 对 knowledge_base_retrieve 无法匹配 read 关键词，会默认判为 write；
    // 因此不能只配 ['read']，否则每次调用都会弹权限确认。
    // 远端目前仅返回 retrieve 一个工具，用 all 即可自动执行。
    autoApprove: ['all'],
    enabled: true,
    type: 'http',
    baseUrl: resolveKnowledgeBaseMcpUrl(),
    customHeaders: buildCustomHeaders(token),
    source: 'plugin',
    ownerPluginId: 'jiaorong'
  }
}

function runtimeFingerprint(
  config: Pick<MCPServerConfig, 'baseUrl' | 'customHeaders' | 'autoApprove' | 'descriptions'>
): string {
  return JSON.stringify({
    baseUrl: config.baseUrl ?? '',
    fusionAuth: config.customHeaders?.['Fusion-Auth'] ?? '',
    authorization: config.customHeaders?.Authorization ?? '',
    productId: config.customHeaders?.['Product-Id'] ?? '',
    autoApprove: [...(config.autoApprove || [])].sort(),
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
      autoApprove: nextConfig.autoApprove,
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
