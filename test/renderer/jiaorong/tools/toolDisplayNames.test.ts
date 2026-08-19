import { describe, expect, it } from 'vitest'
import { JIAORONG_KB_MCP_RETRIEVE_TOOL } from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'
import {
  resolveStaticToolDisplayName,
  STATIC_TOOL_DISPLAY_NAMES
} from '@jiaorong/tools/toolDisplayNames'

describe('toolDisplayNames', () => {
  it('maps the knowledge base retrieve tool and Apple fallbacks', () => {
    expect(STATIC_TOOL_DISPLAY_NAMES[JIAORONG_KB_MCP_RETRIEVE_TOOL]).toBe('知识库检索')
    expect(resolveStaticToolDisplayName('knowledge_base_retrieve')).toBe('知识库检索')
    expect(resolveStaticToolDisplayName('jiaorong-knowledge-base_knowledge_base_retrieve')).toBe(
      '知识库检索'
    )
    expect(resolveStaticToolDisplayName('calendar')).toBe('日历')
    expect(resolveStaticToolDisplayName('unknown_tool')).toBeUndefined()
  })
})
