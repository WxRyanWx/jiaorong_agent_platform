/** OSS 应用目录解析与合并。运行时不读本地 builtinCatalog.json。 */

import {
  resetJiaorongRemoteRuntimeConfigForTests,
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig,
  whenJiaorongRemoteRuntimeConfigFirstAttemptSettled
} from '../config/remoteRuntimeConfig'
import { normalizeAppAuth } from './auth'
import type { JiaorongAppCatalogRecord, JiaorongAppPackage, JiaorongAppSource } from './types'

/** 应用 id 合法格式。 */
const APP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 最近一次 OSS 解析出的应用列表。 */
let remoteAppCatalog: JiaorongAppCatalogRecord[] = []
/** 是否已订阅远程配置。 */
let catalogSubscribed = false
/** 目录变化时通知侧栏。 */
let catalogChangedListener: (() => void) | null = null

/** 内置目录 JSON。 */
type BuiltinCatalogFile = {
  /** 目录 schema 版本。 */
  schemaVersion?: number
  /** 应用列表。 */
  apps?: unknown[]
}

/** 是否为目录允许的应用来源。 */
function isAppSource(value: unknown): value is JiaorongAppSource {
  return value === 'builtin' || value === 'local-debug' || value === 'store'
}

/** 解析目录 JSON 里的 package（dir/zip）。 */
function parsePackage(raw: unknown): JiaorongAppPackage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 对象形态的入参。 */
  const record = raw as Record<string, unknown>
  /** 类型。 */
  const kind = record.kind === 'zip' ? 'zip' : 'dir'
  /** 内置目录名。 */
  const builtinDir = typeof record.builtinDir === 'string' ? record.builtinDir.trim() : ''
  /** downloadUrl 地址。 */
  const downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : ''
  /** zip 校验和。 */
  const sha256 = typeof record.sha256 === 'string' ? record.sha256.trim() : ''
  if (kind === 'dir' && !builtinDir) return null
  if (kind === 'zip' && !downloadUrl && !builtinDir) return null
  return {
    kind,
    ...(builtinDir ? { builtinDir } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(sha256 ? { sha256 } : {})
  }
}

/**
 * 解析目录里的一条应用。id 须为 kebab-case。
 * @param raw JSON 对象
 */
export function parseAppCatalogRecord(raw: unknown): JiaorongAppCatalogRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 对象形态的入参。 */
  const record = raw as Record<string, unknown>
  /** 记录 id。 */
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  /** 名称。 */
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  /** 版本。 */
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  if (!APP_ID_RE.test(id) || !name || !version) return null
  /** 解析出的 package。 */
  const parsedPackage = parsePackage(record.package)
  if (!parsedPackage) return null
  /** 说明。 */
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  /** 图标。 */
  const icon = typeof record.icon === 'string' ? record.icon.trim() : ''
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    slot: 'menu',
    source: isAppSource(record.source) ? record.source : 'builtin',
    enabled: record.enabled === false ? false : true,
    auth: normalizeAppAuth(record.auth),
    package: parsedPackage
  }
}

/**
 * 解析 `{ schemaVersion, apps }`。
 * @param raw OSS JSON
 */
export function parseAppCatalogFile(raw: unknown): JiaorongAppCatalogRecord[] {
  /** 单个文件。 */
  const file = raw && typeof raw === 'object' ? (raw as BuiltinCatalogFile) : {}
  /** 应用列表。 */
  const apps = Array.isArray(file.apps) ? file.apps : []
  /** 解析结果。 */
  const parsed: JiaorongAppCatalogRecord[] = []
  /** 去重集合。 */
  const seen = new Set<string>()
  /** 列表一项。 */
  for (const item of apps) {
    /** 对象形态的入参。 */
    const record = parseAppCatalogRecord(item)
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    parsed.push(record)
  }
  return parsed
}

/** 用远端 OSS 覆盖内置应用目录。 */
function applyRemoteAppCatalog(schemaVersion: number, apps: unknown[]): void {
  remoteAppCatalog = parseAppCatalogFile({
    schemaVersion,
    apps
  })
  catalogChangedListener?.()
}

/** 订阅远端目录变化并刷新。 */
function bindRemoteAppCatalogSubscription(): void {
  if (catalogSubscribed) return
  catalogSubscribed = true
  subscribeJiaorongRemoteRuntimeConfig((config) => {
    applyRemoteAppCatalog(config.schemaVersion, config.apps)
  })
}

/** 运行时应用目录来自 OSS。未拉到或失败时为空，本地 json 不参与运行。 */
export function loadBuiltinAppCatalog(): JiaorongAppCatalogRecord[] {
  return remoteAppCatalog
}

/** 登记目录变化回调。 */
export function setRemoteAppCatalogChangedListener(listener: (() => void) | null): void {
  catalogChangedListener = listener
}

/** 点火后台拉取，不等待 OSS。 */
export function startRemoteAppCatalogSync(): void {
  bindRemoteAppCatalogSubscription()
  startJiaorongRemoteRuntimeConfigSync()
}

/** 等待第一次尝试结束，便于打开应用时用到已返回的结果；不阻塞启动。 */
export async function ensureRemoteAppCatalog(): Promise<void> {
  startRemoteAppCatalogSync()
  await whenJiaorongRemoteRuntimeConfigFirstAttemptSettled()
}

/** 测试用：清空远端目录订阅。 */
export function resetRemoteAppCatalogForTests(): void {
  remoteAppCatalog = []
  catalogSubscribed = false
  catalogChangedListener = null
  resetJiaorongRemoteRuntimeConfigForTests()
}

/** M2：后管列表覆盖同 id 的内置项（auth / version / 下载地址）。 */
export function mergeAppCatalogs(
  builtin: JiaorongAppCatalogRecord[],
  store: JiaorongAppCatalogRecord[] = []
): JiaorongAppCatalogRecord[] {
  /** 映射表。 */
  const map = new Map<string, JiaorongAppCatalogRecord>()
  /** 列表一项。 */
  for (const item of builtin) {
    map.set(item.id, item)
  }
  /** 列表一项。 */
  for (const item of store) {
    /** 上一次的目录。 */
    const prev = map.get(item.id)
    map.set(
      item.id,
      prev
        ? {
            ...prev,
            ...item,
            source: 'store',
            package: { ...prev.package, ...item.package },
            auth: item.auth === undefined ? prev.auth : item.auth
          }
        : item
    )
  }
  return [...map.values()]
}
