import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MCPServerConfig } from '@shared/types/mcp'

const setMcpServerEnabledMutate = vi.hoisted(() => vi.fn())
const addMcpServerMutate = vi.hoisted(() => vi.fn())
const removeMcpServerMutate = vi.hoisted(() => vi.fn())
const updateMcpServerMutate = vi.hoisted(() => vi.fn())
const configRefetch = vi.hoisted(() => vi.fn())
const marketConnectors = vi.hoisted(() => ({ items: [] as Array<Record<string, unknown>> }))
const marketConnectorsError = vi.hoisted(() => ({ current: null as Error | null }))
/** 非空时市场请求会先等这个 promise，用于验证 init 不被开放平台请求阻塞。 */
const marketConnectorsGate = vi.hoisted(() => ({ current: null as Promise<unknown> | null }))
const mountedCallbacks = vi.hoisted(() => [] as Array<() => Promise<void>>)
const notifyRendererMock = vi.hoisted(() => vi.fn())

const mcpClientMock = vi.hoisted(() => ({
  getMcpServers: vi.fn().mockResolvedValue({}),
  getMcpEnabled: vi.fn().mockResolvedValue(true),
  getAllPrompts: vi.fn().mockResolvedValue([]),
  startServer: vi.fn().mockResolvedValue(undefined),
  stopServer: vi.fn().mockResolvedValue(undefined),
  isServerRunning: vi.fn().mockResolvedValue(false),
  getServerDiagnostics: vi.fn().mockResolvedValue({
    lifecycleStatus: 'stopped',
    connectionState: 'stopped'
  }),
  getServerAuthStatus: vi.fn().mockResolvedValue({
    serverName: 'demo',
    state: 'none',
    authenticated: false
  }),
  getAllToolDefinitions: vi.fn().mockResolvedValue([]),
  getMcpClients: vi.fn().mockResolvedValue([]),
  getAllResources: vi.fn().mockResolvedValue([]),
  onServerStarted: vi.fn(() => vi.fn()),
  onServerStopped: vi.fn(() => vi.fn()),
  onConfigChanged: vi.fn(() => vi.fn()),
  onServerStatusChanged: vi.fn(() => vi.fn()),
  onServerAuthChanged: vi.fn(() => vi.fn()),
  onToolCallResult: vi.fn(() => vi.fn())
}))

const configServiceMock = vi.hoisted(() => ({
  getCustomPrompts: vi.fn().mockResolvedValue([]),
  getSetting: vi.fn().mockResolvedValue([]),
  setSetting: vi.fn().mockResolvedValue(undefined),
  onCustomPromptsChanged: vi.fn(() => vi.fn())
}))

const createQueryState = () => ({
  data: { value: undefined },
  error: { value: null },
  isLoading: { value: false },
  isFetching: { value: false },
  isRefreshing: { value: false },
  refresh: vi.fn(async () => ({ status: 'success', data: undefined })),
  refetch: vi.fn(async () => ({ status: 'success', data: undefined }))
})

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onMounted: vi.fn((callback: () => Promise<void>) => {
      mountedCallbacks.push(callback)
    })
  }
})

vi.mock('@api/McpClient', () => ({
  createMcpClient: vi.fn(() => mcpClientMock)
}))

vi.mock('../../../src/renderer/api/ConfigClient', () => ({
  createConfigClient: vi.fn(() => configServiceMock)
}))

vi.mock('@/composables/useIpcMutation', () => ({
  useIpcMutation: (options: { mutation?: (...args: any[]) => unknown }) => {
    const source = options.mutation?.toString() ?? ''
    const mutateAsync = source.includes('setMcpServerEnabled')
      ? setMcpServerEnabledMutate
      : source.includes('addMcpServer')
        ? addMcpServerMutate
        : source.includes('removeMcpServer')
          ? removeMcpServerMutate
          : source.includes('updateMcpServer')
            ? updateMcpServerMutate
            : vi.fn().mockResolvedValue(undefined)
    return { mutateAsync }
  }
}))

vi.mock('@/composables/useIpcQuery', () => ({
  useIpcQuery: () => createQueryState()
}))

