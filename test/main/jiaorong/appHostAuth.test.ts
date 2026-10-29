import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isAppVisibleToUser,
  readUserIdentityFromUserInfo
} from '../../../src/jiaorong_src/appHost/auth'
import { readUserIdentityFromAuthSession } from '../../../src/jiaorong_src/appHost/main/userIdentity'
import {
  ensureRemoteAppCatalog,
  loadBuiltinAppCatalog,
  resetRemoteAppCatalogForTests
} from '../../../src/jiaorong_src/appHost/catalog'
import { mergeSystemBundledCatalog } from '../../../src/jiaorong_src/appHost/systemApps'

describe('jiaorong app catalog auth', () => {
  const user = {
    userName: 'L20184974',
    orgNos: ['101641966', '101231266'],
    phone: '13800138000'
  }

  it('shows everyone when auth is missing or empty', () => {
    expect(isAppVisibleToUser(null, { userName: null, orgNos: [], phone: null })).toBe(true)
    expect(isAppVisibleToUser({ orgs: [], userIds: [], phones: [] }, user)).toBe(true)
  })

  it('matches userName as userid or any orgNo', () => {
    expect(isAppVisibleToUser({ orgs: ['101641966'], userIds: [], phones: [] }, user)).toBe(true)
    expect(isAppVisibleToUser({ orgs: ['nope'], userIds: ['L20184974'], phones: [] }, user)).toBe(
      true
    )
    expect(isAppVisibleToUser({ orgs: ['nope'], userIds: ['other'], phones: [] }, user)).toBe(false)
  })

  it('matches phone when userId and org miss', () => {
    expect(
      isAppVisibleToUser({ orgs: ['nope'], userIds: ['other'], phones: ['13800138000'] }, user)
    ).toBe(true)
    expect(
      isAppVisibleToUser({ orgs: ['nope'], userIds: ['other'], phones: ['13900000000'] }, user)
    ).toBe(false)
  })

  it('reads userName and orgList.orgNo from userInfo', () => {
    expect(
      readUserIdentityFromUserInfo({
        userName: 'L20184974',
        phone: '13800138000',
        orgList: [{ orgNo: '101641966', name: 'AI中心业务组' }]
      })
    ).toEqual({
      userName: 'L20184974',
      orgNos: ['101641966'],
      orgPathNos: ['101641966'],
      phone: '13800138000'
    })
  })

  it('reads exact organization path nodes from pathNo', () => {
    expect(
      readUserIdentityFromUserInfo({
        userName: 'L20184974',
        orgList: [
          {
            orgNo: '101641966',
            pathNo: '.0.1..1047701.1047702.101231266.101641966.'
          }
        ]
      })
    ).toEqual({
      userName: 'L20184974',
      orgNos: ['101641966'],
      orgPathNos: ['0', '1', '1047701', '1047702', '101231266', '101641966'],
      phone: null
    })
  })

  it('reads pathNo even when orgNo is missing', () => {
    expect(
      readUserIdentityFromUserInfo({
        userName: 'L20184974',
        orgList: [{ pathNo: '.1047701.1047702.' }]
      })
    ).toEqual({
      userName: 'L20184974',
      orgNos: [],
      orgPathNos: ['1047701', '1047702'],
      phone: null
    })
  })

  it('matches any exact organization path node from pathNo', () => {
    const pathUser = {
      userName: 'L20184974',
      orgNos: ['101641966'],
      orgPathNos: ['0', '1', '1047701', '1047702', '101231266', '101641966'],
      phone: '13800138000'
    }

    expect(isAppVisibleToUser({ orgs: ['1047702'], userIds: [], phones: [] }, pathUser)).toBe(true)
    expect(isAppVisibleToUser({ orgs: ['10477'], userIds: [], phones: [] }, pathUser)).toBe(false)
  })

  it('reads organization path nodes from the persisted auth session', () => {
    expect(
      readUserIdentityFromAuthSession({
        token: 'xk-token',
        userFullInfo: JSON.stringify({
          userName: 'L20184974',
          orgList: [{ orgNo: '101641966', pathNo: '.1047701.1047702.101641966.' }]
        })
      })
    ).toEqual({
      userName: 'L20184974',
      orgNos: ['101641966'],
      orgPathNos: ['1047701', '1047702', '101641966'],
      phone: null
    })
  })

  it('falls back to orgNo when pathNo is missing', () => {
    expect(
      isAppVisibleToUser(
        { orgs: ['101641966'], userIds: [], phones: [] },
        { userName: 'L20184974', orgNos: ['101641966'], phone: null }
      )
    ).toBe(true)
  })

  it('keeps collaboration-platform as a system app and overlays OSS zip', () => {
    const merged = mergeSystemBundledCatalog([
      {
        id: 'demo-app',
        name: 'Demo',
        version: '1.0.0',
        slot: 'app-center',
        source: 'store',
        package: { kind: 'zip', downloadUrl: 'https://example.test/demo.zip' }
      },
      {
        id: 'collaboration-platform',
        name: '协同平台',
        version: '9.9.9',
        slot: 'app-center',
        source: 'builtin',
        auth: { orgs: [], userIds: [], phones: ['13800138000'] },
        package: {
          kind: 'zip',
          downloadUrl: 'https://example.test/collab.zip'
        }
      }
    ])
    expect(merged.map((item) => item.id)).toEqual(['collaboration-platform', 'demo-app'])
    expect(merged[0]?.version).toBe('9.9.9')
    expect(merged[0]?.source).toBe('builtin')
    expect(merged[0]?.slot).toBe('menu')
    expect(merged[0]?.package.downloadUrl).toBe('https://example.test/collab.zip')
    expect(merged[0]?.auth?.phones).toEqual(['13800138000'])
  })
})

