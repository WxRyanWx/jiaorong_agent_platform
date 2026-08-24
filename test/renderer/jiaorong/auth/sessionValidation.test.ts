import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { featchUserInfoMock, getTokenMock } = vi.hoisted(() => ({
  featchUserInfoMock: vi.fn(),
  getTokenMock: vi.fn()
}))

vi.mock('@jiaorong/api/auth', () => ({
  FeatchUserInfo: featchUserInfoMock
}))

vi.mock('../../../../src/jiaorong_src/auth/lib/local-user', () => ({
  getToken: getTokenMock,
  clearOutLocal: vi.fn(),
  setUserInfoRecords: vi.fn()
}))

import {
  AUTH_SESSION_CHECK_TIMEOUT_MS,
  ensureAuthSessionValidated,
  forceRevalidateAuthSession,
  resetAuthSessionValidation,
  scheduleAuthRevalidateOnMenuSwitch
} from '../../../../src/jiaorong_src/auth/lib/session'

describe('auth session validation', () => {
  beforeEach(() => {
    resetAuthSessionValidation()
    featchUserInfoMock.mockReset()
    getTokenMock.mockReset()
    getTokenMock.mockReturnValue('token')
  })

  afterEach(() => {
    resetAuthSessionValidation()
  })

  it('uses short timeout for session userInfo checks', async () => {
    featchUserInfoMock.mockResolvedValue({ code: 8000000, data: { id: '1' } })
    await ensureAuthSessionValidated()
    expect(featchUserInfoMock).toHaveBeenCalledWith(undefined, {
      silent: true,
      timeout: AUTH_SESSION_CHECK_TIMEOUT_MS
    })
  })

  it('scheduleAuthRevalidateOnMenuSwitch allows navigation immediately when token exists', async () => {
    let resolveInfo!: (value: unknown) => void
    featchUserInfoMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInfo = resolve
      })
    )

    const onUnauthorized = vi.fn()
    const allowed = scheduleAuthRevalidateOnMenuSwitch(onUnauthorized)
    expect(allowed).toBe(true)
    expect(onUnauthorized).not.toHaveBeenCalled()

    resolveInfo({ code: 8000000, data: { id: '1' } })
    await forceRevalidateAuthSession()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('scheduleAuthRevalidateOnMenuSwitch redirects when token missing', () => {
    getTokenMock.mockReturnValue('')
    const onUnauthorized = vi.fn()
    expect(scheduleAuthRevalidateOnMenuSwitch(onUnauthorized)).toBe(false)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(featchUserInfoMock).not.toHaveBeenCalled()
  })
})
