/** 启动 / 登录后用统一私有 API 换取内置 Jiaorong 服务商 key。 */

import { createProviderClient } from '@api/ProviderClient'
import { createStartupClient } from '@api/StartupClient'
import { JIAORONG_DEFAULT_PROVIDER_ID } from '@jiaorong/brand'
import { requestModelCenterApiKey } from '../api/modelCenter'
import { resolveJiaorongCompatibleBaseUrl } from '../api/auth/config'
import { getToken } from '../auth/lib/local-user'
import { JIAORONG_AUTH_SESSION_CHANGED_EVENT } from '../auth/lib/sessionEvents'

type JiaorongApiKeyRefreshDeps = {
  /** 调 model-center 换 key。 */
  requestApiKey: () => Promise<string>
  /** 写入 Jiaorong 服务商 key，空串表示清除；同时校准当前环境 baseUrl。 */
  writeApiKey: (apiKey: string) => Promise<void>
}

/** 同一 token 的并发刷新只保留一条请求。 */
let inflight: { token: string; promise: Promise<string | null> } | null = null
/** 最近一次成功写入的 token 与 key，避免冷启动补写会话时重复建 key。 */
let appliedToken = ''
let lastAppliedKey = ''
/** 无 token 时只清一次，避免每次启动都写 provider。 */
let clearedWithoutToken = false
/** 事件监听只注册一次。 */
let started = false
/** provider 写入串行化，避免登录后的新 key 被启动时的清空操作覆盖。 */
let writeQueue: Promise<unknown> = Promise.resolve()
/** 刷新代次：登录 / 退出后，旧请求回来时不再写入 provider。 */
let generation = 0
/** 同一启动只由一个窗口发起换 key，避免新开窗口重复建 key。 */
const REFRESH_RUN_STORAGE_KEY = 'jiaorongApiKeyRefreshRunId'

/** 默认实现：私有 API + 现有 provider 写接口。 */
function createDefaultDeps(): JiaorongApiKeyRefreshDeps {
  return {
    requestApiKey: requestModelCenterApiKey,
    writeApiKey: async (apiKey) => {
      await createProviderClient().updateProviderAtomic(JIAORONG_DEFAULT_PROVIDER_ID, {
        apiKey,
        baseUrl: resolveJiaorongCompatibleBaseUrl()
      })
    }
  }
}

/**
 * 只保留可定位的错误信息，避免把请求头里的 token / key 带进日志。
 * @param error 原始异常
 */
function describeError(error: unknown): { message: string; status?: number } {
  /** HTTP 状态码，网络错误时为空 */
  const status = (error as { response?: { status?: number } })?.response?.status
  /** 异常文案 */
  const message = error instanceof Error ? error.message : String(error)
  return status ? { message, status } : { message }
}

/**
 * 串行执行 provider 写入。
 * @param op 写入操作
 */
function enqueueWrite<T>(op: () => Promise<T>): Promise<T> {
  /** 排在队尾的操作。 */
  const run = writeQueue.then(op, op)
  writeQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

/**
 * 请求新 key 并写入；失败只告警，保留现有 key。
 * @param token 登录 xkaitoken
 * @param deps 请求 / 写入实现
 * @param runGeneration 发起请求时的代次
 */
async function runRefresh(
  token: string,
  deps: JiaorongApiKeyRefreshDeps,
  runGeneration: number
): Promise<string | null> {
  try {
    /** 新 key。 */
    const apiKey = await deps.requestApiKey()
    await enqueueWrite(async () => {
      // 排队期间账号可能已切换，写入前再确认一次
      if (runGeneration !== generation) return
      await deps.writeApiKey(apiKey)
    })
    // 期间已登录 / 退出，丢弃旧账号的结果
    if (runGeneration !== generation) return null
    appliedToken = token
    lastAppliedKey = apiKey
    clearedWithoutToken = false
    return apiKey
  } catch (error) {
    console.warn('[jiaorong/provider] Failed to refresh Jiaorong API key:', describeError(error))
    return null
  }
}

/**
 * 用登录 token 换一把新的 Jiaorong key。
 * @param deps 请求 / 写入实现，默认走私有 API 与 provider client
 * @param token 当前 xkaitoken，默认从 localStorage 读
 * @returns 新 key；无 token 或失败时为 null
 */
export function refreshJiaorongProviderApiKey(
  deps: JiaorongApiKeyRefreshDeps = createDefaultDeps(),
  token = getToken()?.trim() || ''
): Promise<string | null> {
  if (!token) {
    generation += 1
    appliedToken = ''
    lastAppliedKey = ''
    if (clearedWithoutToken) return Promise.resolve(null)
    // 换号 / 退出后清掉上一个账号的 key
    return enqueueWrite(() => deps.writeApiKey('')).then(
      () => {
        clearedWithoutToken = true
        return null
      },
      () => null
    )
  }
  if (inflight?.token === token) return inflight.promise
  // 同一次启动里会话被重复回写时不再建第二把 key
  if (appliedToken === token) return Promise.resolve(lastAppliedKey || null)
  /** 本次刷新。 */
  generation += 1
  const promise = runRefresh(token, deps, generation)
  inflight = { token, promise }
  void promise.finally(() => {
    if (inflight?.promise === promise) inflight = null
  })
  return promise
}

/** 启动时调用一次；同一启动的多个窗口只让第一个真正发请求。 */
async function runStartupRefresh(): Promise<void> {
  /** 本次应用启动标识；多个窗口共享。 */
  let startupRunId: string | undefined
  try {
    const bootstrap = await createStartupClient().getBootstrap()
    startupRunId = bootstrap.startupRunId
    if (startupRunId && localStorage.getItem(REFRESH_RUN_STORAGE_KEY) === startupRunId) return
    // 先占位，避免同一次启动的多个窗口并发建 key
    if (startupRunId) localStorage.setItem(REFRESH_RUN_STORAGE_KEY, startupRunId)
  } catch {
    // 拿不到启动标识时照常刷新，不能因此丢掉 key
  }
  const apiKey = await refreshJiaorongProviderApiKey()
  // 本次换 key 失败时释放占位，让其它窗口补一次
  if (!apiKey && startupRunId && getToken()?.trim()) {
    localStorage.removeItem(REFRESH_RUN_STORAGE_KEY)
  }
}

/** 启动时调用一次，并在登录 / 退出 / 续期写回会话后自动刷新。 */
export function startJiaorongProviderApiKeyRefresh(): void {
  if (started) return
  started = true
  if (typeof window === 'undefined') return
  void runStartupRefresh()
  window.addEventListener(JIAORONG_AUTH_SESSION_CHANGED_EVENT, () => {
    void refreshJiaorongProviderApiKey()
  })
}