vi.mock('@pinia/colada', () => ({
  useQuery: () => ({
    ...createQueryState(),
    refetch: configRefetch
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('@renderer-notifications/rendererNotificationPort', () => ({
  notifyRenderer: notifyRendererMock
}))

vi.mock('@jiaorong/plugins/market/openPlatformMarket', async () => {
  const actual = await vi.importActual<
    typeof import('@jiaorong/plugins/market/openPlatformMarket')
  >('@jiaorong/plugins/market/openPlatformMarket')
  return {
    ...actual,
    listOpenPlatformMarketConnectors: vi.fn(async () => {
      if (marketConnectorsError.current) throw marketConnectorsError.current
      if (marketConnectorsGate.current) await marketConnectorsGate.current
      return marketConnectors.items
    })
  }
})

const createServer = (overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
  command: '',
  args: [],
  env: {},
  descriptions: '',
  icons: '',
  enabled: true,
  type: 'http',
  ...overrides
})

const createMarketConnector = (overrides: Record<string, unknown> = {}) => ({
  name: 'jina-public-mcp',
  provider: '信科集团',
  command: '',
  args: [],
  env: {},
  descriptions: 'Jina 公共连接器',
  icons: '',
  enabled: false,
  baseUrl: 'https://mcp.jina.ai/mcp',
  type: 'http',
  source: 'open-platform',
  sourceId: 'jina-public-mcp',
  isRunning: false,
  lifecycleStatus: 'stopped',
  errorMessage: undefined,
  authStatus: undefined,
  isLoading: false,
  ...overrides
})

const setupStore = async () => {
  vi.resetModules()
  vi.doUnmock('pinia')
  const { createPinia, setActivePinia } = await vi.importActual<typeof import('pinia')>('pinia')
  setActivePinia(createPinia())
  const { useMcpStore } = await import('@/stores/mcp')
  return useMcpStore()
}

const loadMarket = async (store: Awaited<ReturnType<typeof setupStore>>) => {
  await store.loadOpenPlatformConnectors()
}

describe('open platform connector store merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mountedCallbacks.length = 0
    marketConnectors.items = []
    marketConnectorsError.current = null
    notifyRendererMock.mockReset()
    setMcpServerEnabledMutate.mockReset()
    addMcpServerMutate.mockReset()
    removeMcpServerMutate.mockReset()
    configRefetch.mockReset()
    configRefetch.mockResolvedValue({ status: 'success', data: undefined })
    mcpClientMock.getServerDiagnostics.mockReset()
    mcpClientMock.getServerDiagnostics.mockResolvedValue({
      lifecycleStatus: 'stopped',
      connectionState: 'stopped'
    })
  })

  it('keeps the market card while the connector is not installed', async () => {
    const store = await setupStore()
    marketConnectors.items = [createMarketConnector()]

    await loadMarket(store)

    expect(store.serverList).toHaveLength(1)
    expect(store.serverList[0]).toMatchObject({
      name: 'jina-public-mcp',
      source: 'open-platform',
      enabled: false
    })
  })

  it('hides the market card when a manually added server already uses the same name', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }) },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector()]

    await loadMarket(store)

    expect(store.serverList).toHaveLength(1)
    expect(store.serverList[0].baseUrl).toBe('https://manual.example/mcp')
  })

  it('hides the market card after the connector was installed under a suffixed name', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: {
        'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }),
        'jina-public-mcp-2': createServer({
          baseUrl: 'https://mcp.jina.ai/mcp',
          source: 'open-platform',
          sourceId: 'jina-public-mcp'
        })
      },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector()]

    await loadMarket(store)

    expect(store.serverList.map((server) => server.name)).toEqual([
      'jina-public-mcp',
      'jina-public-mcp-2'
    ])
  })

  it('installs and starts a connector through the existing toggle path', async () => {
    const store = await setupStore()
    store.config = { mcpServers: {}, mcpEnabled: true, ready: true }
    marketConnectors.items = [createMarketConnector()]
    addMcpServerMutate.mockResolvedValue({ status: 'added' })
    setMcpServerEnabledMutate.mockResolvedValue(undefined)

    await loadMarket(store)
    const result = await store.installOpenPlatformConnector(
      store.serverList[0] as MCPServerConfig & { name: string }
    )

    expect(result).toMatchObject({ status: 'started', serverName: 'jina-public-mcp' })
    expect(addMcpServerMutate).toHaveBeenCalledWith([
      'jina-public-mcp',
      expect.objectContaining({
        baseUrl: 'https://mcp.jina.ai/mcp',
        type: 'http',
        enabled: false,
        source: 'open-platform',
        sourceId: 'jina-public-mcp'
      })
    ])
    expect(setMcpServerEnabledMutate).toHaveBeenCalledWith(['jina-public-mcp', true])
  })

  it('appends a suffix when the connector id collides with a local server', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }) },
      mcpEnabled: true,
      ready: true
    }
    addMcpServerMutate.mockResolvedValue({ status: 'added' })
    setMcpServerEnabledMutate.mockResolvedValue(undefined)

    const result = await store.installOpenPlatformConnector(
      createMarketConnector() as unknown as MCPServerConfig & { name: string }
    )

    expect(result.serverName).toBe('jina-public-mcp-2')
    expect(addMcpServerMutate).toHaveBeenCalledWith([
      'jina-public-mcp-2',
      expect.objectContaining({ sourceId: 'jina-public-mcp' })
    ])
  })

  it('reports unsupported and skips ipc when the connector has no runnable config', async () => {
    const store = await setupStore()
    store.config = { mcpServers: {}, mcpEnabled: true, ready: true }

    const result = await store.installOpenPlatformConnector(
      createMarketConnector({ baseUrl: '', command: '' }) as unknown as MCPServerConfig & {
        name: string
      }
    )

    expect(result.status).toBe('unsupported')
    expect(addMcpServerMutate).not.toHaveBeenCalled()
    expect(setMcpServerEnabledMutate).not.toHaveBeenCalled()
  })

  it('enables the existing same-name server when it is disabled', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }) },
      mcpEnabled: true,
      ready: true
    }
    addMcpServerMutate.mockResolvedValue({ status: 'duplicate' })
    setMcpServerEnabledMutate.mockResolvedValue(undefined)
    // 主进程拒绝写入（同名已存在）后以刷新结果为准：刷新里多了带后缀的落地配置。
    configRefetch.mockImplementation(async () => {
      store.config = {
        mcpServers: {
          'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }),
          'jina-public-mcp-2': createServer({
            baseUrl: 'https://mcp.jina.ai/mcp',
            enabled: false,
            source: 'open-platform',
            sourceId: 'jina-public-mcp'
          })
        },
        mcpEnabled: true,
        ready: true
      }
      return { status: 'success', data: undefined }
    })

    const result = await store.installOpenPlatformConnector(
      createMarketConnector() as unknown as MCPServerConfig & { name: string }
    )

    expect(result.status).toBe('started')
    expect(setMcpServerEnabledMutate).toHaveBeenCalledWith(['jina-public-mcp-2', true])
  })

  it('keeps an already enabled same-name server untouched on duplicate', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }) },
      mcpEnabled: true,
      ready: true
    }
    addMcpServerMutate.mockResolvedValue({ status: 'duplicate' })
    configRefetch.mockImplementation(async () => {
      store.config = {
        mcpServers: {
          'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }),
          'jina-public-mcp-2': createServer({
            baseUrl: 'https://mcp.jina.ai/mcp',
            enabled: true,
            source: 'open-platform',
            sourceId: 'jina-public-mcp'
          })
        },
        mcpEnabled: true,
        ready: true
      }
      return { status: 'success', data: undefined }
    })

    const result = await store.installOpenPlatformConnector(
      createMarketConnector() as unknown as MCPServerConfig & { name: string }
    )

    expect(result.status).toBe('started')
    expect(setMcpServerEnabledMutate).not.toHaveBeenCalled()
  })

  it('does not touch a manually added same-name server on duplicate', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }) },
      mcpEnabled: true,
      ready: true
    }
    addMcpServerMutate.mockResolvedValue({ status: 'duplicate' })
    // 刷新后同名配置仍是用户手动添加的那份（没有 open-platform 来源标记）
    configRefetch.mockImplementation(async () => {
      store.config = {
        mcpServers: {
          'jina-public-mcp-2': createServer({ baseUrl: 'https://manual.example/mcp' })
        },
        mcpEnabled: true,
        ready: true
      }
      return { status: 'success', data: undefined }
    })

    const result = await store.installOpenPlatformConnector(
      createMarketConnector() as unknown as MCPServerConfig & { name: string }
    )

    expect(result.status).toBe('failed')
    expect(setMcpServerEnabledMutate).not.toHaveBeenCalled()
  })

  it('reuses one install task when the connector switch is clicked twice', async () => {
    const store = await setupStore()
    store.config = { mcpServers: {}, mcpEnabled: true, ready: true }
    addMcpServerMutate.mockResolvedValue({ status: 'added' })
    setMcpServerEnabledMutate.mockResolvedValue(undefined)

    const connector = createMarketConnector() as unknown as MCPServerConfig & { name: string }
    const [firstResult, secondResult] = await Promise.all([
      store.installOpenPlatformConnector(connector),
      store.installOpenPlatformConnector(connector)
    ])

    expect(addMcpServerMutate).toHaveBeenCalledTimes(1)
    expect(addMcpServerMutate).toHaveBeenCalledWith(['jina-public-mcp', expect.any(Object)])
    expect(secondResult).toEqual(firstResult)
  })
})

