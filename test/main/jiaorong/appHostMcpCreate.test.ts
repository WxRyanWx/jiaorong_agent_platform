import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, { appId: string; key: string; agentId: string }>()

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })) },
  webContents: { fromId: () => null, getAllWebContents: () => [] },
  clipboard: { writeImage: vi.fn() },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) }),
    createFromBuffer: () => ({ isEmpty: () => true })
  }
}))

vi.mock('../../../src/jiaorong_src/appHost/main/agentMap', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/jiaorong_src/appHost/main/agentMap')>()
  return {
    ...actual,
    getAppAgentBinding: (appId: string, key: string) => store.get(`${appId}::${key}`) ?? null,
    appAgentIds: (appId: string) =>
      new Set(
        [...store.values()].filter((item) => item.appId === appId).map((item) => item.agentId)
      )
  }
})

import { handleAppBridgeInvoke } from '../../../src/jiaorong_src/appHost/main/bridge'
import { parseJiaorongMcpCreateJson } from '../../../src/jiaorong_src/appHost/main/mcpCreate'
import { isMcpServerVisibleToAgent } from '../../../src/shared/mcp/visibleToAgent'
import type { JiaorongAppHostDeps } from '../../../src/jiaorong_src/appHost/main/deps'
import type { JiaorongAppRuntime } from '../../../src/jiaorong_src/appHost/types'

const runtime: JiaorongAppRuntime = {
  id: 'demo-workbench',
  name: '示例工作台',
  version: '0.0.2-dev',
  description: '',
  icon: 'icon.png',
  slot: 'menu',
  source: 'builtin',
  enabled: true,
  auth: null,
  package: { kind: 'dir', builtinDir: 'demo-workbench' },
  visible: true,
  installStatus: 'installed',
  installedVersion: '0.0.2-dev',
  appDir: '/tmp/demo-workbench',
  entry: 'web-ui/index.html'
}

const agentRecord = {
  id: 'deepchat-app1',
  name: '示例工作台助手',
  enabled: true,
  config: { jiaorongAppId: 'demo-workbench', jiaorongAppKey: 'workbench' }
}

function deps(overrides?: Partial<JiaorongAppHostDeps>): JiaorongAppHostDeps {
  return {
    getAuthSession: () => ({ token: 'tok-1' }),
    getLocale: () => 'zh-CN',
    getTheme: () => 'light',
    ...overrides
  }
}

