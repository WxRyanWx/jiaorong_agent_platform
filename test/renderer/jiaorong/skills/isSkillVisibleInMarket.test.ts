import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isSkillVisibleInMarket,
  loadRemoteInstallMap,
  pruneRemoteInstallMap,
  rememberRemoteInstall,
  rememberSkillSource,
  SkillSource
} from '../../../../src/jiaorong_src/skills/lib/sessionSkill'

describe('isSkillVisibleInMarket', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows remote api skills by remoteId', () => {
    expect(
      isSkillVisibleInMarket({
        name: '差旅助手',
        metadata: { remoteId: 'remote-1' }
      })
    ).toBe(true)
  })

  it('shows remote api skills by skill_source', () => {
    expect(
      isSkillVisibleInMarket({
        name: 'uninstalled-remote',
        skill_source: SkillSource.RemoteApi
      })
    ).toBe(true)
  })

  it('shows builtin skill names including upstream additions', () => {
    expect(isSkillVisibleInMarket({ name: 'docx' })).toBe(true)
    expect(isSkillVisibleInMarket({ name: 'frontend-design' })).toBe(true)
    expect(isSkillVisibleInMarket({ name: 'memory-management' })).toBe(true)
    expect(isSkillVisibleInMarket({ name: 'jiaorong-cli' })).toBe(true)
    expect(isSkillVisibleInMarket({ name: 'deepchat-cli' })).toBe(false)
    expect(isSkillVisibleInMarket({ name: 'deepchat-settings' })).toBe(false)
  })

  it('shows LocalBuiltin source even if name is custom', () => {
    expect(
      isSkillVisibleInMarket({
        name: 'legacy-builtin-alias',
        skill_source: SkillSource.LocalBuiltin
      })
    ).toBe(true)
  })

  it('hides user upload and self-created local skills', () => {
    expect(
      isSkillVisibleInMarket({
        name: 'my-upload',
        skill_source: SkillSource.Zip
      })
    ).toBe(false)
    expect(
      isSkillVisibleInMarket({
        name: 'folder-skill',
        skill_source: SkillSource.Folder
      })
    ).toBe(false)
    expect(
      isSkillVisibleInMarket({
        name: 'md-skill',
        skill_source: SkillSource.Md
      })
    ).toBe(false)
  })

  it('hides unmarked local skills without remoteId', () => {
    expect(isSkillVisibleInMarket({ name: 'agnes_duomotai' })).toBe(false)
  })

  it('shows when remembered as LocalBuiltin', () => {
    rememberSkillSource('custom-marked-builtin', SkillSource.LocalBuiltin)
    expect(isSkillVisibleInMarket({ name: 'custom-marked-builtin' })).toBe(true)
  })
})

describe('pruneRemoteInstallMap', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('drops mappings whose local skill is no longer on disk', () => {
    rememberRemoteInstall('24清单', '24-bills-pricing')
    rememberRemoteInstall('差旅助手', 'travel-helper')

    const next = pruneRemoteInstallMap(['travel-helper'])

    expect(next).toEqual({ 差旅助手: 'travel-helper' })
    expect(loadRemoteInstallMap()).toEqual({ 差旅助手: 'travel-helper' })
  })
})
