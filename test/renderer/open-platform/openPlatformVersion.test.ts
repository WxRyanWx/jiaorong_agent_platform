import { describe, expect, it } from 'vitest'
import {
  compareOpenPlatformVersions,
  isValidOpenPlatformVersion,
  isOpenPlatformPublishVersion,
  isNewerOpenPlatformVersion,
  needsOpenPlatformVersionSync,
  normalizeOpenPlatformPublishVersionInput
} from '@jiaorong/api/openPlatform/version'

describe('open platform version', () => {
  it('validates semver shaped versions', () => {
    expect(isValidOpenPlatformVersion('1.0.0')).toBe(true)
    expect(isValidOpenPlatformVersion(' 1.2.3-beta.1 ')).toBe(true)
    expect(isValidOpenPlatformVersion('1.2.3+build.5')).toBe(true)
    expect(isValidOpenPlatformVersion('1.0')).toBe(false)
    expect(isValidOpenPlatformVersion('v1.0.0')).toBe(false)
    expect(isValidOpenPlatformVersion('')).toBe(false)
  })

  it('limits publish versions to 99.99.99', () => {
    expect(isOpenPlatformPublishVersion('0.0.0')).toBe(true)
    expect(isOpenPlatformPublishVersion('99.99.99')).toBe(true)
    expect(isOpenPlatformPublishVersion('100.0.0')).toBe(false)
    expect(isOpenPlatformPublishVersion('1.100.0')).toBe(false)
    expect(isOpenPlatformPublishVersion('1.0.100')).toBe(false)
    expect(isOpenPlatformPublishVersion('1.0.0-beta')).toBe(false)
    // 市场历史版本仍需按通用 semver 读取，不能被发布上限误伤
    expect(isValidOpenPlatformVersion('100.0.0')).toBe(true)
  })

  it('normalizes publish version input', () => {
    expect(normalizeOpenPlatformPublishVersionInput('v123.45.678')).toBe('12.45.67')
    expect(normalizeOpenPlatformPublishVersionInput('1a.2b.3c')).toBe('1.2.3')
    expect(normalizeOpenPlatformPublishVersionInput('99.1212.123')).toBe('99.12.12')
    expect(normalizeOpenPlatformPublishVersionInput(undefined)).toBe('')
  })

  it('compares core and prerelease segments', () => {
    expect(compareOpenPlatformVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareOpenPlatformVersions('1.1.9', '1.2.0')).toBe(-1)
    expect(compareOpenPlatformVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareOpenPlatformVersions('1.2.0', '1.2.0-beta')).toBe(1)
    expect(compareOpenPlatformVersions('1.2.0-beta.2', '1.2.0-beta.10')).toBe(-1)
  })

  it('tolerates a v prefix coming from the remote registry', () => {
    expect(compareOpenPlatformVersions('v1.2.0', '1.1.0')).toBe(1)
    expect(isNewerOpenPlatformVersion('v1.2.0', 'v1.1.0')).toBe(true)
    expect(isNewerOpenPlatformVersion('v1.2.0', 'v1.2.0')).toBe(false)
  })

  it('treats a missing or dirty local version as updatable', () => {
    expect(isNewerOpenPlatformVersion('1.2.0', undefined)).toBe(true)
    expect(isNewerOpenPlatformVersion('1.2.0', '  ')).toBe(true)
    // 本地脏数据不能让 compare 恒为 0，否则更新按钮永远不出现
    expect(isNewerOpenPlatformVersion('1.2.0', 'unknown')).toBe(true)
    expect(isNewerOpenPlatformVersion('1.2.0', '1.2')).toBe(true)
  })

  it('never promotes an unusable market version', () => {
    expect(isNewerOpenPlatformVersion(undefined, '1.0.0')).toBe(false)
    expect(isNewerOpenPlatformVersion('', '1.0.0')).toBe(false)
    expect(isNewerOpenPlatformVersion('not-a-version', '1.0.0')).toBe(false)
    expect(isNewerOpenPlatformVersion('1.0.0', '1.0.1')).toBe(false)
  })

  it('syncs when the recorded local version is ahead of the market version', () => {
    // 后端重置过版本号时本地记录会高于市场版本，不能让更新按钮被永久压掉
    expect(needsOpenPlatformVersionSync('1.0.4', '1.10.3')).toBe(true)
  })

  it('only syncs when versions actually differ', () => {
    expect(needsOpenPlatformVersionSync('1.0.4', '1.0.4')).toBe(false)
    expect(needsOpenPlatformVersionSync('1.0.4', '1.0.3')).toBe(true)
    expect(needsOpenPlatformVersionSync('1.0.4', undefined)).toBe(true)
    expect(needsOpenPlatformVersionSync('1.0.4', 'unknown')).toBe(true)
    // 市场版本自身不可用时一律不提示
    expect(needsOpenPlatformVersionSync(undefined, '1.0.0')).toBe(false)
    expect(needsOpenPlatformVersionSync('not-a-version', '1.0.0')).toBe(false)
  })
})
