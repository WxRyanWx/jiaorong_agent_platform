import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(clearAuthStorage).mockClear()
  })

  it('clears auth on HTTP 401 and callbacks expired once', async () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(401), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).toHaveBeenCalled()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(5)

    cb.mockClear()
    await expect(responseErrorFn(makeError(401), cb)).rejects.toBeTruthy()
    expect(cb).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    await expect(responseErrorFn(makeError(401), cb)).rejects.toBeTruthy()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(5)
  })

  it('does not clear auth on ordinary business error codes', async () => {
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(500, 500001), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(3)
    expect(cb).not.toHaveBeenCalledWith(2)
    expect(cb).not.toHaveBeenCalledWith(5)
  })

  it('treats 200 and 8000000 as auth API success codes', async () => {
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(400, 200), cb)).rejects.toBeTruthy()
    expect(cb).toHaveBeenCalledWith(4)
    cb.mockClear()
    await expect(responseErrorFn(makeError(400, 8000000), cb)).rejects.toBeTruthy()
    expect(cb).toHaveBeenCalledWith(4)
  })

  it('redirects login without clear for -8000150', async () => {
    const cb = vi.fn()
    await expect(responseErrorFn(makeError(403, -8000150), cb)).rejects.toBeTruthy()
    expect(clearAuthStorage).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(1)
    expect(cb).toHaveBeenCalledWith(3)
  })
})
