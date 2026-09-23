import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import {
  api,
  responseErrorFn,
  setAuthRenewHandler
} from '../../../../src/jiaorong_src/api/auth/interceptors'

vi.mock('../../../../src/jiaorong_src/api/auth/utils/local', () => ({
  clearAuthStorage: vi.fn()
}))

import { clearAuthStorage } from '../../../../src/jiaorong_src/api/auth/utils/local'

function makeError(status: number, config?: Record<string, unknown>): AxiosError {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'error',
    toJSON: () => ({}),
    config: config as InternalAxiosRequestConfig,
    response: {
      status,
      data: {},
      statusText: '',
      headers: {},
      config: {} as never
    }
  } as AxiosError
}

describe('auth 401 silent renew retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    setAuthRenewHandler(null)
    vi.useRealTimers()
    vi.mocked(clearAuthStorage).mockClear()
    vi.restoreAllMocks()
  })

  it('renews and replays the original request on 401', async () => {
    setAuthRenewHandler(() => Promise.resolve('t2'))
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue('replayed')
    const cb = vi.fn()
    /** 原请求配置 */
    const config: Record<string, unknown> = { url: '/sys-user/userInfo' }
    await expect(responseErrorFn(makeError(401, config), cb)).resolves.toBe('replayed')
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(config).toMatchObject({ authRetried: true })
    expect(cb).not.toHaveBeenCalled()
    expect(clearAuthStorage).not.toHaveBeenCalled()
  })

  it('keeps login state when renew fails transiently', async () => {
    setAuthRenewHandler(() => Promise.reject(new Error('network')))
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(401, { url: '/x' }), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).not.toHaveBeenCalled()
    expect(cb).not.toHaveBeenCalled()
  })

  it('silently rejects non-401 errors from the refresh request', async () => {
    const cb = vi.fn()
    await expect(
      responseErrorFn(makeError(500, { authRefreshRequest: true }), cb)
    ).rejects.toBeTruthy()
    expect(cb).not.toHaveBeenCalled()
    expect(clearAuthStorage).not.toHaveBeenCalled()
  })

  it('treats renew 401 as expired and clears auth', async () => {
    setAuthRenewHandler(() => Promise.reject(makeError(401)))
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(401, { url: '/x' }), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(5)
    await vi.advanceTimersByTimeAsync(3000)
  })

  it('falls back to expired path when the request already retried', async () => {
    setAuthRenewHandler(() => Promise.resolve('t2'))
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(401, { authRetried: true }), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(5)
    await vi.advanceTimersByTimeAsync(3000)
  })
})
