import { describe, expect, it, vi } from 'vitest'
import {
  selectAppCenterRuntimes,
  toAppCenterItem,
  isDevWorkspaceRuntime
} from '../../../src/jiaorong_src/appHost/appCenter/main/appCenter'
import {
  applyAppCatalogFromApi,
  loadBuiltinAppCatalog,
  parseAppAssetCatalogRecord,
  resetRemoteAppCatalogForTests
} from '../../../src/jiaorong_src/appHost/catalog'
import { syncDevApps } from '../../../src/jiaorong_src/appHost/devCenter/main/devApps'
import { syncAppCatalogFromApi } from '../../../src/jiaorong_src/appHost/main/appCatalogApi'
import type { JiaorongAppHostDeps } from '../../../src/jiaorong_src/appHost/main/deps'
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
      canUninstall: true,
      developerOnly: false,
      visibleToCurrentUser: true
    })
    expect(toAppCenterItem(installed, { isDeveloper: true }).canUninstall).toBe(true)

    const builtinInstalled = makeRuntime({
      id: 'collaboration-platform',
      source: 'builtin',
      installStatus: 'installed',
      installedVersion: '1.0.0',
      appDir: '/mock/apps/collaboration-platform',
      entry: 'index.html'
    })
    expect(toAppCenterItem(builtinInstalled, { isDeveloper: true }).canUninstall).toBe(false)

    const hidden = makeRuntime({ visible: false })
    expect(toAppCenterItem(hidden, { isDeveloper: true })).toMatchObject({
      openable: false,
      canUninstall: false,
      developerOnly: true,
      // 开发者名单内仍可自测未过 auth 的应用
      visibleToCurrentUser: true
    })
    expect(toAppCenterItem(hidden, { isDeveloper: false })).toMatchObject({
      openable: false,
      canUninstall: false,
      visibleToCurrentUser: false
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

describe('dev workspace runtime detection', () => {
  it('treats the developer workspace link as not installed, but keeps real installs', () => {
    syncDevApps([{ id: 'dev-app', dir: '/tmp/workspace/dev-app', createdAt: 1 }])

    // 工作区 link：目录就是登记目录，不算已安装
    expect(
      isDevWorkspaceRuntime(
        makeRuntime({
          id: 'dev-app',
          source: 'local-debug',
          installStatus: 'installed',
          installedVersion: '1.0.0',
          appDir: '/tmp/workspace/dev-app'
        })
      )
    ).toBe(true)

    // 同 id 的生产安装副本（目录不同）：算已安装
    expect(
      isDevWorkspaceRuntime(
        makeRuntime({
          id: 'dev-app',
          source: 'local-debug',
          installStatus: 'installed',
          installedVersion: '1.0.0',
          appDir: '/mock/apps/dev-app'
        })
      )
    ).toBe(false)

    // 登记目录缺失的坏包按未安装处理
    expect(
      isDevWorkspaceRuntime(
        makeRuntime({ id: 'dev-app', source: 'local-debug', installStatus: 'error', appDir: null })
      )
    ).toBe(true)

    // 非开发者登记的 local-debug（手丢包）与非 local-debug 来源都不受影响
    expect(
      isDevWorkspaceRuntime(
        makeRuntime({ id: 'dropped-app', source: 'local-debug', appDir: '/mock/apps/dropped-app' })
      )
    ).toBe(false)
    expect(isDevWorkspaceRuntime(makeRuntime({ id: 'dev-app', source: 'store' }))).toBe(false)

    syncDevApps([])
  })
})

describe('catalog provider parsing', () => {
  /** 最小合法 store 记录。 */
  const baseRecord = {
    id: 'demo-app',
    name: 'Demo',
    version: '1.0.0',
    status: 'published',
    source: 'store',
    downloadUrl: 'https://example.com/demo.zip'
  }

  it('trims provider and omits when absent', () => {
    expect(parseAppAssetCatalogRecord({ ...baseRecord, provider: ' 交融科技 ' })?.provider).toBe(
      '交融科技'
    )
    expect(parseAppAssetCatalogRecord(baseRecord)?.provider).toBeUndefined()
    expect(parseAppAssetCatalogRecord({ ...baseRecord, provider: 42 })?.provider).toBeUndefined()
  })

  it('reads menu / app-center slot and defaults store records to app-center', () => {
    expect(parseAppAssetCatalogRecord({ ...baseRecord, slot: 'menu' })?.slot).toBe('menu')
    expect(parseAppAssetCatalogRecord({ ...baseRecord, slot: 'app-center' })?.slot).toBe(
      'app-center'
    )
    expect(parseAppAssetCatalogRecord(baseRecord)?.slot).toBe('app-center')
    const { source: _source, ...withoutSource } = baseRecord
    expect(parseAppAssetCatalogRecord(withoutSource)?.source).toBe('store')
    expect(
      parseAppAssetCatalogRecord({
        ...baseRecord,
        source: 'builtin',
        slot: 'app-center'
      })?.slot
    ).toBe('menu')
  })
})

describe('app catalog from the list api', () => {
  afterEach(() => {
    resetRemoteAppCatalogForTests()
  })

  /** 接口应用资产 fixture。 */
  const asset = {
    type: 'app',
    id: 'collaboration-platform',
    name: '协同平台',
    version: '1.1.1',
    status: 'published',
    source: 'builtin',
    slot: 'menu',
    auth: null,
    latestRelease: {
      version: '1.1.1',
      downloadUrl: 'http://api.example.com/assets/app/collaboration-platform/package',
      sha256: 'abc123'
    }
  }

  it('maps api fields onto catalog records', () => {
    expect(parseAppAssetCatalogRecord(asset)).toMatchObject({
      id: 'collaboration-platform',
      name: '协同平台',
      version: '1.1.1',
      slot: 'menu',
      source: 'builtin',
      auth: null,
      package: {
        kind: 'zip',
        downloadUrl: 'http://api.example.com/assets/app/collaboration-platform/package',
        sha256: 'abc123'
      }
    })
  })

  it('drops unpublished and package-less records', () => {
    expect(parseAppAssetCatalogRecord({ ...asset, status: 'draft' })).toBeNull()
    expect(parseAppAssetCatalogRecord({ ...asset, latestRelease: null })).toBeNull()
  })

  it('replaces the runtime catalog and reports changes once', () => {
    expect(applyAppCatalogFromApi([asset])).toBe(true)
    expect(loadBuiltinAppCatalog()).toEqual([
      expect.objectContaining({ id: 'collaboration-platform', version: '1.1.1' })
    ])
    expect(applyAppCatalogFromApi([asset])).toBe(false)
  })

  it('separates a failed list request from an empty catalog', async () => {
    /** 只用到登录态的最小依赖。 */
    const deps = {
      getAuthSession: () => ({ token: 'test-token' })
    } as unknown as JiaorongAppHostDeps
    try {
      applyAppCatalogFromApi([asset])
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('', { status: 500 }))
      )
      await expect(syncAppCatalogFromApi(deps)).resolves.toEqual({ ok: false, changed: false })
      // 失败时保留上一份目录，不能把内置应用清空
      expect(loadBuiltinAppCatalog()).toHaveLength(1)

      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                code: 200,
                data: {
                  items: [
                    {
                      ...asset,
                      version: '1.2.0',
                      latestRelease: { ...asset.latestRelease, version: '1.2.0' }
                    }
                  ],
                  hasMore: false
                }
              }),
              { status: 200 }
            )
        )
      )
      await expect(syncAppCatalogFromApi(deps)).resolves.toEqual({ ok: true, changed: true })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
