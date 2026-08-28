import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMcpServers = vi.hoisted(() => vi.fn())
const isServerRunning = vi.hoisted(() => vi.fn())
const addMcpServer = vi.hoisted(() => vi.fn())
const updateMcpServer = vi.hoisted(() => vi.fn())
const startServer = vi.hoisted(() => vi.fn())
const resolveKnowledgeBaseMcpUrl = vi.hoisted(() =>
  vi.fn(() => 'https://c4ai.ccccltd.cn/api/ai-mcp/knowledge-base')
)

vi.mock('@api/McpClient', () => ({
  createMcpClient: () => ({
    getMcpServers,
    isServerRunning,
    addMcpServer,
    updateMcpServer,
    startServer
  })
}))

vi.mock('@jiaorong/api/knowledgeBase/mcpConfig', () => ({
  resolveKnowledgeBaseMcpUrl
}))

import { ensureJiaorongKnowledgeBaseMcpServer } from '@jiaorong/knowledgeBase/mcp/ensureKnowledgeBaseMcpServer'
import { JIAORONG_KB_MCP_SERVER_NAME } from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'

describe('ensureJiaorongKnowledgeBaseMcpServer', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xkaitoken', 'prod-token')
    getMcpServers.mockReset()
    isServerRunning.mockReset()
    addMcpServer.mockReset()
    updateMcpServer.mockReset()
    startServer.mockReset()
    addMcpServer.mockResolvedValue(true)
    updateMcpServer.mockResolvedValue(undefined)
    startServer.mockResolvedValue(undefined)
    isServerRunning.mockResolvedValue(false)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('rewrites a stored test origin to the current package URL', async () => {
    getMcpServers.mockResolvedValue({
      [JIAORONG_KB_MCP_SERVER_NAME]: {
        type: 'http',
        enabled: true,
        baseUrl: 'http://106.63.7.106:10001/api/knowledge-base/mcp',
        customHeaders: {},
        descriptions: 'old'
      }
    })

    await ensureJiaorongKnowledgeBaseMcpServer({ startIfStopped: false })

    expect(updateMcpServer).toHaveBeenCalledWith(
      JIAORONG_KB_MCP_SERVER_NAME,
      expect.objectContaining({
        baseUrl: 'https://c4ai.ccccltd.cn/api/ai-mcp/knowledge-base',
        forceLegacyWire: true
      })
    )
    expect(startServer).not.toHaveBeenCalled()
  })
})
