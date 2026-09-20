/** OSS 应用目录解析与合并。谁能看见只看这份配置表。 */

import {
  resetJiaorongRemoteRuntimeConfigForTests,
  startJiaorongRemoteRuntimeConfigSync,
  subscribeJiaorongRemoteRuntimeConfig,
  whenJiaorongRemoteRuntimeConfigFirstAttemptSettled
} from '../config/remoteRuntimeConfig'
import { normalizeAppAuth } from './auth'
import { APP_MANIFEST_SLOTS } from './manifestRules'
import { setSystemBundledAppIds } from './systemApps'
import type {
  JiaorongAppCatalogRecord,
  JiaorongAppPackage,
  JiaorongAppSlot,
  JiaorongAppSource
} from './types'

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

/**
 * 是否为目录允许的应用来源。
 * @param value 目录里的 `source` 字段
 */
function isAppSource(value: unknown): value is JiaorongAppSource {
  // 只认这三个字面量，其它回落到 store（避免漏写 source 被当成系统应用）
  return value === 'builtin' || value === 'local-debug' || value === 'store'
}

/**
 * 解析目录里的挂载位置。系统应用固定侧栏；商店应用缺省只进应用中心。
 * @param value 目录 `slot`
 * @param source 应用来源
 */
function parseAppSlot(value: unknown, source: JiaorongAppSource): JiaorongAppSlot {
  // 系统应用本期只进侧栏，OSS 写了 app-center 也忽略
  if (source === 'builtin') return 'menu'
  /** 目录里的 slot 原文。 */
  const slot = typeof value === 'string' ? value.trim() : ''
  if ((APP_MANIFEST_SLOTS as readonly string[]).includes(slot)) return slot as JiaorongAppSlot
  return source === 'store' ? 'app-center' : 'menu'
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * 解析目录 JSON 里的 package（dir/zip）。
 * 把误写在 builtinDir 里的 http(s) 地址当成 zip 下载地址。
 * @param raw `package` 字段
 */
function parsePackage(raw: unknown): JiaorongAppPackage | null {
  // 非对象视为无效
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 对象形态的入参。 */
  const record = raw as Record<string, unknown>
  /** 内置目录名。 */
  let builtinDir = typeof record.builtinDir === 'string' ? record.builtinDir.trim() : ''
  /** downloadUrl 地址。 */
  let downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : ''
  /** zip 校验和。 */
  const sha256 = typeof record.sha256 === 'string' ? record.sha256.trim() : ''
  // 目录把 zip 地址写进 builtinDir 时，按远程包处理
  if (!downloadUrl && isHttpUrl(builtinDir)) {
    downloadUrl = builtinDir
    builtinDir = ''
  }
  /** 有下载地址就是 zip。 */
  const kind = record.kind === 'zip' || isHttpUrl(downloadUrl) ? 'zip' : 'dir'
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
  // 非对象视为无效
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 对象形态的入参。 */
  const record = raw as Record<string, unknown>
  /** 记录 id。 */
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  /** 名称。 */
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  /** 版本。 */
  const version = typeof record.version === 'string' ? record.version.trim() : ''
  // id 必须是 kebab-case，name / version 必填
  if (!APP_ID_RE.test(id) || !name || !version) return null
  /** 解析出的 package。 */
  const parsedPackage = parsePackage(record.package)
  // package 无效则整条丢弃
  if (!parsedPackage) return null
  /** 说明。 */
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  /** 图标。 */
  const icon = typeof record.icon === 'string' ? record.icon.trim() : ''
  /** 提供方。 */
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  /** 来源：发布默认 store；只有 OSS 手改 builtin 才当系统应用。 */
  const source = isAppSource(record.source) ? record.source : 'store'
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(icon ? { icon } : {}),
    ...(provider ? { provider } : {}),
    slot: parseAppSlot(record.slot, source),
    source,
    // 只有显式 false 才算停用
    enabled: record.enabled === false ? false : true,
    // auth 归一化，三数组皆空表示全员可见
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
    // 解析失败或 id 重复（保留首次出现）
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    parsed.push(record)
  }
  return parsed
}

/**
 * 用远端 OSS 覆盖内置应用目录。
 * @param schemaVersion 目录 schema 版本
 * @param apps OSS 里的应用数组
 */
function applyRemoteAppCatalog(schemaVersion: number, apps: unknown[]): void {
  remoteAppCatalog = parseAppCatalogFile({
    schemaVersion,
    apps
  })
  setSystemBundledAppIds(
    remoteAppCatalog.filter((item) => item.source === 'builtin').map((item) => item.id)
  )
  // 通知侧栏刷新
  catalogChangedListener?.()
}

/** 订阅远端目录变化并刷新。 */
function bindRemoteAppCatalogSubscription(): void {
  // 幂等：只订阅一次
  if (catalogSubscribed) return
  catalogSubscribed = true
  // 每次远端配置更新都重新解析目录
  subscribeJiaorongRemoteRuntimeConfig((config) => {
    applyRemoteAppCatalog(config.schemaVersion, config.apps)
  })
}

/** 运行时应用目录来自 OSS。未拉到或失败时为空，本地 json 不参与运行。 */
export function loadBuiltinAppCatalog(): JiaorongAppCatalogRecord[] {
  return remoteAppCatalog
}

/**
 * 登记目录变化回调。
 * @param listener 回调，传 null 表示注销
 */
export function setRemoteAppCatalogChangedListener(listener: (() => void) | null): void {
  catalogChangedListener = listener
}

/** 安装 / 卸载后主动通知侧栏，不必等 OSS 再拉一次。 */
export function notifyRemoteAppCatalogChanged(): void {
  catalogChangedListener?.()
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
  setSystemBundledAppIds([])
  resetJiaorongRemoteRuntimeConfigForTests()
}

/**
 * M2：后管列表覆盖同 id 的内置项（auth / version / 下载地址）。
 * @param builtin 内置目录
 * @param store 后管目录
 */
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
    // 同 id 已存在则叠加覆盖，否则整条新增
    map.set(
      item.id,
      prev
        ? {
            ...prev,
            ...item,
            // 来源固定标记为后管
            source: 'store',
            // package 字段级合并，保留内置侧缺失的键
            package: { ...prev.package, ...item.package },
            // auth 未显式给出时沿用内置配置
            auth: item.auth === undefined ? prev.auth : item.auth
          }
        : item
    )
  }
  // 保持内置在前、后管追加的稳定顺序
  return [...map.values()]
}
