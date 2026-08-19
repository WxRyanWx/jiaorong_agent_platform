import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SKILL_CATEGORY_ID_MAP,
  buildFilterCategoryTabs,
  getSkillCategoryId,
  parseSkillCategories,
  skillMatchesCategoryFilter,
  SKILL_CATEGORY_ALL,
  SKILL_CATEGORY_ALL_ID
} from '../../../../src/jiaorong_src/skills/lib/skillCategories'
import { mergeSkillMarketCatalog } from '../../../../src/jiaorong_src/skills/lib/skillMarketCatalog'
import type { SkillMetadata } from '@shared/types/skill'

describe('skillCategories', () => {
  it('parses real skillCategory/list payload by id + categoryName', () => {
    const categories = parseSkillCategories([
      { id: 'bidding', categoryName: '经营投标', createTime: null, updateTime: null },
      { id: 'engineering', categoryName: '工程建设', createTime: null, updateTime: null },
      { id: 'legal', categoryName: '合约法务', createTime: null, updateTime: null },
      { id: 'office', categoryName: '综合办公', createTime: null, updateTime: null },
      { id: 'rd', categoryName: '软件研发', createTime: null, updateTime: null }
    ])
    expect(categories).toEqual([
      { id: 'bidding', categoryName: '经营投标' },
      { id: 'engineering', categoryName: '工程建设' },
      { id: 'legal', categoryName: '合约法务' },
      { id: 'office', categoryName: '综合办公' },
      { id: 'rd', categoryName: '软件研发' }
    ])
  })

  it('builds filter tabs with 全部 first', () => {
    expect(
      buildFilterCategoryTabs([
        { id: 'office', categoryName: '综合办公' },
        { id: 'rd', categoryName: '软件研发' },
        { id: 'office', categoryName: '重复' }
      ])
    ).toEqual([
      { id: SKILL_CATEGORY_ALL_ID, categoryName: SKILL_CATEGORY_ALL },
      { id: 'office', categoryName: '综合办公' },
      { id: 'rd', categoryName: '软件研发' }
    ])
  })

  it('maps builtin skills to category ids', () => {
    expect(BUILTIN_SKILL_CATEGORY_ID_MAP['code-review']).toBe('rd')
    expect(BUILTIN_SKILL_CATEGORY_ID_MAP.docx).toBe('office')
    expect(BUILTIN_SKILL_CATEGORY_ID_MAP['skill-creator']).toBeUndefined()
  })

  it('prefers remote categoryId over builtin map', () => {
    expect(
      getSkillCategoryId({
        name: 'code-review',
        metadata: { categoryId: 'bidding' }
      })
    ).toBe('bidding')
  })

  it('falls back to builtin category id when remote missing', () => {
    expect(getSkillCategoryId({ name: 'pdf' })).toBe('office')
    expect(getSkillCategoryId({ name: 'skill-creator' })).toBe('')
  })

  it('matches filter by category id (not display name)', () => {
    const remote = { name: '合同助手', metadata: { categoryId: 'legal' } }
    expect(skillMatchesCategoryFilter(remote, SKILL_CATEGORY_ALL_ID)).toBe(true)
    expect(skillMatchesCategoryFilter(remote, 'legal')).toBe(true)
    expect(skillMatchesCategoryFilter(remote, 'rd')).toBe(false)
    // 展示名是「合约法务」，但筛选用 id
    expect(skillMatchesCategoryFilter(remote, '合约法务')).toBe(false)
    expect(skillMatchesCategoryFilter({ name: 'xlsx' }, 'office')).toBe(true)
  })
})

describe('mergeSkillMarketCatalog categoryId', () => {
  it('keeps remote categoryId on remote-only and merged local cards', () => {
    const local: SkillMetadata[] = [
      {
        name: 'shared',
        description: 'local',
        path: '/skills/shared/SKILL.md',
        skillRoot: '/skills/shared',
        category: null
      }
    ]
    const merged = mergeSkillMarketCatalog(local, [
      {
        id: 's1',
        name: 'shared',
        description: 'remote',
        downloadUrl: 'https://example.com/a.zip',
        categoryId: 'engineering'
      },
      {
        id: 's2',
        name: 'Remote Only',
        description: 'only',
        downloadUrl: 'https://example.com/b.zip',
        categoryId: 'bidding'
      }
    ])

    expect(merged.find((s) => s.name === 'shared')?.metadata?.categoryId).toBe('engineering')
    expect(merged.find((s) => s.name === 'Remote Only')?.metadata?.categoryId).toBe('bidding')
  })
})
