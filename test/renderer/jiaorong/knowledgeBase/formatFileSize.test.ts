import { describe, expect, it } from 'vitest'
import { formatKnowledgeFileSize } from '../../../../src/jiaorong_src/knowledgeBase/picker/formatFileSize'
import { knowledgeBaseSelectionKey } from '../../../../src/jiaorong_src/knowledgeBase/picker/types'

describe('formatKnowledgeFileSize', () => {
  it('returns dash for empty size', () => {
    expect(formatKnowledgeFileSize(null)).toBe('-')
    expect(formatKnowledgeFileSize(undefined)).toBe('-')
  })

  it('formats bytes/kb/mb', () => {
    expect(formatKnowledgeFileSize(512)).toBe('512 B')
    expect(formatKnowledgeFileSize(2048)).toBe('2 KB')
    expect(formatKnowledgeFileSize(1823546)).toBe('1.7 MB')
  })
})

describe('knowledgeBaseSelectionKey', () => {
  it('builds stable keys by kind and namespaces folder/file by knowledge base', () => {
    expect(knowledgeBaseSelectionKey('knowledgeBase', '1')).toBe('knowledgeBase:1')
    expect(knowledgeBaseSelectionKey('folder', '2')).toBe('folder:2')
    expect(knowledgeBaseSelectionKey('folder', '2', 'kb-a')).toBe('folder:kb-a:2')
    expect(knowledgeBaseSelectionKey('file', '3', 'kb-b')).toBe('file:kb-b:3')
  })
})
