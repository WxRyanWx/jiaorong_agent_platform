import { describe, expect, it } from 'vitest'
import { toKnowledgeBaseMcpSelections } from '@jiaorong/api/knowledgeBase/toMcpSelections'
import type { KnowledgeBaseSelectionItem } from '@jiaorong/knowledgeBase/picker/types'

function item(
  partial: Partial<KnowledgeBaseSelectionItem> &
    Pick<KnowledgeBaseSelectionItem, 'key' | 'kind' | 'id' | 'name'>
): KnowledgeBaseSelectionItem {
  return partial
}

describe('toKnowledgeBaseMcpSelections', () => {
  it('maps kinds and keeps string ids', () => {
    expect(
      toKnowledgeBaseMcpSelections([
        item({
          key: 'knowledgeBase:1',
          kind: 'knowledgeBase',
          id: '2064973681504481281',
          name: '库'
        }),
        item({
          key: 'folder:1:2',
          kind: 'folder',
          id: '2079369343309049858',
          name: '目录'
        }),
        item({
          key: 'file:1:3',
          kind: 'file',
          id: '2079369491225374722',
          name: '文件.docx'
        })
      ])
    ).toEqual([
      { type: 'KNOWLEDGE_BASE', id: '2064973681504481281' },
      { type: 'DIRECTORY', id: '2079369343309049858' },
      { type: 'FILE', id: '2079369491225374722' }
    ])
  })

  it('dedupes same type+id and skips empty id', () => {
    expect(
      toKnowledgeBaseMcpSelections([
        item({ key: 'a', kind: 'file', id: '1', name: 'a' }),
        item({ key: 'b', kind: 'file', id: '1', name: 'b' }),
        item({ key: 'c', kind: 'folder', id: '  ', name: 'empty' })
      ])
    ).toEqual([{ type: 'FILE', id: '1' }])
  })
})
