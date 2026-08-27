import { createMcpClient } from '@api/McpClient'
import { getToken } from '../../auth/lib/local-user'
import { resolveAuthProductId } from '../../api/auth/config'
import { resolveKnowledgeBaseMcpUrl } from '@jiaorong/api/knowledgeBase/mcpConfig'
import type { MCPServerConfig } from '@shared/types/mcp'
import { JIAORONG_KB_MCP_SERVER_NAME } from './knowledgeBaseMcpConstants'
import { JIAORONG_KB_MCP_SERVER_DESCRIPTION } from './knowledgeBaseMcpInstructions'

export {
  JIAORONG_KB_MCP_RETRIEVE_TOOL,
  JIAORONG_KB_MCP_SERVER_NAME
} from './knowledgeBaseMcpConstants'

let writeQueue: Promise<void> = Promise.resolve()
let lastSyncedToken = ''

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
    ownerPluginId: 'jiaorong',
    // 正式服 Spring AI 是 2025 代 MCP：HTTP 默认会先发 server/discover，
    // 旧服务会直接失败，发送侧只看到「知识库服务未就绪」。
    forceLegacyWire: true
  }
}

function runtimeFingerprint(
  config: Pick<MCPServerConfig, 'baseUrl' | 'customHeaders' | 'descriptions' | 'forceLegacyWire'>
): string {
  return JSON.stringify({
    baseUrl: config.baseUrl ?? '',
    fusionAuth: config.customHeaders?.['Fusion-Auth'] ?? '',
    authorization: config.customHeaders?.Authorization ?? '',
    productId: config.customHeaders?.['Product-Id'] ?? '',
    descriptions: config.descriptions ?? '',
    forceLegacyWire: Boolean(config.forceLegacyWire)
  })
}

function sameRuntimeConfig(existing: MCPServerConfig | undefined, next: MCPServerConfig): boolean {
  if (!existing) return false
  return runtimeFingerprint(existing) === runtimeFingerprint(next)
}

async function ensureOnce(options?: { startIfStopped?: boolean }): Promise<void> {
  const token = getToken() || ''
  if (!token) {
    throw new Error('未登录，无法启用知识库 MCP')
  }

  const startIfStopped = options?.startIfStopped !== false
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
    if (startIfStopped) {
      await mcpClient.startServer(JIAORONG_KB_MCP_SERVER_NAME)
    }
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
      ownerPluginId: 'jiaorong',
      forceLegacyWire: true
    })
  }

  if (startIfStopped && !(await mcpClient.isServerRunning(JIAORONG_KB_MCP_SERVER_NAME))) {
    await mcpClient.startServer(JIAORONG_KB_MCP_SERVER_NAME)
  }
}

/**
 * 注册并启动远端知识库 MCP，供对话中模型以 tool_call 调用。
 * 幂等：串行排队；URL/鉴权未变且已运行时 no-op。
 */
export async function ensureJiaorongKnowledgeBaseMcpServer(options?: {
  startIfStopped?: boolean
}): Promise<void> {
  const run = writeQueue.then(
    () => ensureOnce(options),
    () => ensureOnce(options)
  )
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/** 有 token 时把本机残留的测试 URL 写成当前包 origin；未登录跳过。不强迫启动已停止的服务。 */
export function scheduleEnsureJiaorongKnowledgeBaseMcpServer(): void {
  const token = getToken()?.trim()
  if (!token || token === lastSyncedToken) return
  void ensureJiaorongKnowledgeBaseMcpServer({ startIfStopped: false })
    .then(() => {
      lastSyncedToken = token
    })
    .catch((error) => {
      console.warn('[jiaorong/kb-mcp] Failed to sync knowledge-base MCP:', error)
    })
}

export function setupJiaorongKnowledgeBaseMcpSync(router: {
  afterEach: (guard: () => void) => unknown
}): void {
  scheduleEnsureJiaorongKnowledgeBaseMcpServer()
  router.afterEach(() => {
    scheduleEnsureJiaorongKnowledgeBaseMcpServer()
  })
}
