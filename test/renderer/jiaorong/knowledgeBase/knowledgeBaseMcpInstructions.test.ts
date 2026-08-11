import { describe, expect, it } from 'vitest'
import {
  JIAORONG_KB_MCP_SERVER_DESCRIPTION,
  buildKnowledgeBaseSelectedToolInstruction
} from '@jiaorong/knowledgeBase/mcp/knowledgeBaseMcpInstructions'

describe('knowledgeBaseMcpInstructions', () => {
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
