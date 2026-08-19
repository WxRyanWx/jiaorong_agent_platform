import { describe, expect, it } from 'vitest'
import {
  AUTH_API_PROD_ORIGIN,
  AUTH_API_PROD_PRODUCT_ID,
  AUTH_API_TEST_ORIGIN,
  AUTH_API_TEST_PRODUCT_ID,
  listJiaorongPrivateApiCorsUrls,
  resolveAuthApiOrigin,
  resolveAuthProductId
} from '@jiaorong/api/auth/config'

describe('auth api env config', () => {
  it('maps development and test to the test origin and Product-Id', () => {
    expect(resolveAuthApiOrigin('development')).toBe(AUTH_API_TEST_ORIGIN)
    expect(resolveAuthApiOrigin('test')).toBe(AUTH_API_TEST_ORIGIN)
    expect(resolveAuthProductId('development')).toBe(AUTH_API_TEST_PRODUCT_ID)
    expect(resolveAuthProductId('test')).toBe(AUTH_API_TEST_PRODUCT_ID)
  })

  it('maps production and unknown modes to the prod origin and Product-Id', () => {
    expect(resolveAuthApiOrigin('production')).toBe(AUTH_API_PROD_ORIGIN)
    expect(resolveAuthProductId('production')).toBe(AUTH_API_PROD_PRODUCT_ID)
    expect(resolveAuthApiOrigin('staging')).toBe(AUTH_API_PROD_ORIGIN)
    expect(resolveAuthProductId('staging')).toBe(AUTH_API_PROD_PRODUCT_ID)
  })

  it('scopes CORS filter urls to the current mode origin only', () => {
    expect(listJiaorongPrivateApiCorsUrls('development')).toEqual([`${AUTH_API_TEST_ORIGIN}/*`])
    expect(listJiaorongPrivateApiCorsUrls('production')).toEqual([`${AUTH_API_PROD_ORIGIN}/*`])
  })
})
