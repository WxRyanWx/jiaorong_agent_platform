import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSetting = vi.hoisted(() => vi.fn())
const setSetting = vi.hoisted(() => vi.fn())

vi.mock('@api/ConfigClient', () => ({
  createConfigClient: () => ({
    getSetting,
    setSetting
  })
}))

import {
  clearPersistedAuthSession,
  hydrateAuthSessionFromConfig,
  persistAuthSession,
  schedulePersistAuthSession
} from '../../../../src/jiaorong_src/auth/lib/persist'

describe('auth session persist', () => {
  beforeEach(() => {
    localStorage.clear()
    getSetting.mockReset()
    setSetting.mockReset()
    setSetting.mockResolvedValue(undefined)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('restores token from config when localStorage is empty', async () => {
    getSetting.mockResolvedValue({
      token: 'persisted-token',
      userInfo: '{"id":"1"}',
      userFullInfo: '{"id":"1"}'
    })

    await hydrateAuthSessionFromConfig()

    expect(localStorage.getItem('xkaitoken')).toBe('persisted-token')
    expect(localStorage.getItem('userInfo')).toBe('{"id":"1"}')
  })

  it('does not overwrite an existing local token', async () => {
    localStorage.setItem('xkaitoken', 'local-token')
    getSetting.mockResolvedValue({ token: 'persisted-token' })

    await hydrateAuthSessionFromConfig()

    expect(localStorage.getItem('xkaitoken')).toBe('local-token')
    expect(setSetting).toHaveBeenCalledWith('jiaorong_auth_session', {
      token: 'local-token',
      userInfo: undefined,
      userFullInfo: undefined
    })
  })

  it('writes the current local session to config', async () => {
    localStorage.setItem('xkaitoken', 'live-token')
    schedulePersistAuthSession()
    await persistAuthSession()

    expect(setSetting).toHaveBeenCalledWith('jiaorong_auth_session', {
      token: 'live-token',
      userInfo: undefined,
      userFullInfo: undefined
    })
  })

  it('clears the persisted session', async () => {
    await clearPersistedAuthSession()
    expect(setSetting).toHaveBeenCalledWith('jiaorong_auth_session', { token: '' })
  })

  it('does not let an earlier persist overwrite a later clear', async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    setSetting.mockImplementation(async (_key: string, value: { token?: string }) => {
      if (value.token === 'old-token') {
        order.push('persist-start')
        await firstGate
        order.push('persist-end')
        return
      }
      order.push('clear')
    })

    localStorage.setItem('xkaitoken', 'old-token')
    schedulePersistAuthSession()
    await Promise.resolve()
    await Promise.resolve()
    const cleared = clearPersistedAuthSession()
    releaseFirst()
    await cleared

    expect(order).toEqual(['persist-start', 'persist-end', 'clear'])
    expect(setSetting).toHaveBeenLastCalledWith('jiaorong_auth_session', { token: '' })
  })

  it('writes the latest localStorage snapshot after an earlier persist starts', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    setSetting.mockImplementation(
      async (_key: string, value: { token?: string; userInfo?: string }) => {
        if (value.token === 'old-token' && !value.userInfo) {
          await firstGate
        }
      }
    )

    localStorage.setItem('xkaitoken', 'old-token')
    schedulePersistAuthSession()
    await Promise.resolve()
    await Promise.resolve()
    localStorage.setItem('userInfo', '{"id":"2"}')
    const latest = persistAuthSession()
    releaseFirst()
    await latest

    expect(setSetting).toHaveBeenLastCalledWith('jiaorong_auth_session', {
      token: 'old-token',
      userInfo: '{"id":"2"}',
      userFullInfo: undefined
    })
  })
})