describe('open platform connector revoke sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mountedCallbacks.length = 0
    marketConnectors.items = []
    marketConnectorsError.current = null
    notifyRendererMock.mockReset()
    setMcpServerEnabledMutate.mockReset()
    addMcpServerMutate.mockReset()
    removeMcpServerMutate.mockReset()
    removeMcpServerMutate.mockResolvedValue(undefined)
    configRefetch.mockReset()
    configRefetch.mockResolvedValue({ status: 'success', data: undefined })
    mcpClientMock.getServerDiagnostics.mockReset()
    mcpClientMock.getServerDiagnostics.mockResolvedValue({
      lifecycleStatus: 'stopped',
      connectionState: 'stopped'
    })
  })

  const installConnector = (serverName = 'jina-public-mcp', sourceId = 'jina-public-mcp') =>
    createServer({
      baseUrl: 'https://mcp.jina.ai/mcp',
      source: 'open-platform',
      sourceId
    })

  it('removes the local server once the connector is delisted', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    // 市场仍有其他在架连接器，说明这是一次可信的成功拉取，jina 属于真正下架。
    marketConnectors.items = [createMarketConnector({ name: 'other', sourceId: 'other-connector' })]

    await loadMarket(store)

    expect(removeMcpServerMutate).toHaveBeenCalledWith(['jina-public-mcp'])
    expect(store.config.mcpServers).toEqual({})
    expect(notifyRendererMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'settings.mcp.openPlatformConnectorRevoked' })
    )
  })

  it('keeps a manually added server that shares the connector name', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: {
        'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' })
      },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ name: 'other', sourceId: 'other-connector' })]

    await loadMarket(store)

    expect(removeMcpServerMutate).not.toHaveBeenCalled()
    expect(Object.keys(store.config.mcpServers)).toEqual(['jina-public-mcp'])
  })

  it('keeps local connectors when the market request fails', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectorsError.current = new Error('network down')

    await loadMarket(store)

    expect(removeMcpServerMutate).not.toHaveBeenCalled()
    expect(Object.keys(store.config.mcpServers)).toEqual(['jina-public-mcp'])
    expect(store.serverList.map((server) => server.name)).toEqual(['jina-public-mcp'])
  })

  it('removes local connectors when the market stays empty after a retry', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = []

    await loadMarket(store)

    expect(removeMcpServerMutate).toHaveBeenCalledWith(['jina-public-mcp'])
    expect(store.config.mcpServers).toEqual({})
  })

  it('keeps the fetched market list when revoke reconciliation fails', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ name: 'other', sourceId: 'other-connector' })]
    removeMcpServerMutate.mockRejectedValue(new Error('ipc down'))

    await loadMarket(store)

    expect(store.serverList.map((server) => server.name)).toEqual(['jina-public-mcp', 'other'])
    expect(notifyRendererMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'settings.mcp.openPlatformConnectorRevoked' })
    )
  })

  it('reconciles once when several callers load the market at the same time', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ sourceId: 'other-connector' })]

    await Promise.all([loadMarket(store), loadMarket(store)])

    expect(removeMcpServerMutate).toHaveBeenCalledTimes(1)
  })

  it('lets a delisted connector be enabled again after it is republished', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installConnector() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ name: 'other', sourceId: 'other-connector' })]

    await loadMarket(store)
    expect(store.config.mcpServers).toEqual({})

    marketConnectors.items = [createMarketConnector()]
    addMcpServerMutate.mockResolvedValue({ status: 'added' })
    setMcpServerEnabledMutate.mockResolvedValue(undefined)

    await loadMarket(store)
    expect(store.serverList.map((server) => server.name)).toEqual(['jina-public-mcp'])

    const result = await store.installOpenPlatformConnector(
      store.serverList[0] as MCPServerConfig & { name: string }
    )

    expect(result).toMatchObject({ status: 'started', serverName: 'jina-public-mcp' })
    expect(setMcpServerEnabledMutate).toHaveBeenCalledWith(['jina-public-mcp', true])
  })
})

