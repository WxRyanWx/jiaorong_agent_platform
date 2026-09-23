import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refreshAuthToken = vi.hoisted(() => vi.fn())

vi.mock('@jiaorong/api/auth/loginApi', () => ({ refreshAuthToken }))
vi.mock('@api/ConfigClient', () => ({ createConfigClient: () => null }))

import {
  readTokenExpMs,
  renewToken,
  shouldRenewToken,
  startTokenRenewalScheduler,
  stopTokenRenewalScheduler
} from '../../../../src/jiaorong_src/auth/lib/tokenRenewal'

const DAY_MS = 24 * 60 * 60 * 1000

/** 造一个带 exp 的 JWT（payload 含中文，验证 UTF-8 解码） */
const makeJwt = (expMs: number) => {
  const payload = { sub: '1', exp: Math.floor(expMs / 1000), username: '测试' }
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const body = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `eyJhbGciOiJIUzI1NiJ9.${body}.sig`
}

describe('token renewal', () => {
  beforeEach(() => {
    localStorage.clear()
    refreshAuthToken.mockReset()
  })

  afterEach(() => {
    stopTokenRenewalScheduler()
  })

  it('does not renew without a local token', () => {
    expect(shouldRenewToken()).toBe(false)
  })

  it('reads exp from a JWT payload', () => {
    const expMs = Date.now() + 2 * DAY_MS
    expect(readTokenExpMs(makeJwt(expMs))).toBe(Math.floor(expMs / 1000) * 1000)
    expect(readTokenExpMs('not-a-jwt')).toBeNull()
  })

  it('renews a JWT when less than 5 days remain', () => {
    localStorage.setItem('xkaitoken', makeJwt(Date.now() + 6 * DAY_MS))
    expect(shouldRenewToken()).toBe(false)
    localStorage.setItem('xkaitoken', makeJwt(Date.now() + 4 * DAY_MS))
    expect(shouldRenewToken()).toBe(true)
  })

  it('renews an already expired JWT (refresh decides grace)', () => {
    localStorage.setItem('xkaitoken', makeJwt(Date.now() - 60 * 60 * 1000))
    expect(shouldRenewToken()).toBe(true)
  })

  it('falls back to issued time bookkeeping for non-JWT tokens', () => {
    localStorage.setItem('xkaitoken', 'opaque-token')
    expect(shouldRenewToken()).toBe(true)
    localStorage.setItem('xkaitokenIssuedAt', String(Date.now() - DAY_MS))
    expect(shouldRenewToken()).toBe(false)
    localStorage.setItem('xkaitokenIssuedAt', String(Date.now() - 3 * DAY_MS))
    expect(shouldRenewToken()).toBe(true)
  })

  it('saves the new token from the confirmed envelope and stamps issued time', async () => {
    localStorage.setItem('xkaitoken', 'opaque-token')
    refreshAuthToken.mockResolvedValue({
      code: 8000000,
      message: 'SUCCESS',
      success: true,
      data: { userName: 'L20184974', access_token: 't2' }
    })
    await expect(renewToken()).resolves.toBe('t2')
    expect(localStorage.getItem('xkaitoken')).toBe('t2')
    expect(Number(localStorage.getItem('xkaitokenIssuedAt'))).toBeGreaterThan(0)
  })

  it('shares one refresh request across concurrent renewals', async () => {
    localStorage.setItem('xkaitoken', 'opaque-token')
    refreshAuthToken.mockResolvedValue({ code: 8000000, data: { access_token: 't2' } })
    await Promise.all([renewToken(), renewToken()])
    expect(refreshAuthToken).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('xkaitoken')).toBe('t2')
  })

  it('rechecks immediately when the window becomes visible again', async () => {
    localStorage.setItem('xkaitoken', makeJwt(Date.now() + 6 * DAY_MS))
    refreshAuthToken.mockResolvedValue({ code: 8000000, data: { access_token: 't2' } })
    startTokenRenewalScheduler()
    expect(refreshAuthToken).not.toHaveBeenCalled()
    // 进入续期窗口后，回前台事件应立即触发检查
    localStorage.setItem('xkaitoken', makeJwt(Date.now() + 4 * DAY_MS))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(refreshAuthToken).toHaveBeenCalled())
    stopTokenRenewalScheduler()
  })

  it('rejects without touching storage when refresh returns no token', async () => {
    localStorage.setItem('xkaitoken', 'opaque-token')
    refreshAuthToken.mockResolvedValue({ code: 500, data: null })
    await expect(renewToken()).rejects.toThrow()
    expect(localStorage.getItem('xkaitoken')).toBe('opaque-token')
  })
})
