import { describe, expect, it, vi } from 'vitest'

type AgentChangedListener = (payload: {
  enabled: boolean
  agents: Array<{ id: string; name: string }>
  agentIds?: string[]
  version: number
}) => void

const createAgent = (
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  id,
  name: id,
  type: id === 'deepchat' ? 'deepchat' : 'acp',
  agentType: id === 'deepchat' ? 'deepchat' : 'acp',
  enabled: true,
  ...overrides
})

const flushMicrotasks = async (times: number = 6) => {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve()
  }
}

const setupStore = async (options?: {
  initialAgents?: Record<string, unknown>[]
  listAgentsResult?: Record<string, unknown>[]
}) => {
  vi.resetModules()

  const agentChangedListeners: AgentChangedListener[] = []
  const sessionClient = {
    getAgents: vi.fn(async () => options?.initialAgents ?? [])
  }
  const configClient = {
    listAgents: vi.fn(async () => options?.listAgentsResult ?? []),
    onAgentsChanged: vi.fn((listener: AgentChangedListener) => {
      agentChangedListeners.push(listener)
      return () => undefined
    })
  }

  vi.doMock('pinia', async () => {
    const actual = await vi.importActual<typeof import('pinia')>('pinia')
    return {
      ...actual,
      defineStore: (_id: string, setup: () => unknown) => setup
    }
  })

  vi.doMock('../../../src/renderer/api/ConfigClient', () => ({
    createConfigClient: vi.fn(() => configClient)
  }))

  vi.doMock('../../../src/renderer/api/SessionClient', () => ({
    createSessionClient: vi.fn(() => sessionClient)
  }))

  const { useAgentStore } = await import('@/stores/ui/agent')
  const store = useAgentStore()

  const emitAgentsChanged = (payload: Parameters<AgentChangedListener>[0]) => {
    for (const listener of agentChangedListeners) {
      listener(payload)
    }
  }

  return {
    store,
    sessionClient,
    configClient,
    emitAgentsChanged
  }
}

describe('agent store incremental refresh', () => {
  it('refreshes only scoped ACP agents when agentIds are provided', async () => {
    const { store, sessionClient, configClient, emitAgentsChanged } = await setupStore({
      initialAgents: [
        createAgent('deepchat', { name: 'JiaorongAI' }),
        createAgent('acp-1', {
          name: 'ACP Agent One',
          description: 'before'
        })
      ],
      listAgentsResult: [
        createAgent('acp-1', {
          name: 'ACP Agent One+',
          description: 'after'
        })
      ]
    })

    await store.fetchAgents()

    emitAgentsChanged({
      enabled: true,
      agents: [{ id: 'acp-1', name: 'ACP Agent One+' }],
      agentIds: ['acp-1'],
      version: 1
    })
    await flushMicrotasks()

    expect(sessionClient.getAgents).toHaveBeenCalledTimes(1)
    expect(configClient.listAgents).toHaveBeenCalledWith({
      agentType: 'acp',
      ids: ['acp-1']
    })
    expect(store.agents.value.map((agent) => [agent.id, agent.name])).toEqual([
      ['deepchat', 'JiaorongAI'],
      ['acp-1', 'ACP Agent One+']
    ])
  })

  it('removes deleted ACP agents without refetching the full agent list', async () => {
    const { store, sessionClient, configClient, emitAgentsChanged } = await setupStore({
      initialAgents: [
        createAgent('deepchat', { name: 'JiaorongAI' }),
        createAgent('acp-1', { name: 'ACP Agent One' }),
        createAgent('acp-2', { name: 'ACP Agent Two' })
      ],
      listAgentsResult: []
    })

    await store.fetchAgents()

    emitAgentsChanged({
      enabled: true,
      agents: [{ id: 'acp-1', name: 'ACP Agent One' }],
      agentIds: ['acp-2'],
      version: 2
    })
    await flushMicrotasks()

    expect(sessionClient.getAgents).toHaveBeenCalledTimes(1)
    expect(configClient.listAgents).toHaveBeenCalledWith({
      agentType: 'acp',
      ids: ['acp-2']
    })
    expect(store.agents.value.map((agent) => agent.id)).toEqual(['deepchat', 'acp-1'])
  })

  it('falls back to a full refresh when the change is not scoped', async () => {
    const { store, sessionClient, emitAgentsChanged } = await setupStore({
      initialAgents: [createAgent('deepchat', { name: 'JiaorongAI' })]
    })

    await store.fetchAgents()

    emitAgentsChanged({
      enabled: false,
      agents: [],
      version: 3
    })
    await flushMicrotasks()

    expect(sessionClient.getAgents).toHaveBeenCalledTimes(2)
  })
})

describe('agent store fixed iframe navigation', () => {
  it('appends xkaitoken to resolved iframe urls', async () => {
    vi.resetModules()
    vi.doMock('pinia', async () => {
      const actual = await vi.importActual<typeof import('pinia')>('pinia')
      return {
        ...actual,
        defineStore: (_id: string, setup: () => unknown) => setup
      }
    })
    vi.doMock('@/lib/auth/local-user', () => ({
      getToken: vi.fn(() => 'stored-jwt')
    }))
    vi.doMock('../../../src/renderer/api/ConfigClient', () => ({
      createConfigClient: vi.fn(() => ({
        listAgents: vi.fn(async () => []),
        onAgentsChanged: vi.fn(() => () => undefined)
      }))
    }))
    vi.doMock('../../../src/renderer/api/SessionClient', () => ({
      createSessionClient: vi.fn(() => ({
        getAgents: vi.fn(async () => [])
      }))
    }))

    const { useAgentStore } = await import('@/stores/ui/agent')
    const store = useAgentStore()

    expect(store.resolveFixedIframeUrl('ppt-agent')).toBe('https://www.baidu.com/?token=stored-jwt')
  })

  it('uses iframe url override when opening a fixed iframe session', async () => {
    vi.resetModules()
    vi.doMock('pinia', async () => {
      const actual = await vi.importActual<typeof import('pinia')>('pinia')
      return {
        ...actual,
        defineStore: (_id: string, setup: () => unknown) => setup
      }
    })
    vi.doMock('@/lib/auth/local-user', () => ({
      getToken: vi.fn(() => 'stored-jwt')
    }))
    vi.doMock('../../../src/renderer/api/ConfigClient', () => ({
      createConfigClient: vi.fn(() => ({
        listAgents: vi.fn(async () => []),
        onAgentsChanged: vi.fn(() => () => undefined)
      }))
    }))
    vi.doMock('../../../src/renderer/api/SessionClient', () => ({
      createSessionClient: vi.fn(() => ({
        getAgents: vi.fn(async () => [])
      }))
    }))

    const { useAgentStore } = await import('@/stores/ui/agent')
    const store = useAgentStore()

    store.openFixedIframeFromSession('headlines-agent', 'session-99', {
      iframeUrl: 'https://c4ai.ccccltd.cn/learnai/ttchat/agent-1/session-99?developer=2',
      queryParams: { source: 'deepchat' }
    })

    expect(store.selectedAgentId.value).toBe('headlines-agent')
    expect(store.resolveFixedIframeUrl('headlines-agent')).toBe(
      'https://c4ai.ccccltd.cn/learnai/ttchat/agent-1/session-99?developer=2&source=deepchat&id=session-99&token=stored-jwt'
    )

    store.resetFixedIframeNavigation('headlines-agent')
    expect(store.resolveFixedIframeUrl('headlines-agent')).toBe(
      'https://c4ai.ccccltd.cn/learnai/index?token=stored-jwt'
    )
  })
})