describe('jiaorong mcp.create', () => {
  beforeEach(() => {
    store.clear()
    store.set('demo-workbench::workbench', {
      appId: 'demo-workbench',
      key: 'workbench',
      agentId: 'deepchat-app1'
    })
  })

  it('parses streamable-http url json used by cowork', () => {
    const servers = parseJiaorongMcpCreateJson({
      mcpServers: {
        cowork: {
          url: 'http://106.63.7.106:10001/api/ai-mcp/cowork',
          transport: 'streamable-http'
        }
      }
    })
    expect(servers).toEqual([
      {
        name: 'cowork',
        config: expect.objectContaining({
          type: 'http',
          baseUrl: 'http://106.63.7.106:10001/api/ai-mcp/cowork'
        })
      }
    ])
  })

  it('parses Claude Desktop json', () => {
    const servers = parseJiaorongMcpCreateJson({
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        }
      }
    })
    expect(servers).toEqual([
      {
        name: 'filesystem',
        config: expect.objectContaining({
          command: 'npx',
          type: 'stdio',
          args: ['-y', '@modelcontextprotocol/server-filesystem']
        })
      }
    ])
  })

  it('hides restricted mcp from other agents', () => {
    const config = { visibleToAgentIds: ['deepchat-app1'] }
    expect(isMcpServerVisibleToAgent(config, 'deepchat-app1')).toBe(true)
    expect(isMcpServerVisibleToAgent(config, 'deepchat-other')).toBe(false)
    expect(isMcpServerVisibleToAgent(config, undefined)).toBe(false)
    expect(isMcpServerVisibleToAgent({}, 'deepchat-other')).toBe(true)
  })

  it('creates an enabled mcp bound to the app agent', async () => {
    const addMcpServer = vi.fn().mockResolvedValue({ status: 'added' })
    const setMcpServerEnabled = vi.fn().mockResolvedValue(undefined)
    const updateDeepChatAgent = vi.fn().mockResolvedValue(agentRecord)
    const result = await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent,
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue(agentRecord),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn().mockResolvedValue({}),
          addMcpServer,
          updateMcpServer: vi.fn(),
          setMcpServerEnabled,
          isServerRunning: vi.fn().mockResolvedValue(true)
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat-app1',
        json: {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', 'mcp-server'] }
          }
        }
      },
      1
    )

    expect(result).toEqual({
      servers: [{ name: 'filesystem', enabled: true, started: true }]
    })
    expect(addMcpServer).toHaveBeenCalledWith(
      'filesystem',
      expect.objectContaining({
        enabled: true,
        visibleToAgentIds: ['deepchat-app1'],
        source: 'jiaorong-app',
        sourceId: 'demo-workbench'
      })
    )
    expect(setMcpServerEnabled).toHaveBeenCalledWith('filesystem', true)
    expect(updateDeepChatAgent).not.toHaveBeenCalled()
  })

  it('appends the server onto an existing agent MCP allowlist', async () => {
    const updateDeepChatAgent = vi.fn().mockResolvedValue(agentRecord)
    await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent,
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue({
            ...agentRecord,
            config: { ...agentRecord.config, enabledMcpServerIds: ['filesystem'] }
          }),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn().mockResolvedValue({}),
          addMcpServer: vi.fn().mockResolvedValue({ status: 'added' }),
          updateMcpServer: vi.fn(),
          setMcpServerEnabled: vi.fn().mockResolvedValue(undefined),
          isServerRunning: vi.fn().mockResolvedValue(true)
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat-app1',
        json: { name: 'cowork', type: 'http', url: 'https://example.com/mcp' }
      },
      1
    )
    expect(updateDeepChatAgent).toHaveBeenCalledWith('deepchat-app1', {
      config: { enabledMcpServerIds: ['filesystem', 'cowork'] }
    })
  })

  it('can leave the mcp disabled', async () => {
    const addMcpServer = vi.fn().mockResolvedValue({ status: 'added' })
    const setMcpServerEnabled = vi.fn()
    const result = await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue(agentRecord),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn().mockResolvedValue({}),
          addMcpServer,
          updateMcpServer: vi.fn(),
          setMcpServerEnabled,
          isServerRunning: vi.fn().mockResolvedValue(true)
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat-app1',
        enabled: false,
        json: { name: 'remote', type: 'http', url: 'https://example.com/mcp' }
      },
      1
    )

    expect(result).toEqual({
      servers: [{ name: 'remote', enabled: false, started: false }]
    })
    expect(setMcpServerEnabled).not.toHaveBeenCalled()
  })

  it('rejects mcp for agents that do not belong to the app', async () => {
    const result = await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn(),
          addMcpServer: vi.fn(),
          updateMcpServer: vi.fn(),
          setMcpServerEnabled: vi.fn(),
          isServerRunning: vi.fn()
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat',
        json: { mcpServers: { filesystem: { command: 'npx' } } }
      },
      1
    )
    expect(result).toEqual({ code: 'FORBIDDEN', message: '智能体不属于本应用' })
  })

  it('updates an existing app-owned mcp instead of rejecting the name', async () => {
    const addMcpServer = vi.fn()
    const updateMcpServer = vi.fn().mockResolvedValue(undefined)
    const setMcpServerEnabled = vi.fn().mockResolvedValue(undefined)
    const result = await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue(agentRecord),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn().mockResolvedValue({
            cowork: {
              command: '',
              args: [],
              env: {},
              descriptions: '',
              icons: '',
              enabled: true,
              type: 'http',
              baseUrl: 'http://example.com/mcp',
              source: 'jiaorong-app',
              sourceId: 'demo-workbench'
            }
          }),
          addMcpServer,
          updateMcpServer,
          setMcpServerEnabled,
          isServerRunning: vi.fn().mockResolvedValue(true)
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat-app1',
        json: {
          mcpServers: {
            cowork: {
              url: 'http://106.63.7.106:10001/api/ai-mcp/cowork',
              transport: 'streamable-http',
              headers: { Authorization: 'token-1' }
            }
          }
        }
      },
      1
    )

    expect(result).toEqual({
      servers: [{ name: 'cowork', enabled: true, started: true }]
    })
    expect(addMcpServer).not.toHaveBeenCalled()
    expect(updateMcpServer).toHaveBeenCalledWith(
      'cowork',
      expect.objectContaining({
        type: 'http',
        baseUrl: 'http://106.63.7.106:10001/api/ai-mcp/cowork',
        customHeaders: { Authorization: 'token-1' }
      })
    )
  })

  it('reports started false when enable succeeds but the process is not running', async () => {
    const result = await handleAppBridgeInvoke(
      deps({
        dialogue: {
          createDeepChatAgent: vi.fn(),
          updateDeepChatAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn().mockResolvedValue(agentRecord),
          createSession: vi.fn(),
          getSession: vi.fn(),
          listLightweight: vi.fn(),
          listMessagesPage: vi.fn(),
          getMessage: vi.fn(),
          renameSession: vi.fn(),
          deleteSession: vi.fn(),
          searchHistory: vi.fn(),
          sendMessage: vi.fn(),
          retryMessage: vi.fn(),
          deleteMessage: vi.fn(),
          editUserMessage: vi.fn(),
          forkSession: vi.fn(),
          steerActiveTurn: vi.fn(),
          cancelGeneration: vi.fn(),
          updateOrchestrationPolicy: vi.fn(),
          respondToolInteraction: vi.fn()
        },
        mcp: {
          getMcpServers: vi.fn().mockResolvedValue({}),
          addMcpServer: vi.fn().mockResolvedValue({ status: 'added' }),
          updateMcpServer: vi.fn(),
          setMcpServerEnabled: vi.fn().mockResolvedValue(undefined),
          isServerRunning: vi.fn().mockResolvedValue(false)
        }
      }),
      runtime,
      'mcp.create',
      {
        appId: 'demo-workbench',
        agentId: 'deepchat-app1',
        json: { name: 'remote', type: 'http', url: 'https://example.com/mcp' }
      },
      1
    )
    expect(result).toEqual({
      servers: [{ name: 'remote', enabled: true, started: false }]
    })
  })
})
