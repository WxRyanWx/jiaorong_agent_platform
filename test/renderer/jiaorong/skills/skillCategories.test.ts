import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SKILL_CATEGORY_MAP,
  getSkillFilterTags,
  parseSkillTagList,
  skillMatchesCategoryFilter,
  SKILL_CATEGORY_ALL,
  SKILL_FILTER_CATEGORIES
} from '../../../../src/jiaorong_src/skills/lib/skillCategories'
import { mergeSkillMarketCatalog } from '../../../../src/jiaorong_src/skills/lib/skillMarketCatalog'
import type { SkillMetadata } from '@shared/types/skill'

describe('skillCategories', () => {
  it('exposes fixed filter categories including 全部', () => {
    expect(SKILL_FILTER_CATEGORIES[0]).toBe(SKILL_CATEGORY_ALL)
    expect(SKILL_FILTER_CATEGORIES).toContain('综合办公')
    expect(SKILL_FILTER_CATEGORIES).toContain('软件研发')
    expect(SKILL_FILTER_CATEGORIES).toContain('工程建设')
    expect(SKILL_FILTER_CATEGORIES).toContain('合同法务')
    expect(SKILL_FILTER_CATEGORIES).toContain('经营投标')
  })

  it('maps builtin skills from the product table', () => {
    expect(BUILTIN_SKILL_CATEGORY_MAP['code-review']).toEqual(['软件研发'])
    expect(BUILTIN_SKILL_CATEGORY_MAP.docx).toEqual(['综合办公'])
    expect(BUILTIN_SKILL_CATEGORY_MAP['skill-creator']).toBeUndefined()
  })

  it('parses tagList from strings or objects', () => {
    expect(parseSkillTagList(['综合办公', ' 软件研发 ', ''])).toEqual(['综合办公', '软件研发'])
    expect(parseSkillTagList([{ name: '工程建设' }, { label: '合同法务' }])).toEqual([
      '工程建设',
      '合同法务'
    ])
  })

  it('only keeps known filter categories from remote tagList', () => {
    const tags = getSkillFilterTags({
      name: 'remote-skill',
      metadata: {
        tagList: ['审计', '项目管理', '合规', '经营投标', '乱七八糟']
      }
    })
    expect(tags).toEqual(['经营投标'])
  })

  it('prefers remote tagList over builtin map', () => {
    const tags = getSkillFilterTags({
      name: 'code-review',
      metadata: { tagList: ['经营投标'] }
    })
    expect(tags).toEqual(['经营投标'])
  })

  it('falls back to builtin map when tagList has no known categories', () => {
    expect(getSkillFilterTags({ name: 'pdf' })).toEqual(['综合办公'])
  })

  it('matches category filter: 全部 shows uncategorized', () => {
    const skill = { name: 'skill-creator' }
    expect(skillMatchesCategoryFilter(skill, SKILL_CATEGORY_ALL)).toBe(true)
    expect(skillMatchesCategoryFilter(skill, '软件研发')).toBe(false)
    expect(skillMatchesCategoryFilter({ name: 'xlsx' }, '综合办公')).toBe(true)
  })
})

describe('mergeSkillMarketCatalog tagList', () => {
  it('keeps remote tagList on remote-only and merged local cards', () => {
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
        tagList: ['工程建设', '合同法务']
      },
      {
        id: 's2',
        name: 'Remote Only',
        description: 'only',
        downloadUrl: 'https://example.com/b.zip',
        tagList: ['经营投标']
      }
    ])

    expect(merged.find((s) => s.name === 'shared')?.metadata?.tagList).toEqual([
      '工程建设',
      '合同法务'
    ])
    expect(merged.find((s) => s.name === 'Remote Only')?.metadata?.tagList).toEqual(['经营投标'])
  })
})
