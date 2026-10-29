import { describe, expect, it } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'
import { mergeSkillMarketCatalog } from '../../../../src/jiaorong_src/skills/lib/skillMarketCatalog'
import { readSkillAssetSource } from '../../../../src/jiaorong_src/skills/lib/skillAssetSource'

const localMeta = (name: string, metadata?: Record<string, unknown>): SkillMetadata => ({
  name,
  description: `${name}-local`,
  path: `/skills/${name}/SKILL.md`,
  skillRoot: `/skills/${name}`,
  category: null,
  ...(metadata ? { metadata } : {})
})

describe('readSkillAssetSource', () => {
  it('accepts only the two known markers', () => {
    expect(readSkillAssetSource({ source: 'open-platform' })).toBe('open-platform')
    expect(readSkillAssetSource({ source: 'legacy' })).toBe('legacy')
    expect(readSkillAssetSource({ source: ' legacy ' })).toBe('legacy')
  })

  it('falls back to empty for missing, wrong-typed or out-of-domain values', () => {
    expect(readSkillAssetSource(undefined)).toBe('')
    expect(readSkillAssetSource(null)).toBe('')
    expect(readSkillAssetSource({})).toBe('')
    expect(readSkillAssetSource({ source: 2 })).toBe('')
    // 应用资产的 source 是 builtin / store，不能被当成技能来源
    expect(readSkillAssetSource({ source: 'store' })).toBe('')
  })
})

describe('mergeSkillMarketCatalog source', () => {
  it('carries the market marker into metadata for uninstalled cards', () => {
    const merged = mergeSkillMarketCatalog(
      [],
      [
        {
          id: 's38',
          name: '软件测试用例设计',
          description: '设计用例',
          downloadUrl: 'https://example.com/a.zip',
          source: 'legacy'
        },
        {
          id: 'dev-god',
          name: '编程大神',
          description: '全栈编码',
          downloadUrl: 'https://example.com/b.zip',
          source: 'open-platform'
        }
      ]
    )

    expect(merged.find((skill) => skill.name === '软件测试用例设计')?.metadata?.source).toBe(
      'legacy'
    )
    expect(merged.find((skill) => skill.name === '编程大神')?.metadata?.source).toBe(
      'open-platform'
    )
  })

  it('pins the remote marker against package frontmatter', () => {
    const merged = mergeSkillMarketCatalog(
      [localMeta('编程大神', { source: 'legacy', version: '9.9.9' })],
      [
        {
          id: 'dev-god',
          name: '编程大神',
          description: '全栈编码',
          downloadUrl: 'https://example.com/b.zip',
          openPlatform: true,
          source: 'open-platform'
        }
      ]
    )
    const installed = merged.find((skill) => skill.name === '编程大神')

    expect(installed?.metadata?.source).toBe('open-platform')
    expect(installed?.metadata?.installedSkillName).toBe('编程大神')
  })

  it('omits the marker when the market item does not declare one', () => {
    const merged = mergeSkillMarketCatalog(
      [localMeta('本地技能', { source: 'legacy' })],
      [{ id: 'x', name: '远程技能', description: '', downloadUrl: 'https://example.com/x.zip' }]
    )

    expect(merged.find((skill) => skill.name === '远程技能')?.metadata).not.toHaveProperty('source')
    // 纯本地技能不参与远程合并，frontmatter 里的 source 原样保留
    expect(merged.find((skill) => skill.name === '本地技能')?.metadata?.source).toBe('legacy')
  })
})
