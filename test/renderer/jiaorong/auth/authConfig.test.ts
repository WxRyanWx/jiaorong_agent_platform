import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_API_PROD_ORIGIN,
  AUTH_API_PROD_PRODUCT_ID,
  AUTH_API_TEST_ORIGIN,
  AUTH_API_TEST_PRODUCT_ID,
  isJiaorongPrivateApiUrl,
  listJiaorongPrivateApiCorsUrls,
  resolveAuthApiOrigin,
  resolveAuthEnv,
  resolveAuthProductId
} from '@jiaorong/api/auth/config'
import { resolveJiaorongPrivateApiHeaders } from '@jiaorong/api/auth/privateApiHeaders'

describe('auth api env config', () => {
  it('maps development and test to the test origin and Product-Id', () => {
    expect(resolveAuthApiOrigin('development')).toBe(AUTH_API_TEST_ORIGIN)
    expect(resolveAuthApiOrigin('test')).toBe(AUTH_API_TEST_ORIGIN)
    expect(resolveAuthProductId('development')).toBe(AUTH_API_TEST_PRODUCT_ID)
    expect(resolveAuthProductId('test')).toBe(AUTH_API_TEST_PRODUCT_ID)
    expect(resolveAuthEnv('development')).toBe('dev')
    expect(resolveAuthEnv('test')).toBe('dev')
  })

  it('maps production and unknown modes to the prod origin and Product-Id', () => {
    expect(resolveAuthApiOrigin('production')).toBe(AUTH_API_PROD_ORIGIN)
    expect(resolveAuthProductId('production')).toBe(AUTH_API_PROD_PRODUCT_ID)
    expect(resolveAuthApiOrigin('staging')).toBe(AUTH_API_PROD_ORIGIN)
    expect(resolveAuthProductId('staging')).toBe(AUTH_API_PROD_PRODUCT_ID)
    expect(resolveAuthEnv('production')).toBe('prod')
    expect(resolveAuthEnv('staging')).toBe('prod')
  })

  it('scopes CORS filter urls to the current mode origin only', () => {
    expect(listJiaorongPrivateApiCorsUrls('development')).toEqual([`${AUTH_API_TEST_ORIGIN}/*`])
    expect(listJiaorongPrivateApiCorsUrls('test')).toEqual([`${AUTH_API_TEST_ORIGIN}/*`])
    expect(listJiaorongPrivateApiCorsUrls('production')).toEqual([`${AUTH_API_PROD_ORIGIN}/*`])
  })

  it('only treats the current mode origin as a private api url', () => {
    expect(isJiaorongPrivateApiUrl(`${AUTH_API_TEST_ORIGIN}/api/deepchat-ext/assets`, 'test')).toBe(
      true
    )
    expect(isJiaorongPrivateApiUrl(AUTH_API_TEST_ORIGIN, 'test')).toBe(true)
    // 正式服地址在 test 模式下不算私有源，反过来也一样
    expect(isJiaorongPrivateApiUrl(`${AUTH_API_PROD_ORIGIN}/api/x`, 'test')).toBe(false)
    expect(isJiaorongPrivateApiUrl(`${AUTH_API_TEST_ORIGIN}/api/x`, 'production')).toBe(false)
    // 前缀相似的第三方域名不能蒙混过关
    expect(isJiaorongPrivateApiUrl(`${AUTH_API_TEST_ORIGIN}.evil.test/api/x`, 'test')).toBe(false)
    expect(isJiaorongPrivateApiUrl('https://oss.example.com/a.zip', 'test')).toBe(false)
    expect(isJiaorongPrivateApiUrl('   ', 'test')).toBe(false)
  })
})

describe('private api headers', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('attaches Fusion-Auth and Product-Id only for private api urls', () => {
    localStorage.setItem('xkaitoken', ' token-value ')
    const downloadUrl = `${AUTH_API_TEST_ORIGIN}/api/deepchat-ext/assets/skill/dev-god/package`

    expect(resolveJiaorongPrivateApiHeaders(downloadUrl)).toEqual({
      'Fusion-Auth': 'token-value',
      'Product-Id': resolveAuthProductId()
    })
    expect(resolveJiaorongPrivateApiHeaders('https://oss.example.com/a.zip')).toBeUndefined()
    // 未登录时不发空凭据头
    localStorage.removeItem('xkaitoken')
    expect(resolveJiaorongPrivateApiHeaders(downloadUrl)).toBeUndefined()
  })
})
