import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('resolveKnowledgeBaseUrl', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses test URL in development mode and appends xkaitoken', async () => {
    vi.stubEnv('MODE', 'development')
    localStorage.setItem('xkaitoken', 'test-token-123')
    const { resolveKnowledgeBaseUrl } = await import('@jiaorong/api/knowledgeBase/config')
    expect(resolveKnowledgeBaseUrl()).toBe(
      'http://106.63.7.106:10001/agent/knowledge_base?token=test-token-123'
    )
  })

  it('uses test URL in test mode without token when missing', async () => {
    vi.stubEnv('MODE', 'test')
    const { resolveKnowledgeBaseUrl } = await import('@jiaorong/api/knowledgeBase/config')
    expect(resolveKnowledgeBaseUrl()).toBe('http://106.63.7.106:10001/agent/knowledge_base')
  })

  it('uses production URL in production mode and appends xkaitoken', async () => {
    vi.stubEnv('MODE', 'production')
    localStorage.setItem('xkaitoken', 'prod.jwt.token')
    const { resolveKnowledgeBaseUrl } = await import('@jiaorong/api/knowledgeBase/config')
    expect(resolveKnowledgeBaseUrl()).toBe(
      'https://c4ai.ccccltd.cn/agent/knowledge_base?token=prod.jwt.token'
    )
  })
})
