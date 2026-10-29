/** 应用目录解析与合并。运行时目录来自应用列表接口，OSS 只保留白名单等运行时配置。 */

import {
  resetJiaorongRemoteRuntimeConfigForTests,
  startJiaorongRemoteRuntimeConfigSync,
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

/** 最近一次应用列表接口落地的运行时目录。 */
let remoteAppCatalog: JiaorongAppCatalogRecord[] = []
/** 是否至少成功落地过一次目录快照（含接口返回空列表）；冷启动 / 断网时保持 false。 */
let hasAppliedAppCatalog = false
/** 上次落地的接口目录快照，内容没变就不重复广播。 */
let lastAppliedCatalogJson = ''
/** 目录变化时通知侧栏。 */
let catalogChangedListener: (() => void) | null = null

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
 * 解析应用列表接口（`assets?type=app`）的一条记录。
 * 与 OSS apps 的差异：
 * - 版本在顶层 `version`，下载地址与校验和在 `latestRelease`；
 * - `iconUrl` 是绝对地址，不能当包内相对路径，图标改由安装后的 app.json 回填；
 * - 没有 `enabled`，未发布的应用不会出现在市场列表里。
 * @param raw 接口 item
 */
export function parseAppAssetCatalogRecord(raw: unknown): JiaorongAppCatalogRecord | null {
  // 非对象视为无效
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 对象形态的入参。 */
  const record = raw as Record<string, unknown>
  /** 记录 id。 */
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  // id 必须是 kebab-case
  if (!APP_ID_RE.test(id)) return null
  // 市场接口只应回已发布项，仍按状态兜底
  const status = typeof record.status === 'string' ? record.status.trim() : ''
  if (status && status !== 'published') return null
  /** 最新发布记录。 */
  const release =
    record.latestRelease &&
    typeof record.latestRelease === 'object' &&
    !Array.isArray(record.latestRelease)
      ? (record.latestRelease as Record<string, unknown>)
      : null
  /** 读 trim 后字符串。 */
  const readText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
  /** 版本：顶层优先，其次 latestRelease。 */
  const version = readText(record.version) || readText(release?.version)
  /** 名称。 */
  const name = readText(record.name) || id
  if (!version || !name) return null
  /** 下载地址：优先 latestRelease，其次顶层。 */
  const downloadUrl = readText(release?.downloadUrl) || readText(record.downloadUrl)
  /** 包校验和。 */
  const sha256 = readText(release?.sha256)
  /** 解析出的 package。 */
  const parsedPackage = parsePackage({
    kind: 'zip',
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(sha256 ? { sha256 } : {})
  })
  // 没有可用包地址的条目无法安装
  if (!parsedPackage) return null
  const description = readText(record.description)
  const provider = readText(record.provider)
  /** 来源：接口只有 builtin / store。 */
  const source: JiaorongAppSource = record.source === 'builtin' ? 'builtin' : 'store'
  return {
    id,
    name,
    version,
    ...(description ? { description } : {}),
    ...(provider ? { provider } : {}),
    slot: parseAppSlot(record.slot, source),
    source,
    auth: normalizeAppAuth(record.auth),
    package: parsedPackage
  }
}

/**
 * 用应用列表接口结果覆盖运行时目录。
 * @param items 接口 item[]
 * @returns 目录是否发生变化（变化时才需要重新同步系统应用）
 */
export function applyAppCatalogFromApi(items: unknown[]): boolean {
  /** 解析结果。 */
  const parsed: JiaorongAppCatalogRecord[] = []
  /** 去重集合。 */
  const seen = new Set<string>()
  for (const item of items) {
    const record = parseAppAssetCatalogRecord(item)
    // 解析失败或 id 重复（保留首次出现）
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    parsed.push(record)
  }
  /** 目录快照。 */
  const json = JSON.stringify(parsed)
  // 接口成功返回即视为已有可信快照，空列表同样代表「市场里确实没有应用」
  hasAppliedAppCatalog = true
  // 内容没变不广播，避免重复触发侧栏与系统应用同步
  if (json === lastAppliedCatalogJson) return false
  lastAppliedCatalogJson = json
  remoteAppCatalog = parsed
  setSystemBundledAppIds(parsed.filter((item) => item.source === 'builtin').map((item) => item.id))
  // 通知侧栏刷新
  catalogChangedListener?.()
  return true
}

/** 运行时应用目录来自应用列表接口。未拉到或失败时为空，本地 json 不参与运行。 */
export function loadBuiltinAppCatalog(): JiaorongAppCatalogRecord[] {
  return remoteAppCatalog
}

/**
 * 是否已拿到过可信的接口目录。
 * 冷启动或接口连续失败时为 false，扫描侧据此保留「已装即可见」的兜底，
 * 避免断网启动时整个侧栏与交融应用列表被清空；拿到快照后严格按 auth 判定。
 */
export function hasAppliedAppCatalogSnapshot(): boolean {
  return hasAppliedAppCatalog
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

/** 点火后台拉取 OSS 运行时配置（白名单等）；应用目录由接口单独同步。 */
export function startRemoteAppCatalogSync(): void {
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
  hasAppliedAppCatalog = false
  lastAppliedCatalogJson = ''
  catalogChangedListener = null
  setSystemBundledAppIds([])
  resetJiaorongRemoteRuntimeConfigForTests()
}
