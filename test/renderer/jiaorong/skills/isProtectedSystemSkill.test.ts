import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isProtectedSystemSkill,
  JIAORONG_REMOTE_INSTALL_MAP_KEY,
  JIAORONG_SKILL_SOURCE_MAP_KEY,
  rememberRemoteInstall,
  rememberSkillSource,
  SkillSource
} from '../../../../src/jiaorong_src/skills/lib/sessionSkill'

describe('isProtectedSystemSkill', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('protects builtin skill names', () => {
    expect(isProtectedSystemSkill({ skillName: 'frontend-design' })).toBe(true)
    expect(isProtectedSystemSkill({ skillName: 'xlsx' })).toBe(true)
    expect(isProtectedSystemSkill({ skillName: 'memory-management' })).toBe(true)
    expect(isProtectedSystemSkill({ skillName: 'jiaorong-cli' })).toBe(true)
    expect(isProtectedSystemSkill({ skillName: 'deepchat-cli' })).toBe(false)
    expect(isProtectedSystemSkill({ skillName: 'deepchat-settings' })).toBe(false)
  })

  it('protects LocalBuiltin source', () => {
    expect(
      isProtectedSystemSkill({
        skillName: 'custom-name',
        skillSource: SkillSource.LocalBuiltin
      })
    ).toBe(true)
  })

  it('protects default market skills by Chinese name', () => {
    expect(isProtectedSystemSkill({ skillName: '差旅助手' })).toBe(true)
    expect(isProtectedSystemSkill({ displayName: '超级前端设计' })).toBe(true)
  })

  it('protects default market install via remoteInstallMap slug', () => {
    rememberRemoteInstall('严格代码审查', 'critical-code-reviewer')
    expect(isProtectedSystemSkill({ skillName: 'critical-code-reviewer' })).toBe(true)
  })

  it('allows user-uploaded skills', () => {
    expect(
      isProtectedSystemSkill({
        skillName: 'my-custom-skill',
        skillSource: SkillSource.Zip
      })
    ).toBe(false)
  })

  it('allows non-default remote market skills', () => {
    rememberRemoteInstall('某个随意市场技能', 'some-random-skill')
    expect(
      isProtectedSystemSkill({
        skillName: 'some-random-skill',
        displayName: '某个随意市场技能',
        skillSource: SkillSource.RemoteApi
      })
    ).toBe(false)
  })

  it('protects remembered LocalBuiltin map entry', () => {
    rememberSkillSource('legacy-builtin', SkillSource.LocalBuiltin)
    expect(isProtectedSystemSkill({ skillName: 'legacy-builtin' })).toBe(true)
    expect(localStorage.getItem(JIAORONG_SKILL_SOURCE_MAP_KEY)).toContain('legacy-builtin')
    expect(localStorage.getItem(JIAORONG_REMOTE_INSTALL_MAP_KEY)).toBeNull()
  })
})
