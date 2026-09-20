/** OSS 运行时配置：管理员白名单 + 嵌入应用目录。拉失败时返回空配置，不抛错。 */

export const JIAORONG_REMOTE_RUNTIME_CONFIG_URL =
  'https://c4ai.ccccltd.cn/xkprosdk/jiaorong-runtime-config.json'

const FETCH_TIMEOUT_MS = 8_000

/** 启动后立刻连拉次数（含第一次）。失败后再按间隔重试。 */
export const JIAORONG_REMOTE_RUNTIME_CONFIG_ATTEMPTS = 3

const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000] as const
const DEFAULT_BACKGROUND_RETRY_MS = 30_000

/** 开发者中心示例应用：配置 devApp 对象独立维护，不占 apps 目录。 */
export type JiaorongRemoteDevAppConfig = {
  /** 应用 id。 */
  id: string
  /** 显示名。 */
  name: string
  /** 版本。 */
  version: string
  /** 描述。 */
  description?: string
  /** 提供方。 */
  provider?: string
  /** 图标绝对 URL（http/https）；未给时退回已安装目录图标。 */
  icon?: string
  /** zip 下载地址。 */
  downloadUrl: string
}

export type JiaorongRemoteRuntimeConfig = {
  schemaVersion: number
  admins: string[]
  /** 应用中心可见名单：手机号 / userName，匹配机制同 admins。 */
  appCenterVisiblePhones: string[]
  /** 开发者名单：手机号 / userName。 */
  developerPhones: string[]
  /** 开发者中心示例应用；配置未给为 null。 */
  devApp: JiaorongRemoteDevAppConfig | null
  apps: unknown[]
}

export const EMPTY_JIAORONG_REMOTE_RUNTIME_CONFIG: JiaorongRemoteRuntimeConfig = {
  schemaVersion: 1,
  admins: [],
  appCenterVisiblePhones: [],
  developerPhones: [],
  devApp: null,
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
let lastEmittedJson = ''
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
  // 内容未变不通知，避免「刷新 → 广播 → 再刷新」自激
  const json = JSON.stringify(config)
  if (json === lastEmittedJson) return
  lastEmittedJson = json
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

/**
 * 解析 devApp 对象；必填缺任一返回 null。
 * @param raw 配置原始值
 */
function readDevAppConfig(raw: unknown): JiaorongRemoteDevAppConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 原始字段表。 */
  const record = raw as Record<string, unknown>
  /** 字符串字段读取。 */
  const read = (key: string): string => (typeof record[key] === 'string' ? record[key].trim() : '')
  /** 四个必填字段。 */
  const id = read('id')
  const name = read('name')
  const version = read('version')
  const downloadUrl = read('downloadUrl')
  if (!id || !name || !version || !downloadUrl) return null
  /** 描述。 */
  const description = read('description')
  /** 提供方。 */
  const provider = read('provider')
  /** 图标 URL。 */
  const icon = read('icon')
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(provider ? { provider } : {}),
    ...(icon.startsWith('http') ? { icon } : {}),
    downloadUrl
  }
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
    appCenterVisiblePhones: uniqueStrings(record.appCenterVisiblePhones),
    developerPhones: uniqueStrings(record.developerPhones),
    devApp: readDevAppConfig(record.devApp ?? record.devapp),
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

/**
 * 主动重拉一次 OSS 配置：成功则按变化通知订阅方；失败保留旧快照。
 * 供应用中心刷新按钮 / 安装前取最新目录。
 */
export async function refreshJiaorongRemoteRuntimeConfig(): Promise<JiaorongRemoteRuntimeConfig | null> {
  const outcome = await fetchJiaorongRemoteRuntimeConfigOnce()
  if (!outcome.ok) return lastSuccessfulConfig
  emit(outcome.config)
  return outcome.config
}

/** 最近一次成功拉到的配置快照；未成功过为 null。供主进程身份判定读取。 */
export function peekJiaorongRemoteRuntimeConfig(): JiaorongRemoteRuntimeConfig | null {
  return lastSuccessfulConfig
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
  lastEmittedJson = ''
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
