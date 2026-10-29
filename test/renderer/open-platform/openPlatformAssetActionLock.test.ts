import { afterEach, describe, expect, it } from 'vitest'
import {
  assetActionFlightVersion,
  buildAssetActionKey,
  isAssetActionInFlight,
  resetAssetActionLockForTests,
  runExclusiveAssetAction
} from '../../../src/jiaorong_src/open-platform/renderer/assetActionLock'

/** 手动收口的延迟任务。 */
function createDeferredTask() {
  /** 任务执行次数。 */
  let runs = 0
  /** 放行函数；调用后任务才结束。 */
  let release: (value: boolean) => void = () => {}
  /** 任务 promise。 */
  const done = new Promise<boolean>((resolve) => {
    release = resolve
  })
  const task = async () => {
    runs += 1
    return done
  }
  return {
    task,
    release,
    get runs() {
      return runs
    }
  }
}

describe('open platform asset action lock', () => {
  afterEach(() => {
    resetAssetActionLockForTests()
  })

  it('scopes keys by asset type and id', () => {
    expect(buildAssetActionKey('skill', ' demo ')).toBe('skill:demo')
    expect(buildAssetActionKey('connector', 'demo')).not.toBe(buildAssetActionKey('skill', 'demo'))
  })

  it('reuses one in-flight publish when the same asset is submitted twice', async () => {
    const deferred = createDeferredTask()
    const key = buildAssetActionKey('skill', 'demo-skill')
    const first = runExclusiveAssetAction(key, deferred.task)
    const second = runExclusiveAssetAction(key, deferred.task)

    // 面板切走再切回，本地 loading 已丢，仍要能看出这条资产在忙
    expect(isAssetActionInFlight(key)).toBe(true)
    const versionWhileRunning = assetActionFlightVersion.value
    deferred.release(true)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    // 只发一份请求
    expect(deferred.runs).toBe(1)
    expect(isAssetActionInFlight(key)).toBe(false)
    // 渲染侧 computed 依赖这个版本号才能重新求值
    expect(assetActionFlightVersion.value).toBeGreaterThan(versionWhileRunning)
  })

  it('keeps actions of different assets independent', async () => {
    const left = createDeferredTask()
    const right = createDeferredTask()
    const leftRun = runExclusiveAssetAction(buildAssetActionKey('skill', 'a'), left.task)
    const rightRun = runExclusiveAssetAction(buildAssetActionKey('connector', 'b'), right.task)

    left.release(true)
    right.release(true)
    await Promise.all([leftRun, rightRun])

    expect(left.runs).toBe(1)
    expect(right.runs).toBe(1)
  })

  it('releases the lock when the action throws', async () => {
    const key = buildAssetActionKey('connector', 'boom')
    await expect(
      runExclusiveAssetAction(key, async () => {
        throw new Error('publish failed')
      })
    ).rejects.toThrow('publish failed')

    expect(isAssetActionInFlight(key)).toBe(false)
  })
})
