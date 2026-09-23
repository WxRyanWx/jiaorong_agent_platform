import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { api } from '../../../../src/jiaorong_src/api/auth/interceptors'
import { setupAuthInterceptors } from '../../../../src/jiaorong_src/auth/lib/setup'
import { stopTokenRenewalScheduler } from '../../../../src/jiaorong_src/auth/lib/tokenRenewal'

vi.mock('@api/ConfigClient', () => ({ createConfigClient: () => null }))

/** 最小 router：setup 只用到 push */
const router = { push: vi.fn() } as unknown as Parameters<typeof setupAuthInterceptors>[0]

function okResponse(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return { data, status: 200, statusText: 'OK', headers: {} as never, config }
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  /** 401 响应体 */
  const response = {
    data: {},
    status: 401,
    statusText: 'Unauthorized',
    headers: {} as never,
    config
  } as AxiosResponse
  return new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, {}, response)
}

describe('auth bootstrap renewal wiring', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('xkaitoken', 't1')
    router.push.mockClear()
  })

  afterEach(() => {
    stopTokenRenewalScheduler()
    api.interceptors.response.clear()
    api.defaults.adapter = undefined
  })

  it('stamps issuedAt on the startup renew (interceptors registered before scheduler)', async () => {
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) =>
      okResponse(config, { code: 8000000, data: { access_token: 't2' } })
    setupAuthInterceptors(router)
    await vi.waitFor(() => {
      expect(localStorage.getItem('xkaitoken')).toBe('t2')
    })
    expect(Number(localStorage.getItem('xkaitokenIssuedAt'))).toBeGreaterThan(0)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('resolves the original caller after a 401 renew replay', async () => {
    /** 业务请求计数：第一次 401，重放后成功 */
    let businessCalls = 0
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/token/refresh') {
        return okResponse(config, { code: 8000000, data: { access_token: 't2' } })
      }
      businessCalls += 1
      if (businessCalls === 1) throw unauthorized(config)
      return okResponse(config, { code: 8000000, data: { ok: true } })
    }
    setupAuthInterceptors(router)
    await expect(api.get('/biz')).resolves.toEqual({ code: 8000000, data: { ok: true } })
    expect(businessCalls).toBe(2)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('clears session and redirects login when startup renew is rejected with 401', async () => {
    api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw unauthorized(config)
    }
    setupAuthInterceptors(router)
    await vi.waitFor(() => {
      expect(router.push).toHaveBeenCalledWith({ name: 'login' })
    })
    expect(localStorage.getItem('xkaitoken')).toBeNull()
  })
})
