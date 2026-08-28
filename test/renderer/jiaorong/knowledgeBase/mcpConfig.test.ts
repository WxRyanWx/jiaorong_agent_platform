import { describe, expect, it } from 'vitest'
import { resolveKnowledgeBaseMcpUrl } from '@jiaorong/api/knowledgeBase/mcpConfig'

describe('resolveKnowledgeBaseMcpUrl', () => {
  it('uses auth api origin + /api/ai-mcp/knowledge-base', () => {
    const url = resolveKnowledgeBaseMcpUrl()
    expect(url.endsWith('/api/ai-mcp/knowledge-base')).toBe(true)
    expect(url.startsWith('http')).toBe(true)
  })
})
