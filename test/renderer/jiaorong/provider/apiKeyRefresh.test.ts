import { afterEach, describe, expect, it, vi } from 'vitest'

type RefreshModule = typeof import('@jiaorong/provider/apiKeyRefresh')

/** 每个用例重新加载模块，清掉 inflight / appliedToken。 */
async function loadRefreshModule(): Promise<RefreshModule> {
  vi.resetModules()
  return import('@jiaorong/provider/apiKeyRefresh')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refreshJiaorongProviderApiKey', () => {
  it('requests a key and writes it to the provider', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    const requestApiKey = vi.fn().mockResolvedValue('glsk-new-key')
    const writeApiKey = vi.fn().mockResolvedValue(undefined)

    const result = await refreshJiaorongProviderApiKey({ requestApiKey, writeApiKey }, 'token-1')

    expect(result).toBe('glsk-new-key')
    expect(requestApiKey).toHaveBeenCalledTimes(1)
    expect(writeApiKey).toHaveBeenCalledWith('glsk-new-key')
  })

  it('clears the stored key once when there is no login token', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    const requestApiKey = vi.fn()
    const writeApiKey = vi.fn().mockResolvedValue(undefined)

    await expect(
      refreshJiaorongProviderApiKey({ requestApiKey, writeApiKey }, '')
    ).resolves.toBeNull()
    await refreshJiaorongProviderApiKey({ requestApiKey, writeApiKey }, '')

    expect(requestApiKey).not.toHaveBeenCalled()
    expect(writeApiKey).toHaveBeenCalledTimes(1)
    expect(writeApiKey).toHaveBeenCalledWith('')
  })

  it('keeps the existing key when the request fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    const requestApiKey = vi.fn().mockRejectedValue(new Error('network down'))
    const writeApiKey = vi.fn().mockResolvedValue(undefined)

    const result = await refreshJiaorongProviderApiKey({ requestApiKey, writeApiKey }, 'token-1')

    expect(result).toBeNull()
    expect(writeApiKey).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('retries clearing when the first clear write fails', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    const requestApiKey = vi.fn()
    const writeApiKey = vi
      .fn()
      .mockRejectedValueOnce(new Error('ipc down'))
      .mockResolvedValue(undefined)
    const deps = { requestApiKey, writeApiKey }

    await refreshJiaorongProviderApiKey(deps, '')
    await refreshJiaorongProviderApiKey(deps, '')

    expect(writeApiKey).toHaveBeenCalledTimes(2)
    expect(writeApiKey).toHaveBeenNthCalledWith(1, '')
    expect(writeApiKey).toHaveBeenNthCalledWith(2, '')
  })

  it('deduplicates concurrent refreshes and reuses the applied token', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    const requestApiKey = vi.fn().mockResolvedValue('glsk-first')
    const writeApiKey = vi.fn().mockResolvedValue(undefined)
    const deps = { requestApiKey, writeApiKey }

    const [first, second] = await Promise.all([
      refreshJiaorongProviderApiKey(deps, 'token-1'),
      refreshJiaorongProviderApiKey(deps, 'token-1')
    ])
    const third = await refreshJiaorongProviderApiKey(deps, 'token-1')

    expect([first, second, third]).toEqual(['glsk-first', 'glsk-first', 'glsk-first'])
    expect(requestApiKey).toHaveBeenCalledTimes(1)
  })

  it('drops a stale response when the login token changes mid-flight', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    let resolveFirst: (apiKey: string) => void = () => undefined
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve
    })
    const requestApiKey = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce('glsk-second-account')
    const writeApiKey = vi.fn().mockResolvedValue(undefined)
    const deps = { requestApiKey, writeApiKey }

    const stale = refreshJiaorongProviderApiKey(deps, 'token-1')
    await expect(refreshJiaorongProviderApiKey(deps, 'token-2')).resolves.toBe(
      'glsk-second-account'
    )
    resolveFirst('glsk-first-account')

    await expect(stale).resolves.toBeNull()
    expect(writeApiKey).toHaveBeenCalledTimes(1)
    expect(writeApiKey).toHaveBeenCalledWith('glsk-second-account')
  })

  it('skips a queued write after the account changes', async () => {
    const { refreshJiaorongProviderApiKey } = await loadRefreshModule()
    let releaseClear: () => void = () => undefined
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve
    })
    const requestApiKey = vi.fn().mockResolvedValueOnce('glsk-a').mockResolvedValueOnce('glsk-b')
    const writeApiKey = vi
      .fn()
      .mockImplementationOnce(() => clearGate)
      .mockResolvedValue(undefined)
    const deps = { requestApiKey, writeApiKey }

    // 占住写入队列
    const clearing = refreshJiaorongProviderApiKey(deps, '')
    // A 账号拿到 key 后排队，等待写入
    const stale = refreshJiaorongProviderApiKey(deps, 'token-a')
    await new Promise((resolve) => setTimeout(resolve, 0))
    // 写入前切到 B 账号
    const changed = refreshJiaorongProviderApiKey(deps, 'token-b')
    releaseClear()

    await clearing
    await expect(stale).resolves.toBeNull()
    await expect(changed).resolves.toBe('glsk-b')
    expect(writeApiKey).toHaveBeenCalledTimes(2)
    expect(writeApiKey).toHaveBeenNthCalledWith(1, '')
    expect(writeApiKey).toHaveBeenNthCalledWith(2, 'glsk-b')
  })
})
