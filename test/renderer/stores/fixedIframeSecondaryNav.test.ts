import { describe, expect, it, vi } from 'vitest'

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return { ...actual, defineStore: (_id: string, setup: () => unknown) => setup }
})

vi.mock('@/lib/auth/local-user', () => ({
  getToken: vi.fn(() => 'token')
}))

vi.mock('../../../src/renderer/api/ConfigClient', () => ({
  createConfigClient: vi.fn(() => ({
    listAgents: vi.fn(async () => []),
    onAgentsChanged: vi.fn(() => () => undefined)
  }))
}))

vi.mock('../../../src/renderer/api/SessionClient', () => ({
  createSessionClient: vi.fn(() => ({
    getAgents: vi.fn(async () => [])
  }))
}))

describe('fixed iframe secondary nav', () => {
  it('reloads iframe home when clicking a secondary nav item', async () => {
    vi.resetModules()
    const { useAgentStore } = await import('@/stores/ui/agent')
    const store = useAgentStore()

    store.setSelectedAgent('intelligence-center')
    store.setFixedIframeSecondaryNav('intelligence-center', 'agent-square')
    expect(store.getFixedIframeReloadNonce('intelligence-center')).toBe(1)

    store.setFixedIframeSecondaryNav('intelligence-center', 'agent-square')
    expect(store.getFixedIframeReloadNonce('intelligence-center')).toBe(2)

    store.setFixedIframeSecondaryNav('intelligence-center', 'knowledge-base')
    expect(store.getFixedIframeSecondaryNavId('intelligence-center')).toBe('knowledge-base')
    expect(store.getFixedIframeReloadNonce('intelligence-center')).toBe(3)
  })
})