describe('jiaorong app userinfo payload', () => {
  it('spreads persisted userInfo and overlays xkaitoken', async () => {
    const { buildUserInfoPayload } =
      await import('../../../src/jiaorong_src/appHost/main/userIdentity')
    expect(
      buildUserInfoPayload({
        token: 'xk-token',
        userInfo: JSON.stringify({
          userName: 'L20184974',
          orgList: [{ orgNo: '101641966' }]
        })
      })
    ).toEqual({
      userName: 'L20184974',
      orgList: [{ orgNo: '101641966' }],
      token: 'xk-token'
    })
  })

  it('returns null token when logged out', async () => {
    const { buildUserInfoPayload } =
      await import('../../../src/jiaorong_src/appHost/main/userIdentity')
    expect(buildUserInfoPayload(undefined)).toEqual({ token: null })
  })
})

describe('jiaorong remote app catalog', () => {
  afterEach(() => {
    resetRemoteAppCatalogForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays empty when the remote config cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )

    await ensureRemoteAppCatalog()
    expect(loadBuiltinAppCatalog()).toEqual([])
  })

  it('ignores OSS apps because the app catalog now comes from the list api', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          admins: ['L20184974'],
          apps: [
            {
              id: 'demo-workbench',
              name: '示例工作台',
              version: '0.0.29-dev',
              source: 'builtin',
              package: { kind: 'dir', builtinDir: 'demo-workbench' }
            }
          ]
        })
      }))
    )

    await ensureRemoteAppCatalog()
    expect(loadBuiltinAppCatalog()).toEqual([])
  })
})

describe('jiaorong local-debug scan gate', () => {
  it('keeps local-debug apps when the remote catalog is empty', async () => {
    const { combineRemoteAndLocalDebugApps } =
      await import('../../../src/jiaorong_src/appHost/main/scan')
    expect(
      combineRemoteAndLocalDebugApps(
        [],
        [
          {
            id: 'local-only',
            name: 'Local',
            version: '1.0.0',
            slot: 'menu',
            source: 'local-debug',
            enabled: true,
            auth: null,
            package: { kind: 'dir', builtinDir: 'local-only' }
          }
        ]
      ).map((item) => item.id)
    ).toEqual(['local-only'])
  })

  it('keeps local-debug extras when the remote catalog has apps', async () => {
    const { combineRemoteAndLocalDebugApps } =
      await import('../../../src/jiaorong_src/appHost/main/scan')
    const remote = [
      {
        id: 'demo-workbench',
        name: '示例工作台',
        version: '1.0.0',
        slot: 'menu' as const,
        source: 'builtin' as const,
        enabled: true,
        auth: null,
        package: { kind: 'zip' as const, downloadUrl: 'https://example.test/demo.zip' }
      }
    ]
    const localDebug = [
      {
        ...remote[0],
        id: 'local-only',
        version: '0.0.1',
        name: 'Local',
        source: 'local-debug' as const,
        package: { kind: 'dir' as const, builtinDir: 'local-only' }
      }
    ]
    expect(combineRemoteAndLocalDebugApps(remote, localDebug).map((item) => item.id)).toEqual([
      'demo-workbench',
      'local-only'
    ])
  })

  it('does not invent catalog apps from the repo; store items stay installable', async () => {
    const { catalogRecordHasInstallSource } =
      await import('../../../src/jiaorong_src/appHost/main/scan')
    expect(
      catalogRecordHasInstallSource({
        id: 'app-scaffold',
        name: '应用脚手架',
        version: '0.0.29-dev',
        slot: 'menu',
        source: 'store',
        enabled: true,
        auth: { orgs: ['101641966'], userIds: [] },
        package: { kind: 'zip', downloadUrl: 'https://example.test/app.zip' }
      })
    ).toBe(true)
  })
})
