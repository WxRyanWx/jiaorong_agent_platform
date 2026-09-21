import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearOpenInfoHandoff,
  stashOpenInfo,
  takeOpenInfo
} from '@jiaorong/appHost/renderer/openAppHandoff'
import type { JiaorongAppOpenInfo } from '@jiaorong/appHost/types'

/**
 * 造一条打开信息。
 * @param appId 应用 id
 */
function makeOpenInfo(appId: string): JiaorongAppOpenInfo {
  return {
    appId,
    src: `jiaorong-app://${appId}/index.html`,
    preload: 'file:///preload.mjs',
    partition: `persist:${appId}`
  }
}

describe('open app handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearOpenInfoHandoff()
  })

  afterEach(() => {
    vi.useRealTimers()
    clearOpenInfoHandoff()
  })

  it('returns null when nothing was stashed', () => {
    expect(takeOpenInfo('app-scaffold')).toBeNull()
  })

  it('hands the stashed info over exactly once', () => {
    const info = makeOpenInfo('app-scaffold')
    stashOpenInfo(info)

    expect(takeOpenInfo('app-scaffold')).toEqual(info)
    expect(takeOpenInfo('app-scaffold')).toBeNull()
  })

  it('keeps entries per app id', () => {
    stashOpenInfo(makeOpenInfo('app-a'))

    expect(takeOpenInfo('app-b')).toBeNull()
    expect(takeOpenInfo('app-a')?.appId).toBe('app-a')
  })

  it('drops a stale entry instead of reusing it', () => {
    stashOpenInfo(makeOpenInfo('app-scaffold'))
    vi.advanceTimersByTime(61_000)

    expect(takeOpenInfo('app-scaffold')).toBeNull()
  })

  it('clears every pending entry on auth change', () => {
    stashOpenInfo(makeOpenInfo('app-a'))
    stashOpenInfo(makeOpenInfo('app-b'))
    clearOpenInfoHandoff()

    expect(takeOpenInfo('app-a')).toBeNull()
    expect(takeOpenInfo('app-b')).toBeNull()
  })
})
