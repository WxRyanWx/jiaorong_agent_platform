/** 从 partition / URL 认出 appId，并校验 guest `invoke` 的发送方。 */

import { JIAORONG_APP_PROTOCOL } from '../channels'

/** persist 分区前缀，后面接 appId。 */
const GUEST_PARTITION_PREFIX = 'persist:jiaorong-app-'

/**
 * 应用独立 session 分区名。
 * @param appId 应用 id
 */
export function guestPartitionForApp(appId: string): string {
  return `${GUEST_PARTITION_PREFIX}${appId}`
}

/**
 * 从分区名解析 appId。
 * @param partition `persist:jiaorong-app-<id>`
 */
export function readAppIdFromGuestPartition(partition: unknown): string | null {
  if (typeof partition !== 'string' || !partition.startsWith(GUEST_PARTITION_PREFIX)) return null
  /** 前缀后的 id。 */
  const id = partition.slice(GUEST_PARTITION_PREFIX.length).trim()
  return id || null
}

/**
 * 读 Session 对象上的 partition 字段。
 * @param session Electron Session
 */
export function readSessionPartition(session: unknown): unknown {
  if (!session || typeof session !== 'object' || !('partition' in session)) return undefined
  return (session as { partition?: unknown }).partition
}

/**
 * 入口是否为本机回环 HTTP（应用自有 Node）。
 * @param entry 页面 URL 或清单 entry
 */
export function isLoopbackHttpEntry(entry: string): boolean {
  try {
    /** 解析后的 URL。 */
    const url = new URL(entry)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    /** 小写 hostname。 */
    const host = url.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

/**
 * 从 `jiaorong-app://<appId>/...` 读 hostname（即 appId）。
 * @param rawUrl guest 当前 URL
 */
export function readJiaorongAppHostname(rawUrl: string): string | null {
  try {
    /** 解析后的 URL。 */
    const url = new URL(rawUrl)
    if (url.protocol !== `${JIAORONG_APP_PROTOCOL}:`) return null
    /** 协议 hostname = 绑定的 appId。 */
    const appId = url.hostname.trim()
    return appId || null
  } catch {
    return null
  }
}

/**
 * 拼 webview 入口 URL。
 * @param appId 应用 id
 * @param entry 相对入口，如 `web-ui/index.html`
 */
export function buildJiaorongAppEntryUrl(appId: string, entry: string): string {
  /** 去掉开头斜杠、统一为正斜杠。 */
  const relative = entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${JIAORONG_APP_PROTOCOL}://${appId}/${relative}`
}

/**
 * 按 senderFrame / 已绑定 appId 判断这次 invoke 属于哪个应用。
 * 无 `senderFrame` 或非主框且未绑定则拒绝。
 */
export function matchGuestInvokeAppId(input: {
  /** 是否有 Electron senderFrame（iframe 伪造时可能没有）。 */
  hasSenderFrame: boolean
  /** 是否主框。 */
  isMainFrame: boolean
  /** 发送框 URL。 */
  frameUrl: string
  /** 已绑定的 appId。 */
  boundAppId: string | null
  /** sender.getURL()。 */
  senderUrl: string
}): string | null {
  /** 框 URL 上的 appId。 */
  const frameHost = readJiaorongAppHostname(input.frameUrl)
  /** sender URL 上的 appId。 */
  const senderHost = readJiaorongAppHostname(input.senderUrl)
  if (input.boundAppId) {
    if (frameHost && frameHost !== input.boundAppId) return null
    if (senderHost && senderHost !== input.boundAppId) return null
    return input.boundAppId
  }
  if (!input.hasSenderFrame || !input.isMainFrame) return null
  return frameHost || senderHost
}

/**
 * 解析 invoke 的 appId：绑定值、partition、URL 依次兜底。
 */
export function resolveGuestInvokeAppId(input: {
  /** 是否有 senderFrame。 */
  hasSenderFrame: boolean
  /** 是否主框。 */
  isMainFrame: boolean
  /** 发送框 URL。 */
  frameUrl: string
  /** 已绑定 appId。 */
  boundAppId: string | null
  /** sender URL。 */
  senderUrl: string
  /** session 的 partition。 */
  partition?: unknown
}): string | null {
  return matchGuestInvokeAppId({
    hasSenderFrame: input.hasSenderFrame,
    isMainFrame: input.isMainFrame,
    frameUrl: input.frameUrl,
    senderUrl: input.senderUrl,
    boundAppId:
      input.boundAppId ||
      readAppIdFromGuestPartition(input.partition) ||
      readJiaorongAppHostname(input.senderUrl)
  })
}
