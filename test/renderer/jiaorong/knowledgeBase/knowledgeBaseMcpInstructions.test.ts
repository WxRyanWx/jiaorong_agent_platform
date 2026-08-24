import { describe, expect, it } from 'vitest'
import {
  JIAORONG_KB_MCP_SERVER_DESCRIPTION,
  buildKnowledgeBaseSelectedToolInstruction
} from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpInstructions'
import {
  JIAORONG_KB_CONTEXT_MIME,
  JIAORONG_KB_CONTEXT_PATH,
  JIAORONG_KB_MCP_SERVER_DISPLAY_NAME,
  JIAORONG_KB_MCP_SERVER_NAME,
  isJiaorongKnowledgeBaseContextAttachment,
  isJiaorongKnowledgeBaseMcpServer,
  resolveMcpServerListName
} from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpConstants'

describe('knowledgeBaseMcpInstructions', () => {
  it('identifies only the knowledge base MCP server for auto-approve', () => {
    expect(isJiaorongKnowledgeBaseMcpServer(JIAORONG_KB_MCP_SERVER_NAME)).toBe(true)
    expect(isJiaorongKnowledgeBaseMcpServer('brave')).toBe(false)
    expect(isJiaorongKnowledgeBaseMcpServer('filesystem')).toBe(false)
    expect(isJiaorongKnowledgeBaseMcpServer(undefined)).toBe(false)
    expect(resolveMcpServerListName(JIAORONG_KB_MCP_SERVER_NAME)).toBe(
      JIAORONG_KB_MCP_SERVER_DISPLAY_NAME
    )
    expect(resolveMcpServerListName('Artifacts')).toBe('Artifacts')
    expect(JIAORONG_KB_MCP_SERVER_DISPLAY_NAME).toBe('交融知识库')
  })

  it('identifies the synthetic knowledge-base context attachment', () => {
    expect(
      isJiaorongKnowledgeBaseContextAttachment({
        path: JIAORONG_KB_CONTEXT_PATH,
        mimeType: JIAORONG_KB_CONTEXT_MIME
      })
    ).toBe(true)
    expect(isJiaorongKnowledgeBaseContextAttachment({ path: '/tmp/notes.txt' })).toBe(false)
    expect(isJiaorongKnowledgeBaseContextAttachment(undefined)).toBe(false)
  })

  it('server description requires retrieve before answering', () => {
    expect(JIAORONG_KB_MCP_SERVER_DESCRIPTION).toContain('knowledge_base_retrieve')
    expect(JIAORONG_KB_MCP_SERVER_DESCRIPTION).toContain('禁止未检索就编造')
  })

  it('selected instruction requires tool call and forbids fabrication', () => {
    const text = buildKnowledgeBaseSelectedToolInstruction({
      msg: '防火墙策略申请都需要填什么',
      selectionNames: ['法规库', '附件.xlsx'],
      mcpSelections: [
        { type: 'KNOWLEDGE_BASE', id: 'kb1' },
        { type: 'FILE', id: '9' }
      ]
    })

    expect(text).toContain('强制工具调用')
    expect(text).toContain('法规库')
    expect(text).toContain('knowledge_base_retrieve')
    expect(text).toContain('禁止编造')
    expect(text).toContain('不要先写答案再补检索')
    expect(text).toContain('"id": "kb1"')
    expect(text).toContain('"type": "FILE"')
  })
})
