import { describe, expect, it } from 'vitest'
import {
  getLegacySkillAliasNames,
  getLegacyToolAliasNames,
  resolveLegacySkillName,
  resolveLegacyToolName
} from '@shared/legacyBrandAliases'

describe('legacyBrandAliases', () => {
  it('maps legacy tool names to jiaorong equivalents', () => {
    expect(resolveLegacyToolName('deepchat_question')).toBe('jiaorong_question')
    expect(resolveLegacyToolName('deepchat_settings_set_theme')).toBe('jiaorong_settings_set_theme')
    expect(resolveLegacyToolName('jiaorong_question')).toBe('jiaorong_question')
  })

  it('maps legacy settings skill name to jiaorong-settings', () => {
    expect(resolveLegacySkillName('deepchat-settings')).toBe('jiaorong-settings')
    expect(resolveLegacySkillName('jiaorong-settings')).toBe('jiaorong-settings')
  })

  it('exposes reverse alias lookups for display localization', () => {
    expect(getLegacyToolAliasNames('jiaorong_question')).toEqual(['deepchat_question'])
    expect(getLegacySkillAliasNames('jiaorong-settings')).toEqual(['deepchat-settings'])
  })
})
