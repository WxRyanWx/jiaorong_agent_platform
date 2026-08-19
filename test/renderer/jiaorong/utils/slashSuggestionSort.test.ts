import { describe, expect, it } from 'vitest'
import {
  compareSlashSuggestionLabels,
  isCjkLeadingLabel
} from '@jiaorong/utils/slashSuggestionSort'

describe('slashSuggestionSort', () => {
  it('detects CJK leading labels', () => {
    expect(isCjkLeadingLabel('安全隐患整改')).toBe(true)
    expect(isCjkLeadingLabel('AI标书助手')).toBe(false)
    expect(isCjkLeadingLabel('24清单')).toBe(false)
    expect(isCjkLeadingLabel('/办公高效技能')).toBe(true)
  })

  it('orders Chinese before English/Latin', () => {
    const labels = ['AI标书助手', '安全隐患整改', '办公高效技能', 'frontend-design']
    const sorted = [...labels].sort(compareSlashSuggestionLabels)
    expect(sorted).toEqual(['安全隐患整改', '办公高效技能', 'AI标书助手', 'frontend-design'])
  })

  it('orders Chinese group by pinyin (zh-CN)', () => {
    const labels = ['班前安全讲话稿生成', '安全隐患整改', '暗挖工程方案审查', '办公高效技能']
    const sorted = [...labels].sort(compareSlashSuggestionLabels)
    expect(sorted).toEqual([
      '安全隐患整改',
      '暗挖工程方案审查',
      '班前安全讲话稿生成',
      '办公高效技能'
    ])
  })

  it('orders Latin group alphabetically case-insensitive', () => {
    const labels = ['zip-helper', 'AI标书助手', 'frontend-design']
    const sorted = [...labels].sort(compareSlashSuggestionLabels)
    expect(sorted[0]).toBe('AI标书助手')
    expect(sorted.slice(1)).toEqual(['frontend-design', 'zip-helper'])
  })
})
