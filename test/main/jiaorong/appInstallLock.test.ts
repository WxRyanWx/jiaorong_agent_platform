import { afterEach, describe, expect, it } from 'vitest'
import {
  isAppInstallInFlight,
  resetAppInstallLockForTests,
  runExclusiveAppInstall
} from '../../../src/jiaorong_src/appHost/appCenter/main/appInstallLock'

/** 手动收口的延迟任务。 */
function createDeferredTask() {
  /** 任务执行次数。 */
  let runs = 0
  /** 放行函数；调用后任务才结束。 */
  let release: (value: { ok: boolean; message?: string }) => void = () => {}
  /** 任务 promise。 */
  const done = new Promise<{ ok: boolean; message?: string }>((resolve) => {
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

describe('app center install lock', () => {
  afterEach(() => {
    resetAppInstallLockForTests()
  })

  it('reuses one in-flight install when the same app is requested twice', async () => {
    const deferred = createDeferredTask()
    const first = runExclusiveAppInstall('demo-app', deferred.task)
    const second = runExclusiveAppInstall('demo-app', deferred.task)

    // 安装在飞：列表据此显示「安装中」
    expect(isAppInstallInFlight('demo-app')).toBe(true)
    deferred.release({ ok: true })

    await expect(first).resolves.toEqual({ ok: true })
    await expect(second).resolves.toEqual({ ok: true })
    // 只下载 / 解压一次
    expect(deferred.runs).toBe(1)
    expect(isAppInstallInFlight('demo-app')).toBe(false)
  })

  it('runs a new install after the previous one settled', async () => {
    const first = createDeferredTask()
    first.release({ ok: true })
    await runExclusiveAppInstall('demo-app', first.task)

    const second = createDeferredTask()
    second.release({ ok: false, message: 'download failed' })
    await expect(runExclusiveAppInstall('demo-app', second.task)).resolves.toEqual({
      ok: false,
      message: 'download failed'
    })
    expect(second.runs).toBe(1)
  })

  it('keeps installs of different apps independent', async () => {
    const left = createDeferredTask()
    const right = createDeferredTask()
    const leftRun = runExclusiveAppInstall('app-a', left.task)
    const rightRun = runExclusiveAppInstall('app-b', right.task)

    expect(isAppInstallInFlight('app-a')).toBe(true)
    expect(isAppInstallInFlight('app-b')).toBe(true)
    left.release({ ok: true })
    right.release({ ok: true })
    await Promise.all([leftRun, rightRun])

    expect(left.runs).toBe(1)
    expect(right.runs).toBe(1)
  })

  it('releases the lock when the install throws', async () => {
    await expect(
      runExclusiveAppInstall('demo-app', async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')

    expect(isAppInstallInFlight('demo-app')).toBe(false)
  })
})
