import { describe, expect, it } from 'vitest'
import path from 'path'
import {
  APP_HOME_DIR_NAME,
  DEEPLINK_SCHEME,
  getDefaultSkillsPath,
  isDeeplinkUrl,
  matchesAnyDeeplinkUrl,
  normalizeDeeplinkUrl,
  repairLegacySkillsPath
} from '@shared/appIdentity'

describe('appIdentity', () => {
  it('builds default skills path from the brand home directory', () => {
    expect(getDefaultSkillsPath('/mock/home')).toBe(
      path.join('/mock/home', APP_HOME_DIR_NAME, 'skills')
    )
  })

  it('repairs legacy deepchat skills paths to jiaorongchat', () => {
    expect(repairLegacySkillsPath('/mock/home/.deepchat/skills', '/mock/home')).toBe(
      getDefaultSkillsPath('/mock/home')
    )
    expect(
      repairLegacySkillsPath('C:\\Users\\sam\\.deepchat\\skills\\docx', 'C:\\Users\\sam')
    ).toBe(path.join('C:\\Users\\sam', APP_HOME_DIR_NAME, 'skills', 'docx'))
  })

  it('normalizes legacy deepchat deeplinks', () => {
    expect(normalizeDeeplinkUrl('deepchat://chat?token=abc')).toBe(
      `${DEEPLINK_SCHEME}://chat?token=abc`
    )
  })

  it('matches deeplink prefixes case-insensitively', () => {
    expect(isDeeplinkUrl('JiaorongChat://start')).toBe(true)
    expect(matchesAnyDeeplinkUrl('DEEPCHAT://start')).toBe(true)
  })
})
