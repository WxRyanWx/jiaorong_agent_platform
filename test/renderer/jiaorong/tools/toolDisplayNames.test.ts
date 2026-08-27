import { describe, expect, it } from 'vitest'
import {
  JIAORONG_KB_MCP_QUERY_TOOL,
  JIAORONG_KB_MCP_RETRIEVE_TOOL
} from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'
import {
  resolveStaticToolDescription,
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
    expect(STATIC_TOOL_DISPLAY_NAMES[JIAORONG_KB_MCP_QUERY_TOOL]).toBe('知识库查询')
    expect(resolveStaticToolDisplayName('knowledge_base_query')).toBe('知识库查询')
    expect(resolveStaticToolDisplayName('jiaorong-knowledge-base_knowledge_base_query')).toBe(
      '知识库查询'
    )
    expect(resolveStaticToolDescription('knowledge_base_query')).toBe('查询当前用户有哪些知识库')
    expect(resolveStaticToolDescription('jiaorong-knowledge-base_knowledge_base_query')).toBe(
      '查询当前用户有哪些知识库'
    )
    expect(resolveStaticToolDescription('knowledge_base_retrieve')).toBeUndefined()
    expect(resolveStaticToolDisplayName('calendar')).toBe('日历')
    expect(resolveStaticToolDisplayName('search_conversations')).toBe('搜索对话')
    expect(resolveStaticToolDisplayName('search_messages')).toBe('搜索消息')
    expect(resolveStaticToolDisplayName('get_conversation_history')).toBe('获取对话历史')
    expect(resolveStaticToolDisplayName('get_conversation_stats')).toBe('对话统计')
    expect(resolveStaticToolDisplayName('unknown_tool')).toBeUndefined()
  })
})
