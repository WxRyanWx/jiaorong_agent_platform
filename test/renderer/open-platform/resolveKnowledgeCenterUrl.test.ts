import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveKnowledgeCenterUrl', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the test origin in development mode and appends token', async () => {
    vi.stubEnv('MODE', 'development')
    localStorage.setItem('xkaitoken', 'test-token')
    const { resolveKnowledgeCenterUrl } =
      await import('@jiaorong/open-platform/renderer/knowledgeCenter')

    const url = new URL(resolveKnowledgeCenterUrl('build-1'))

    expect(url.origin + url.pathname).toBe('http://106.63.7.106:10001/qa-platform-web/')
    expect(url.searchParams.get('token')).toBe('test-token')
    expect(url.searchParams.get('_t')).toBe('build-1')
  })

  it('uses the test origin in test mode', async () => {
    vi.stubEnv('MODE', 'test')
    localStorage.setItem('xkaitoken', 'test-token')
    const { resolveKnowledgeCenterUrl } =
      await import('@jiaorong/open-platform/renderer/knowledgeCenter')

    expect(new URL(resolveKnowledgeCenterUrl('build-2')).origin).toBe('http://106.63.7.106:10001')
  })

  it('uses the production origin in production mode', async () => {
    vi.stubEnv('MODE', 'production')
    localStorage.setItem('xkaitoken', 'prod-token')
    const { resolveKnowledgeCenterUrl } =
      await import('@jiaorong/open-platform/renderer/knowledgeCenter')

    const url = new URL(resolveKnowledgeCenterUrl('build-3'))

    expect(url.origin + url.pathname).toBe('https://c4ai.ccccltd.cn/qa-platform-web/')
    expect(url.searchParams.get('token')).toBe('prod-token')
  })

  it('returns an empty url without a token', async () => {
    vi.stubEnv('MODE', 'production')
    const { resolveKnowledgeCenterUrl } =
      await import('@jiaorong/open-platform/renderer/knowledgeCenter')

    expect(resolveKnowledgeCenterUrl('build-4')).toBe('')
  })
})
