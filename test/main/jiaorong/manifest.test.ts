import { describe, expect, it } from 'vitest'
import { parseAppManifest } from '../../../src/jiaorong_src/appHost/main/manifest'

describe('parseAppManifest', () => {
  /** 最小合法清单。 */
  const base = {
    id: 'app-scaffold',
    name: '示例应用',
    version: '1.0.0',
    entry: 'web-ui/index.html'
  }

  it('reads menu and app-center slot from app.json', () => {
    expect(parseAppManifest({ ...base, slot: 'app-center' })?.slot).toBe('app-center')
    expect(parseAppManifest({ ...base, slot: 'menu' })?.slot).toBe('menu')
  })

  it('omits missing or illegal slot instead of forcing menu', () => {
    expect(parseAppManifest(base)?.slot).toBeUndefined()
    expect(parseAppManifest({ ...base, slot: 'standalone' })?.slot).toBeUndefined()
  })

  it('keeps openInWindow only when it is true', () => {
    expect(parseAppManifest({ ...base, openInWindow: true })?.openInWindow).toBe(true)
    expect(parseAppManifest(base)?.openInWindow).toBeUndefined()
    expect(parseAppManifest({ ...base, openInWindow: false })?.openInWindow).toBeUndefined()
    expect(parseAppManifest({ ...base, openInWindow: 'true' })?.openInWindow).toBeUndefined()
  })

  it('keeps platforms only when the field is present', () => {
    expect(parseAppManifest(base)?.platforms).toBeUndefined()
    expect(
      parseAppManifest({ ...base, platforms: ['Windows x64', 'windows-x64', 'mac-arm64'] })
        ?.platforms
    ).toEqual(['windows-x64', 'mac-arm64'])
    expect(parseAppManifest({ ...base, platforms: [] })?.platforms).toEqual([])
    expect(parseAppManifest({ ...base, platforms: 'windows-x64' })?.platforms).toEqual([])
  })
})
