/** OSS 运行时配置：管理员白名单 + 嵌入应用目录。拉失败时返回空配置，不抛错。 */

export const JIAORONG_REMOTE_RUNTIME_CONFIG_URL =
  'https://c4ai.ccccltd.cn/xkprosdk/jiaorong-runtime-config.json'

const FETCH_TIMEOUT_MS = 8_000

/** 启动后立刻连拉次数（含第一次）。失败后再按间隔重试。 */
export const JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS = 3

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000] as const
const DEFAULT_BACKGROUND_RETRY_MS = 30_000

export type JiaorongRemoteRuntimeConfig = {
  schemaVersion: number
  admins: string[]
  apps: unknown[]
}

export const EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG: JiaorongRemoteRuntimeConfig = {
  schemaVersion: 1,
  admins: [],
  apps: []
}

type FetchOutcome = { ok: true; config: JiaorongRemoteRuntimeConfig } | { ok: false }

type RuntimeConfigListener = (config: JiaorongRemoteRuntimeConfig) => void

let retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS
let backgroundRetryMs = DEFAULT_BACKGROUND_RETRY_MS
let loadGeneration = 0
let syncStarted = false
let succeeded = false
let lastSuccessfulConfig: JiaorongRemoteRuntimeConfig | null = null
let backgroundTimer: ReturnType<typeof setTimeout> | null = null
let firstAttemptSettled: Promise<void> | null = null
let resolveFirstAttemptSettled: (() => void) | null = null
let burstDone: Promise<void> | null = null
const listeners = new Set<RuntimeConfigListener>()

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function emit(config: JiaorongRemoteRuntimeConfig): void {
  lastSuccessfulConfig = config
  for (const listener of listeners) {
    listener(config)
  }
}

function settleFirstAttempt(): void {
  resolveFirstAttemptSettled?.()
  resolveFirstAttemptSettled = null
}

function scheduleBackgroundRetry(generation: number): void {
  if (succeeded || generation !== loadGeneration) return
  backgroundTimer = setTimeout(() => {
    backgroundTimer = null
    void (async () => {
      if (generation !== loadGeneration || succeeded) return
      const outcome = await fetchJiaorongRemoteRuntimeConfigOnce()
      if (generation !== loadGeneration || succeeded) return
      if (outcome.ok) {
        succeeded = true
        emit(outcome.config)
        return
      }
      scheduleBackgroundRetry(generation)
    })()
  }, backgroundRetryMs)
}

async function runBurst(generation: number): Promise<void> {
  for (let attempt = 0; attempt < JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS; attempt++) {
    if (generation !== loadGeneration) return
    if (attempt > 0) {
      await sleep(retryDelaysMs[attempt - 1] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 0)
    }
    if (generation !== loadGeneration) return
    const outcome = await fetchJiaorongRemoteRuntimeConfigOnce()
    if (generation !== loadGeneration) return
    if (outcome.ok) {
      succeeded = true
      emit(outcome.config)
    }
    if (attempt === 0) settleFirstAttempt()
    if (outcome.ok) return
  }
  scheduleBackgroundRetry(generation)
}

/** 非法 JSON / 缺字段时当成空配置，不抛错。 */
export function parseJiaorongRemoteRuntimeConfig(raw: unknown): JiaorongRemoteRuntimeConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG }
  }
  const record = raw as Record<string, unknown>
  const schemaVersion =
    typeof record.schemaVersion === 'number' && Number.isFinite(record.schemaVersion)
      ? Math.floor(record.schemaVersion)
      : 1
  return {
    schemaVersion: schemaVersion > 0 ? schemaVersion : 1,
    admins: uniqueStrings(record.admins),
    apps: Array.isArray(record.apps) ? record.apps : []
  }
}

async function fetchJiaorongRemoteRuntimeConfigOnce(): Promise<FetchOutcome> {
  try {
    const url = `${JIAORONG_REMOTE_RUNTIME_CONFIG_URL}?t=${Date.now()}`
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) return { ok: false }
    return {
      ok: true,
      config: parseJiaorongRemoteRuntimeConfig(await response.json())
    }
  } catch {
    return { ok: false }
  }
}

/** 单次拉取。失败返回空配置；不启动重试循环。 */
export async function fetchJiaorongRemoteRuntimeConfig(): Promise<JiaorongRemoteRuntimeConfig> {
  const outcome = await fetchJiaorongRemoteRuntimeConfigOnce()
  return outcome.ok ? outcome.config : { ...EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG }
}

export function subscribeJiaorongRemoteRuntimeConfig(listener: RuntimeConfigListener): () => void {
  listeners.add(listener)
  if (lastSuccessfulConfig) listener(lastSuccessfulConfig)
  return () => {
    listeners.delete(listener)
  }
}

/** 后台拉 OSS：不阻塞调用方。HTTP 200 即成功（含空名单）；网络/非 200 才重试。 */
export function startJiaorongRemoteRuntimeConfigSync(): void {
  if (syncStarted) return
  syncStarted = true
  const generation = loadGeneration
  firstAttemptSettled = new Promise<void>((resolve) => {
    resolveFirstAttemptSettled = resolve
  })
  burstDone = runBurst(generation)
}

/** 第一次尝试结束（成功或失败）。不等待后续重试。 */
export function whenJiaorongRemoteRuntimeConfigFirstAttemptSettled(): Promise<void> {
  startJiaorongRemoteRuntimeConfigSync()
  return firstAttemptSettled ?? Promise.resolve()
}

export function resetJiaorongRemoteRuntimeConfigForTests(): void {
  loadGeneration += 1
  syncStarted = false
  succeeded = false
  lastSuccessfulConfig = null
  if (backgroundTimer) {
    clearTimeout(backgroundTimer)
    backgroundTimer = null
  }
  settleFirstAttempt()
  firstAttemptSettled = null
  burstDone = null
  listeners.clear()
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS
  backgroundRetryMs = DEFAULT_BACKGROUND_RETRY_MS
}

export function setJiaorongRemoteRuntimeConfigRetryPolicyForTests(policy?: {
  retryDelaysMs?: readonly number[]
  backgroundRetryMs?: number
}): void {
  retryDelaysMs = policy?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  backgroundRetryMs = policy?.backgroundRetryMs ?? DEFAULT_BACKGROUND_RETRY_MS
}

export function waitJiaorongRemoteRuntimeConfigBurstForTests(): Promise<void> {
  return burstDone ?? Promise.resolve()
}
