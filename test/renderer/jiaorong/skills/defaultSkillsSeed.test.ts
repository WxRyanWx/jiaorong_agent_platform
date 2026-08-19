import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_SKILLS,
  DEFAULT_SKILLS_SEED_BUILD_ID
} from '../../../../src/jiaorong_src/skills/lib/defaultSkillsManifest'
import {
  findRemoteSkillForDefault,
  isDefaultSkillPresentLocally,
  JIAORONG_DEFAULT_SKILLS_SEED_BUILD_KEY,
  JIAORONG_DEFAULT_SKILLS_SEED_VERSION_KEY
} from '../../../../src/jiaorong_src/skills/lib/ensureDefaultSkills'

describe('defaultSkillsManifest', () => {
  it('lists exactly 19 default skills', () => {
    expect(DEFAULT_MARKET_SKILLS).toHaveLength(19)
  })

  it('uses market display names only', () => {
    expect(DEFAULT_MARKET_SKILLS).toContain('超级前端设计')
    expect(DEFAULT_MARKET_SKILLS).toContain('严格代码审查')
    expect(DEFAULT_MARKET_SKILLS).toContain(
      'BigPlan · 产品调研（市场分析·技术评估·项目研发·产品方案）'
    )
  })

  it('defines a non-empty private seed build id', () => {
    expect(DEFAULT_SKILLS_SEED_BUILD_ID.trim().length).toBeGreaterThan(0)
  })
})

describe('default skills seed gate keys', () => {
  it('uses build-id key and keeps legacy version key name for cleanup', () => {
    expect(JIAORONG_DEFAULT_SKILLS_SEED_BUILD_KEY).toBe('jiaorongDefaultSkillsSeedBuildId')
    expect(JIAORONG_DEFAULT_SKILLS_SEED_VERSION_KEY).toBe('jiaorongDefaultSkillsSeedVersion')
  })
})

describe('ensureDefaultSkills matching', () => {
  it('detects installed by market name locally', () => {
    expect(isDefaultSkillPresentLocally('超级前端设计', ['超级前端设计', 'docx'], {})).toBe(true)
    expect(isDefaultSkillPresentLocally('超级前端设计', ['docx'], {})).toBe(false)
  })

  it('detects installed via remoteInstallMap pointing to local slug', () => {
    expect(
      isDefaultSkillPresentLocally('严格代码审查', ['critical-code-reviewer'], {
        严格代码审查: 'critical-code-reviewer'
      })
    ).toBe(true)
  })

  it('finds remote skill by name only', () => {
    const found = findRemoteSkillForDefault('超级前端设计', [
      {
        id: 's31',
        name: '超级前端设计',
        downloadUrl: 'https://example.com/superdesign.zip'
      }
    ])
    expect(found?.downloadUrl).toContain('superdesign')
  })

  it('does not match remote alias when name differs', () => {
    const found = findRemoteSkillForDefault('超级前端设计', [
      {
        id: 's31',
        name: 'Other Name',
        downloadUrl: 'https://example.com/superdesign.zip'
      }
    ])
    expect(found).toBeNull()
  })
})
