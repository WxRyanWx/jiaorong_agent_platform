import { describe, expect, it } from 'vitest'
import {
  selectAppCenterRuntimes,
  toAppCenterItem
} from '../../../src/jiaorong_src/appHost/appCenter/main/appCenter'
import { parseAppCatalogRecord } from '../../../src/jiaorong_src/appHost/catalog'
import { syncDevApps } from '../../../src/jiaorong_src/appHost/devCenter/main/devApps'
import type { JiaorongAppRuntime } from '../../../src/jiaorong_src/appHost/types'

/** 构造运行时项 fixture。 */
function makeRuntime(overrides: Partial<JiaorongAppRuntime> = {}): JiaorongAppRuntime {
  return {
    id: 'demo-app',
    name: 'Demo',
    version: '1.0.0',
    slot: 'menu',
    source: 'store',
    enabled: true,
    auth: null,
    package: { kind: 'zip', downloadUrl: 'https://example.com/demo.zip' },
    visible: true,
    installStatus: 'not_installed',
    installedVersion: null,
    appDir: null,
    entry: null,
    ...overrides
  }
}

describe('app center selection', () => {
  it('excludes system apps, disabled records, and developer-center packages', () => {
    syncDevApps([
      {
        id: 'dev-local-app',
        name: '应用脚手架123',
        version: '0.0.1',
        dir: '/tmp/dev',
        createdAt: 1
      }
    ])
    const runtimes = [
      makeRuntime({ id: 'collaboration-platform', source: 'builtin' }),
      makeRuntime({ id: 'disabled-app', enabled: false }),
      makeRuntime({
        id: 'dev-local-app',
        name: '应用脚手架123',
        source: 'local-debug',
        provider: '本地开发',
        installStatus: 'installed',
        installedVersion: '0.0.1'
      }),
      makeRuntime()
    ]

    expect(
      selectAppCenterRuntimes(runtimes, { isDeveloper: false }).map((item) => item.id)
    ).toEqual(['demo-app'])
    expect(selectAppCenterRuntimes(runtimes, { isDeveloper: true }).map((item) => item.id)).toEqual(
      ['demo-app']
    )
    syncDevApps([])
  })

  it('keeps hand-dropped apps from the user apps folder', () => {
    const dropped = makeRuntime({
      id: 'dropped-app',
      name: '手丢应用',
      source: 'local-debug',
      provider: '本地',
      installStatus: 'installed',
      installedVersion: '1.0.0',
      slot: 'app-center'
    })
    expect(
      selectAppCenterRuntimes([dropped], { isDeveloper: false }).map((item) => item.id)
    ).toEqual(['dropped-app'])
  })

  it('keeps auth-failed apps only for developers', () => {
    const hidden = makeRuntime({ id: 'secret-app', visible: false })

    expect(selectAppCenterRuntimes([hidden], { isDeveloper: false })).toEqual([])
    expect(selectAppCenterRuntimes([hidden], { isDeveloper: true }).map((item) => item.id)).toEqual(
      ['secret-app']
    )
  })

  it('builds center cards with open / uninstall / dev-only flags', () => {
    const installed = makeRuntime({
      installStatus: 'installed',
      installedVersion: '1.0.0',
      appDir: '/mock/apps/demo-app',
      entry: 'index.html'
    })

    expect(toAppCenterItem(installed, { isDeveloper: false })).toMatchObject({
      id: 'demo-app',
      remotePackage: true,
      openable: true,
      canUninstall: false,
      developerOnly: false
    })
    expect(toAppCenterItem(installed, { isDeveloper: true }).canUninstall).toBe(true)

    const hidden = makeRuntime({ visible: false })
    expect(toAppCenterItem(hidden, { isDeveloper: true })).toMatchObject({
      openable: false,
      canUninstall: false,
      developerOnly: true
    })

    const hiddenInstalled = makeRuntime({
      visible: false,
      installStatus: 'installed',
      installedVersion: '1.0.0',
      appDir: '/mock/apps/demo-app',
      entry: 'index.html'
    })
    expect(toAppCenterItem(hiddenInstalled, { isDeveloper: true }).openable).toBe(true)
  })

  it('passes catalog provider through to center cards', () => {
    expect(
      toAppCenterItem(makeRuntime({ provider: '交融科技' }), { isDeveloper: false }).provider
    ).toBe('交融科技')
    expect(toAppCenterItem(makeRuntime(), { isDeveloper: false }).provider).toBe('')
  })
})

describe('catalog provider parsing', () => {
  /** 最小合法 store 记录。 */
  const baseRecord = {
    id: 'demo-app',
    name: 'Demo',
    version: '1.0.0',
    source: 'store',
    package: { kind: 'zip', downloadUrl: 'https://example.com/demo.zip' }
  }

  it('trims provider and omits when absent', () => {
    expect(parseAppCatalogRecord({ ...baseRecord, provider: ' 交融科技 ' })?.provider).toBe(
      '交融科技'
    )
    expect(parseAppCatalogRecord(baseRecord)?.provider).toBeUndefined()
    expect(parseAppCatalogRecord({ ...baseRecord, provider: 42 })?.provider).toBeUndefined()
  })

  it('reads menu / app-center slot and defaults store records to app-center', () => {
    expect(parseAppCatalogRecord({ ...baseRecord, slot: 'menu' })?.slot).toBe('menu')
    expect(parseAppCatalogRecord({ ...baseRecord, slot: 'app-center' })?.slot).toBe('app-center')
    expect(parseAppCatalogRecord(baseRecord)?.slot).toBe('app-center')
    const { source: _source, ...withoutSource } = baseRecord
    expect(parseAppCatalogRecord(withoutSource)?.source).toBe('store')
    expect(
      parseAppCatalogRecord({
        ...baseRecord,
        source: 'builtin',
        slot: 'app-center'
      })?.slot
    ).toBe('menu')
  })
})
