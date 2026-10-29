import { beforeEach, describe, expect, it } from 'vitest'
import {
  JIAORONG_REMOTE_INSTALL_MAP_KEY,
  forgetRemoteInstall,
  loadRemoteInstallMap,
  loadRemoteInstallVersions,
  pruneRemoteInstallMap,
  rememberRemoteInstall
} from '../../../../src/jiaorong_src/skills/lib/sessionSkill'

describe('remote install map versions', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads legacy string values without versions', () => {
    localStorage.setItem(
      JIAORONG_REMOTE_INSTALL_MAP_KEY,
      JSON.stringify({ 'market-skill': 'local-dir' })
    )

    expect(loadRemoteInstallMap()).toEqual({ 'market-skill': 'local-dir' })
    expect(loadRemoteInstallVersions()).toEqual({})
  })

  it('records versions and keeps them across version-less re-installs', () => {
    rememberRemoteInstall('market-skill', 'local-dir', '1.2.0')
    expect(loadRemoteInstallVersions()).toEqual({ 'market-skill': '1.2.0' })

    // 普通市场重装不带版本时保留已记录版本
    rememberRemoteInstall('market-skill', 'local-dir-renamed')
    expect(loadRemoteInstallMap()).toEqual({ 'market-skill': 'local-dir-renamed' })
    expect(loadRemoteInstallVersions()).toEqual({ 'market-skill': '1.2.0' })

    // 显式传版本时覆盖
    rememberRemoteInstall('market-skill', 'local-dir-renamed', '1.3.0')
    expect(loadRemoteInstallVersions()).toEqual({ 'market-skill': '1.3.0' })
  })

  it('keeps versionless entries in the legacy string shape', () => {
    rememberRemoteInstall('plain-skill', 'plain-dir')
    expect(JSON.parse(localStorage.getItem(JIAORONG_REMOTE_INSTALL_MAP_KEY) ?? '{}')).toEqual({
      'plain-skill': 'plain-dir'
    })
  })

  it('forgets entries by market name or local name including versions', () => {
    rememberRemoteInstall('market-a', 'dir-a', '1.0.0')
    rememberRemoteInstall('market-b', 'dir-b', '2.0.0')

    forgetRemoteInstall('dir-a')
    expect(loadRemoteInstallVersions()).toEqual({ 'market-b': '2.0.0' })

    forgetRemoteInstall('market-b')
    expect(loadRemoteInstallMap()).toEqual({})
  })

  it('prunes stale local names but keeps versions of surviving entries', () => {
    rememberRemoteInstall('market-a', 'dir-a', '1.0.0')
    rememberRemoteInstall('market-b', 'dir-b', '2.0.0')

    const remaining = pruneRemoteInstallMap(['dir-b'])
    expect(remaining).toEqual({ 'market-b': 'dir-b' })
    expect(loadRemoteInstallVersions()).toEqual({ 'market-b': '2.0.0' })
  })
})
