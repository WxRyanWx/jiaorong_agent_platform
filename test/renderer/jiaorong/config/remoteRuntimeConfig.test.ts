import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG,
  fetchJiaorongRemoteRuntimeConfig,
  JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS,
  parseJiaorongRemoteRuntimeConfig,
  resetJiaorongRemoteRuntimeConfigForTests,
  setJiaorongRemoteRuntimeConfigRetryPolicyForTests,
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig,
  waitJiaorongRemoteRuntimeConfigBurstForTests,
  whenJiaorongRemoteRuntimeConfigFirstAttemptSettled,
  type JiaorongRemoteRuntimeConfig
} from '@jiaorong/config/remoteRuntimeConfig'

describe('jiaorong remote runtime config', () => {
  afterEach(() => {
    resetJiaorongRemoteRuntimeConfigForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses admins and apps and drops empty or duplicate ids', () => {
    expect(
      parseJiaorongRemoteRuntimeConfig({
        schemaVersion: 1,
        admins: [' 13039619789 ', 'L20184974', '', 'L20184974', 12],
        apps: [{ id: 'demo-workbench' }]
      })
    ).toEqual({
      schemaVersion: 1,
      admins: ['13039619789', 'L20184974'],
      apps: [{ id: 'demo-workbench' }]
    })
  })

  it('returns an empty config for invalid payloads', () => {
    expect(parseJiaorongRemoteRuntimeConfig(null)).toEqual(EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG)
    expect(parseJiaorongRemoteRuntimeConfig('nope')).toEqual(EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG)
    expect(parseJiaorongRemoteRuntimeConfig({ admins: 'x' })).toEqual({
      schemaVersion: 1,
      admins: [],
      apps: []
    })
  })

  it('returns an empty config when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )

    await expect(fetchJiaorongRemoteRuntimeConfig()).resolves.toEqual(
      EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG
    )
  })

  it('returns an empty config when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ admins: ['should-not-apply'] })
      }))
    )

    await expect(fetchJiaorongRemoteRuntimeConfig()).resolves.toEqual(
      EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG
    )
  })

  it('retries failed fetches three times and then applies a later success', async () => {
    resetJiaorongRemoteRuntimeConfigForTests()
    setJiaorongRemoteRuntimeConfigRetryPolicyForTests({
      retryDelaysMs: [0, 0],
      backgroundRetryMs: 60_000
    })
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls < JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS) {
          throw new Error('offline')
        }
        return {
          ok: true,
          json: async () => ({ admins: ['13039619789'], apps: [] })
        }
      })
    )

    const seen: string[][] = []
    subscribeJiaorongRemoteRuntimeConfig((config) => {
      seen.push(config.admins)
    })
    startJiaorongRemoteRuntimeConfigSync()
    await whenJiaorongRemoteRuntimeConfigFirstAttemptSettled()
    expect(seen).toEqual([])
    await waitJiaorongRemoteRuntimeConfigBurstForTests()
    expect(calls).toBe(JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS)
    expect(seen).toEqual([['13039619789']])
  })

  it('treats HTTP 200 empty payload as success and does not keep retrying', async () => {
    resetJiaorongRemoteRuntimeConfigForTests()
    setJiaorongRemoteRuntimeConfigRetryPolicyForTests({
      retryDelaysMs: [0, 0],
      backgroundRetryMs: 60_000
    })
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ schemaVersion: 1, admins: [], apps: [] })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const seen: JiaorongRemoteRuntimeConfig[] = []
    subscribeJiaorongRemoteRuntimeConfig((config) => {
      seen.push(config)
    })
    startJiaorongRemoteRuntimeConfigSync()
    await waitJiaorongRemoteRuntimeConfigBurstForTests()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG])
  })

  it('keeps retrying in the background after the first three failures', async () => {
    resetJiaorongRemoteRuntimeConfigForTests()
    setJiaorongRemoteRuntimeConfigRetryPolicyForTests({
      retryDelaysMs: [0, 0],
      backgroundRetryMs: 20
    })
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls < 4) throw new Error('offline')
        return {
          ok: true,
          json: async () => ({ admins: ['L20184974'], apps: [] })
        }
      })
    )

    const seen: string[][] = []
    subscribeJiaorongRemoteRuntimeConfig((config) => {
      seen.push(config.admins)
    })
    startJiaorongRemoteRuntimeConfigSync()
    await waitJiaorongRemoteRuntimeConfigBurstForTests()
    expect(seen).toEqual([])
    await vi.waitFor(() => {
      expect(seen).toEqual([['L20184974']])
    })
    expect(calls).toBe(4)
  })
})
