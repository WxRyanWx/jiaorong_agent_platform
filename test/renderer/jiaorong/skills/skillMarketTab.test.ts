import { describe, expect, it } from 'vitest'
import { parseSkillMarketTab } from '../../../../src/jiaorong_src/skills/lib/skillMarketTab'

describe('parseSkillMarketTab', () => {
  it('defaults to market', () => {
    expect(parseSkillMarketTab(undefined)).toBe('market')
    expect(parseSkillMarketTab('')).toBe('market')
    expect(parseSkillMarketTab('other')).toBe('market')
  })

  it('accepts installed', () => {
    expect(parseSkillMarketTab('installed')).toBe('installed')
    expect(parseSkillMarketTab(['installed'])).toBe('installed')
  })
})
