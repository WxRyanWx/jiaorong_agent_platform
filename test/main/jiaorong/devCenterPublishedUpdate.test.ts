import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { loadBuiltinAppCatalogMock, patchZipManifestMock } = vi.hoisted(() => ({
  loadBuiltinAppCatalogMock: vi.fn(),
  patchZipManifestMock: vi.fn()
}))

vi.mock('../../../src/jiaorong_src/appHost/catalog', () => ({
  loadBuiltinAppCatalog: loadBuiltinAppCatalogMock
}))
vi.mock('../../../src/jiaorong_src/appHost/appCenter/main/appCenter', () => ({
  isDeveloperIdentity: vi.fn(() => true)
}))
vi.mock('../../../src/jiaorong_src/appHost/main/bridge', () => ({
  resolveAppIconSrc: vi.fn(() => null)
}))
vi.mock('../../../src/jiaorong_src/appHost/devCenter/main/devZip', () => ({
  peekZipManifest: vi.fn(),
  patchZipManifest: patchZipManifestMock
}))

import {
  publishDevApp,
  listDevCenterItems
} from '../../../src/jiaorong_src/appHost/devCenter/main/devCenter'
import { syncDevApps } from '../../../src/jiaorong_src/appHost/devCenter/main/devApps'
import type { JiaorongAppCatalogRecord } from '../../../src/jiaorong_src/appHost/types'

const publishedCatalogRecord: JiaorongAppCatalogRecord = {
  id: 'published-app',
  name: 'Published App',
  version: '1.0.0',
  slot: 'app-center',
  source: 'store',
  package: { kind: 'zip', downloadUrl: 'https://example.com/published-app.zip' }
}

const deps = { getAuthSession: () => null } as Parameters<typeof listDevCenterItems>[0]

function mockLocalManifest(id: string, version: string): void {
  vi.mocked(fs.readFileSync).mockReturnValue(
    JSON.stringify({
      id,
      name: 'Local App',
      version,
      entry: 'web-ui/index.html',
      slot: 'app-center'
    })
  )
}

function manifestJson(id: string, version: string): string {
  return JSON.stringify({
    id,
    name: 'Local App',
    version,
    entry: 'web-ui/index.html',
    slot: 'app-center'
  })
}

afterEach(() => {
  syncDevApps([])
  vi.clearAllMocks()
})

describe('dev center published app update', () => {
  it('marks local apps that exist in the runtime catalog as published', () => {
    loadBuiltinAppCatalogMock.mockReturnValue([publishedCatalogRecord])
    mockLocalManifest('published-app', '1.0.1')
    syncDevApps([
      {
        id: 'published-app',
        name: 'Local App',
        version: '1.0.1',
        dir: '/tmp/published-app',
        createdAt: 1
      }
    ])

    expect(listDevCenterItems(deps)[0]).toMatchObject({
      id: 'published-app',
      publishedVersion: '1.0.0'
    })
  })

  it('rejects an update when the final app id changes', async () => {
    loadBuiltinAppCatalogMock.mockReturnValue([publishedCatalogRecord])
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await publishDevApp(deps, {
      appId: 'published-app',
      manifestJson: manifestJson('other-app', '1.0.1'),
      zipPath: '/tmp/app.zip'
    })

    expect(result).toMatchObject({ ok: false, message: '应用 ID 不能修改' })
    expect(patchZipManifestMock).not.toHaveBeenCalled()
  })

  it('rejects a first publish that reuses another published app id', async () => {
    loadBuiltinAppCatalogMock.mockReturnValue([publishedCatalogRecord])
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await publishDevApp(deps, {
      appId: 'local-app',
      manifestJson: manifestJson('published-app', '1.0.1'),
      zipPath: '/tmp/app.zip'
    })

    expect(result).toMatchObject({
      ok: false,
      message: '应用 ID 已存在，请在对应应用下更新'
    })
    expect(patchZipManifestMock).not.toHaveBeenCalled()
  })

  it('rejects an update that does not increase the published version', async () => {
    loadBuiltinAppCatalogMock.mockReturnValue([publishedCatalogRecord])
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = await publishDevApp(deps, {
      appId: 'published-app',
      manifestJson: manifestJson('published-app', '1.0.0'),
      zipPath: '/tmp/app.zip'
    })

    expect(result).toMatchObject({
      ok: false,
      message: '更新版本必须大于线上版本 1.0.0'
    })
    expect(patchZipManifestMock).not.toHaveBeenCalled()
  })

  it('accepts an increased update and a first publish', async () => {
    patchZipManifestMock.mockReturnValue({ ok: true, zipPath: '/tmp/patched.zip' })
    vi.mocked(fs.existsSync).mockReturnValue(true)

    loadBuiltinAppCatalogMock.mockReturnValue([publishedCatalogRecord])
    await expect(
      publishDevApp(deps, {
        appId: 'published-app',
        manifestJson: manifestJson('published-app', '1.0.1'),
        zipPath: '/tmp/app.zip'
      })
    ).resolves.toMatchObject({ ok: true })

    loadBuiltinAppCatalogMock.mockReturnValue([])
    await expect(
      publishDevApp(deps, {
        appId: 'local-app',
        manifestJson: manifestJson('new-app', '1.0.0'),
        zipPath: '/tmp/app.zip'
      })
    ).resolves.toMatchObject({ ok: true })
  })
})