describe('open platform connector version update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mountedCallbacks.length = 0
    marketConnectors.items = []
    marketConnectorsError.current = null
    notifyRendererMock.mockReset()
    setMcpServerEnabledMutate.mockReset()
    addMcpServerMutate.mockReset()
    removeMcpServerMutate.mockReset()
    updateMcpServerMutate.mockReset()
    updateMcpServerMutate.mockResolvedValue(undefined)
    configRefetch.mockReset()
    configRefetch.mockResolvedValue({ status: 'success', data: undefined })
    mcpClientMock.getServerDiagnostics.mockReset()
    mcpClientMock.getServerDiagnostics.mockResolvedValue({
      lifecycleStatus: 'stopped',
      connectionState: 'stopped'
    })
  })

  const installedServer = (overrides: Partial<MCPServerConfig> = {}) =>
    createServer({
      baseUrl: 'https://mcp.jina.ai/mcp',
      source: 'open-platform',
      sourceId: 'jina-public-mcp',
      sourceVersion: '1.0.0',
      enabled: true,
      ...overrides
    })

  it('offers and applies an update when the market version is newer', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installedServer() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [
      createMarketConnector({ sourceVersion: '1.1.0', baseUrl: 'https://mcp.jina.ai/v2' })
    ]

    await loadMarket(store)
    expect(Object.keys(store.connectorUpdatesAvailable)).toEqual(['jina-public-mcp'])

    const updated = await store.updateOpenPlatformConnector('jina-public-mcp')

    expect(updated).toBe(true)
    // 更新载荷不带 enabled，主进程合并后保留原开关状态
    expect(updateMcpServerMutate).toHaveBeenCalledWith([
      'jina-public-mcp',
      expect.objectContaining({
        baseUrl: 'https://mcp.jina.ai/v2',
        sourceVersion: '1.1.0',
        source: 'open-platform',
        sourceId: 'jina-public-mcp'
      })
    ])
    const payload = updateMcpServerMutate.mock.calls[0][0][1] as Partial<MCPServerConfig>
    expect(payload.enabled).toBeUndefined()
    expect(store.config.mcpServers['jina-public-mcp']).toMatchObject({
      baseUrl: 'https://mcp.jina.ai/v2',
      sourceVersion: '1.1.0',
      enabled: true
    })
    expect(notifyRendererMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'settings.mcp.openPlatformConnectorUpdated' })
    )
    // 同步后不再判定为可更新
    expect(store.connectorUpdatesAvailable['jina-public-mcp']).toBeUndefined()
  })

  it('does not offer an update when versions match', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: { 'jina-public-mcp': installedServer() },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ sourceVersion: '1.0.0' })]

    await loadMarket(store)

    expect(store.connectorUpdatesAvailable).toEqual({})
    await expect(store.updateOpenPlatformConnector('jina-public-mcp')).resolves.toBe(false)
    expect(updateMcpServerMutate).not.toHaveBeenCalled()
  })

  it('offers an update for legacy installs without a recorded version', async () => {
    const store = await setupStore()
    store.config = {
      mcpServers: {
        'jina-public-mcp': installedServer({ sourceVersion: undefined })
      },
      mcpEnabled: true,
      ready: true
    }
    marketConnectors.items = [createMarketConnector({ sourceVersion: '1.0.0' })]

    await loadMarket(store)

    expect(Object.keys(store.connectorUpdatesAvailable)).toEqual(['jina-public-mcp'])
  })
})

describe('open platform connector init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mountedCallbacks.length = 0
    marketConnectors.items = []
    marketConnectorsError.current = null
    marketConnectorsGate.current = null
    configRefetch.mockReset()
    configRefetch.mockResolvedValue({ status: 'success', data: undefined })
  })

  it('finishes store init while the market request is still hanging', async () => {
    const store = await setupStore()
    let releaseMarket!: () => void
    marketConnectorsGate.current = new Promise<void>((resolve) => {
      releaseMarket = resolve
    })
    marketConnectors.items = [createMarketConnector()]

    // onMounted 被替身收集，这里手动触发一次 init
    await expect(mountedCallbacks[0]()).resolves.toBeUndefined()
    expect(store.serverList).toEqual([])

    releaseMarket()
    await vi.waitFor(() => {
      expect(store.serverList.map((server) => server.name)).toEqual(['jina-public-mcp'])
    })
  })
})
