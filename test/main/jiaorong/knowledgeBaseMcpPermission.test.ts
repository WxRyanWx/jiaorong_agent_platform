import { describe, expect, it, vi } from 'vitest'
import { TOOL_EXECUTION, type MCPToolDefinition } from '@shared/types/mcp'
import { ToolService } from '@/tool'
import { CommandPermissionService } from '@/tool/permission'
import { createAgentToolDependencies } from '../tool/agentTools/agentToolDependencies'
import {
  JIAORONG_KB_MCP_RETRIEVE_TOOL,
  JIAORONG_KB_MCP_SERVER_NAME
} from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env.TEMP || process.env.TMP || '/tmp'
  }
}))

const buildToolDefinition = (name: string, serverName: string): MCPToolDefinition => ({
  execution: TOOL_EXECUTION.write,
  type: 'function',
  function: {
    name,
    description: `${name} tool`,
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  server: {
    name: serverName,
    icons: '',
    description: `${serverName} server`,
    id: '11111111-1111-4111-8111-111111111111',
    configGeneration: 1,
    bindingHash: 'binding-hash'
  },
  raw: {
    name,
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
})

describe('jiaorong knowledge base MCP permission', () => {
  it('skips the permission broker only for jiaorong-knowledge-base', async () => {
    const kbDefinition = buildToolDefinition(
      JIAORONG_KB_MCP_RETRIEVE_TOOL,
      JIAORONG_KB_MCP_SERVER_NAME
    )
    kbDefinition.server.id = '22222222-2222-4222-8222-222222222222'
    const otherDefinition = buildToolDefinition('brave_web_search', 'brave')
    const mcpService = {
      getAllToolDefinitions: vi.fn().mockResolvedValue([kbDefinition, otherDefinition]),
      callTool: vi.fn().mockResolvedValue({
        content: 'ok',
        rawData: { toolCallId: 'kb-1', content: 'ok' }
      })
    }
    const toolService = new ToolService({
      skillSettings: { isEnabled: () => false } as never,
      mcpService: mcpService as never,
      agentSettings: { resolveDeepChatAgentConfig: vi.fn(async () => ({})) } as never,
      providerSettings: { getModelConfig: vi.fn() } as never,
      settings: { get: vi.fn() },
      commandPermissionHandler: new CommandPermissionService(),
      agentTools: createAgentToolDependencies({
        resolveConversationSessionInfo: vi.fn(async (sessionId: string) => ({
          sessionId,
          sessionKind: 'regular'
        }))
      })
    })

    await toolService.getAllToolDefinitions({
      chatMode: 'agent',
      conversationId: 'session-1'
    })

    const kbRequest = {
      id: 'kb-1',
      type: 'function' as const,
      function: { name: JIAORONG_KB_MCP_RETRIEVE_TOOL, arguments: '{}' },
      conversationId: 'session-1'
    }
    const otherRequest = {
      id: 'other-1',
      type: 'function' as const,
      function: { name: 'brave_web_search', arguments: '{}' },
      conversationId: 'session-1'
    }

    await expect(
      toolService.preCheckToolPermission(kbRequest, { permissionMode: 'default' })
    ).resolves.toBeNull()
    await expect(
      toolService.preCheckToolPermission(otherRequest, { permissionMode: 'default' })
    ).resolves.toMatchObject({
      needsPermission: true,
      serverName: 'brave',
      toolName: 'brave_web_search'
    })

    const kbResult = await toolService.callTool(kbRequest, { permissionMode: 'default' })
    expect(mcpService.callTool).toHaveBeenCalledTimes(1)
    expect(kbResult.rawData.requiresPermission).not.toBe(true)

    const otherResult = await toolService.callTool(otherRequest, { permissionMode: 'default' })
    expect(mcpService.callTool).toHaveBeenCalledTimes(1)
    expect(otherResult.rawData).toMatchObject({
      requiresPermission: true,
      permissionRequest: { serverName: 'brave' }
    })
  })
})
