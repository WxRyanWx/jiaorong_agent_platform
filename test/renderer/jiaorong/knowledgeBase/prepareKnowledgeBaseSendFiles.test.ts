import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageFile } from '@shared/types/agent-interface'
import {
  clearKnowledgeBaseSelectionForSession,
  useKnowledgeBaseSelection
} from '@jiaorong/knowledgeBase/picker/useKnowledgeBaseSelection'
import {
  isJiaorongKnowledgeBaseContextFile,
  prepareKnowledgeBaseSendFiles,
  readJiaorongKnowledgeBaseSelections
} from '@jiaorong/knowledgeBase/picker/prepareKnowledgeBaseSendFiles'

import { ensureJiaorongKnowledgeBaseMcpServer } from '@jiaorong/knowledgeBase/mcp/ensureKnowledgeBaseMcpServer'

vi.mock('@jiaorong/knowledgeBase/mcp/ensureKnowledgeBaseMcpServer', () => ({
  JIAORONG_KB_MCP_SERVER_NAME: 'jiaorong-knowledge-base',
  ensureJiaorongKnowledgeBaseMcpServer: vi.fn(async () => undefined)
}))

describe('prepareKnowledgeBaseSendFiles', () => {
  beforeEach(() => {
    clearKnowledgeBaseSelectionForSession('sess-1')
    clearKnowledgeBaseSelectionForSession(null)
    vi.mocked(ensureJiaorongKnowledgeBaseMcpServer).mockReset()
    vi.mocked(ensureJiaorongKnowledgeBaseMcpServer).mockResolvedValue(undefined)
  })

  it('returns original files when nothing selected', async () => {
    const files: MessageFile[] = [{ name: 'a.txt', path: '/tmp/a.txt' }]
    const result = await prepareKnowledgeBaseSendFiles('sess-1', '你好', files)
    expect(result).toEqual({ ok: true, files })
  })

  it('appends selection hint file without pre-fetching retrieve', async () => {
    const { setItems } = useKnowledgeBaseSelection(() => 'sess-1')
    setItems([
      {
        key: 'knowledgeBase:kb1',
        kind: 'knowledgeBase',
        id: 'kb1',
        name: '法规库',
        icon: 'icon-1'
      }
    ])

    const result = await prepareKnowledgeBaseSendFiles('sess-1', '合同条款', [
      { name: 'note.txt', path: '/tmp/note.txt' }
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files).toHaveLength(2)
    const context = result.files[1]!
    expect(isJiaorongKnowledgeBaseContextFile(context)).toBe(true)
    expect(context.content).toContain('knowledge_base_retrieve')
    expect(context.content).toContain('强制工具调用')
    expect(context.content).toContain('禁止编造')
    expect(context.content).toContain('KNOWLEDGE_BASE')
    expect(context.content).not.toContain('知识库检索结果')
    expect(typeof context.metadata?.jiaorongKnowledgeBase).toBe('string')
    expect(readJiaorongKnowledgeBaseSelections(result.files)).toEqual([
      {
        key: 'knowledgeBase:kb1',
        kind: 'knowledgeBase',
        id: 'kb1',
        name: '法规库',
        icon: 'icon-1',
        extension: null
      }
    ])
  })

  it('fails when selected but message text empty', async () => {
    const { setItems } = useKnowledgeBaseSelection(() => 'sess-1')
    setItems([
      {
        key: 'file:kb:1',
        kind: 'file',
        id: '1',
        name: 'a.docx'
      }
    ])
    const result = await prepareKnowledgeBaseSendFiles('sess-1', '   ', [])
    expect(result.ok).toBe(false)
  })

  it('blocks send when knowledge-base MCP server fails to start', async () => {
    vi.mocked(ensureJiaorongKnowledgeBaseMcpServer).mockRejectedValueOnce(new Error('mcp down'))

    const { setItems } = useKnowledgeBaseSelection(() => 'sess-1')
    setItems([
      {
        key: 'knowledgeBase:kb1',
        kind: 'knowledgeBase',
        id: 'kb1',
        name: '法规库',
        icon: 'icon-1'
      }
    ])

    const result = await prepareKnowledgeBaseSendFiles('sess-1', '合同条款', [])
    expect(result).toEqual({ ok: false, error: '知识库服务未就绪，请稍后重试（mcp down）' })
  })
})
