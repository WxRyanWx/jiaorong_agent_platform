import { describe, expect, it } from 'vitest'
import { resolveKnowledgeBaseMcpUrl } from '@jiaorong/api/knowledgeBase/mcpConfig'

describe('resolveKnowledgeBaseMcpUrl', () => {
  it('uses auth api origin + /api/knowledge-base/mcp', () => {
    const url = resolveKnowledgeBaseMcpUrl()
    expect(url.endsWith('/api/knowledge-base/mcp')).toBe(true)
    expect(url.startsWith('http')).toBe(true)
  })
})
