import { describe, expect, it } from 'vitest'
import {
  isAppVisibleToUser,
  readUserIdentityFromUserInfo
} from '../../../src/jiaorong_src/appHost/auth'
import { mergeAppCatalogs, parseAppCatalogFile } from '../../../src/jiaorong_src/appHost/catalog'

describe('jiaorong app catalog auth', () => {
  const user = {
    userName: 'L20184974',
    orgNos: ['101641966', '101231266']
  }

  it('shows everyone when auth is missing or empty', () => {
    expect(isAppVisibleToUser(null, { userName: null, orgNos: [] })).toBe(true)
    expect(isAppVisibleToUser({ orgs: [], userIds: [] }, user)).toBe(true)
  })

  it('matches userName as userid or any orgNo', () => {
    expect(isAppVisibleToUser({ orgs: ['101641966'], userIds: [] }, user)).toBe(true)
    expect(isAppVisibleToUser({ orgs: ['nope'], userIds: ['L20184974'] }, user)).toBe(true)
    expect(isAppVisibleToUser({ orgs: ['nope'], userIds: ['other'] }, user)).toBe(false)
  })

  it('reads userName and orgList.orgNo from userInfo', () => {
    expect(
      readUserIdentityFromUserInfo({
        userName: 'L20184974',
        orgList: [{ orgNo: '101641966', name: 'AI中心业务组' }]
      })
    ).toEqual({
      userName: 'L20184974',
      orgNos: ['101641966']
    })
  })

  it('lets store catalog override builtin auth and version', () => {
    const builtin = parseAppCatalogFile({
      apps: [
        {
          id: 'demo-workbench',
          name: '示例工作台',
          version: '0.0.1-dev',
          source: 'builtin',
          auth: { orgs: ['old'], userIds: [] },
          package: { kind: 'dir', builtinDir: 'demo-workbench' }
        }
      ]
    })
    const merged = mergeAppCatalogs(builtin, [
      {
        ...builtin[0],
        source: 'store',
        version: '1.0.0',
        auth: { orgs: ['101641966'], userIds: ['L20184974'] },
        package: {
          kind: 'zip',
          builtinDir: 'demo-workbench',
          downloadUrl: 'https://example.test/demo.zip'
        }
      }
    ])
    expect(merged[0]?.version).toBe('1.0.0')
    expect(merged[0]?.source).toBe('store')
    expect(merged[0]?.auth?.orgs).toEqual(['101641966'])
    expect(merged[0]?.package.downloadUrl).toBe('https://example.test/demo.zip')
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
