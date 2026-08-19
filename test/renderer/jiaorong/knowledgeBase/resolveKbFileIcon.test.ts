import { describe, expect, it } from 'vitest'
import { resolveKbFileIconKind } from '../../../../src/jiaorong_src/knowledgeBase/picker/resolveKbFileIcon'

describe('resolveKbFileIconKind', () => {
  it('detects folder and common office types', () => {
    expect(resolveKbFileIconKind('a', { isDirectory: true })).toBe('folder')
    expect(resolveKbFileIconKind('a.pdf')).toBe('pdf')
    expect(resolveKbFileIconKind('a.docx')).toBe('word')
    expect(resolveKbFileIconKind('a.xlsx')).toBe('excel')
    expect(resolveKbFileIconKind('a.pptx')).toBe('ppt')
    expect(resolveKbFileIconKind('a.txt')).toBe('txt')
  })

  it('falls back via extension when name missing', () => {
    expect(resolveKbFileIconKind(undefined, { extension: 'docx' })).toBe('word')
  })
})
