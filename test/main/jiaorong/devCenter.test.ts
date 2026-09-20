import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  devAppCatalogRecords,
  inspectDevAppDir,
  syncDevApps
} from '../../../src/jiaorong_src/appHost/devCenter/main/devApps'
import { findZipAppJsonKey } from '../../../src/jiaorong_src/appHost/devCenter/main/devZip'
import {
  buildManifestJson,
  formFieldsFromRecord,
  inspectManifestRecord
} from '../../../src/jiaorong_src/appHost/manifestRules'

/** 让全局 fs mock 返回指定 app.json 原文。 */
function mockAppJson(raw: string): void {
  vi.mocked(fs.readFileSync).mockReturnValue(raw)
}

describe('dev center manifest validation', () => {
  it('accepts a manifest the app manager can link', () => {
    mockAppJson(
      JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      })
    )
    expect(inspectDevAppDir('/tmp/demo')).toBeNull()
  })

  it('rejects a manifest the app manager would refuse to link', () => {
    // 缺 slot：管理器登记失败，Node 起不来，创建时就要拦住
    mockAppJson(
      JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', entry: 'web-ui/index.html' })
    )
    expect(inspectDevAppDir('/tmp/demo')).toContain('slot')
    // 版本号不是三段式
    mockAppJson(
      JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      })
    )
    expect(inspectDevAppDir('/tmp/demo')).toContain('version')
    mockAppJson(JSON.stringify({ id: 'demo', name: 'Demo' }))
    expect(inspectDevAppDir('/tmp/demo')).toContain('必填字段')
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(inspectDevAppDir('/tmp/demo')).toContain('app.json')
  })
})

describe('dev center registry sync', () => {
  it('drops invalid and duplicated records', () => {
    /** 同步结果。 */
    const synced = syncDevApps([
      { id: 'a', name: 'A', version: '1.0.0', dir: '/tmp/a', createdAt: 1 },
      { id: 'a', name: 'A2', version: '1.0.1', dir: '/tmp/a2', createdAt: 2 },
      { id: '', name: 'X', version: '1.0.0', dir: '/tmp/x', createdAt: 3 },
      { id: 'b', name: 'B', version: '1.0.0', dir: '', createdAt: 4 },
      'nope'
    ])
    expect(synced.map((item) => item.id)).toEqual(['a'])
  })

  it('skips ids already owned by catalog or user dirs', () => {
    syncDevApps([{ id: 'a', name: 'A', version: '1.0.0', dir: '/tmp/a', createdAt: 1 }])
    /** 已收录 id 下的目录记录。 */
    const records = devAppCatalogRecords(new Set(['a']))
    expect(records).toEqual([])
    /** 未收录时给本地调试记录。 */
    const kept = devAppCatalogRecords(new Set())
    expect(kept).toHaveLength(1)
    expect(kept[0].record.source).toBe('local-debug')
    syncDevApps([])
  })
})

describe('publish manifest form', () => {
  it('rejects incomplete or illegal fields and omits empty optionals', () => {
    expect(inspectManifestRecord({ id: 'demo', name: 'Demo' })).toEqual({
      kind: 'required',
      fields: ['version', 'entry']
    })
    expect(
      inspectManifestRecord({
        id: 'demo',
        name: 'Demo',
        version: '1.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      })
    ).toEqual({ kind: 'version' })
    expect(
      inspectManifestRecord({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'sidebar'
      })
    ).toEqual({ kind: 'slot' })
    expect(
      inspectManifestRecord({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'app-center'
      })
    ).toBeNull()
    expect(
      inspectManifestRecord({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      })
    ).toBeNull()
    expect(
      JSON.parse(
        buildManifestJson({
          id: 'demo',
          name: 'Demo',
          version: '1.0.0',
          entry: 'web-ui/index.html',
          slot: 'menu',
          icon: '',
          description: 'hello',
          spawn: ''
        })
      )
    ).toEqual({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry: 'web-ui/index.html',
      slot: 'menu',
      description: 'hello'
    })
  })

  it('maps unused slot values back to app-center', () => {
    expect(
      formFieldsFromRecord({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'standalone'
      }).slot
    ).toBe('app-center')
  })
})

describe('zip app.json key lookup', () => {
  it('prefers the shallowest app.json and skips macOS junk', () => {
    expect(findZipAppJsonKey(['payload/app.json', 'app.json', '__MACOSX/app.json'])).toBe(
      'app.json'
    )
    expect(findZipAppJsonKey(['bundle/app.json', 'bundle/web/index.html'])).toBe('bundle/app.json')
    expect(findZipAppJsonKey(['__MACOSX/._app.json', 'readme.txt'])).toBeNull()
  })
})
