import { describe, expect, it, vi } from 'vitest'
import type { AxiosError } from 'axios'
import { responseErrorFn } from '../../../../src/jiaorong_src/api/auth/interceptors'

vi.mock('../../../../src/jiaorong_src/api/auth/utils/local', () => ({
  clearAuthStorage: vi.fn()
}))

import { clearAuthStorage } from '../../../../src/jiaorong_src/api/auth/utils/local'

function makeError(status: number, code?: number): AxiosError {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'error',
    toJSON: () => ({}),
    response: {
      status,
      data: code == null ? {} : { code, message: 'biz' },
      statusText: '',
      headers: {},
      config: {} as never
    }
  } as AxiosError
}

describe('auth responseErrorFn', () => {
  it('clears auth only on HTTP 401', async () => {
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(401), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(2)
  })

  it('does not clear auth on ordinary business error codes', async () => {
    vi.mocked(clearAuthStorage).mockClear()
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(500, 500001), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(3)
    expect(cb).not.toHaveBeenCalledWith(2)
  })

  it('redirects login without clear for -8000150', async () => {
    vi.mocked(clearAuthStorage).mockClear()
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(403, -8000150), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(1)
    expect(cb).toHaveBeenCalledWith(3)
  })
})
