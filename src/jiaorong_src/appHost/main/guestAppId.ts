import { JIAORONG_APP_PROTOCOL } from '../channels'

const GUEST_PARTITION_PREFIX = 'persist:jiaorong-app-'

export function guestPartitionForApp(appId: string): string {
  return `${GUEST_PARTITION_PREFIX}${appId}`
}

export function readAppIdFromGuestPartition(partition: unknown): string | null {
  if (typeof partition !== 'string' || !partition.startsWith(GUEST_PARTITION_PREFIX)) return null
  const id = partition.slice(GUEST_PARTITION_PREFIX.length).trim()
  return id || null
}

export function isLoopbackHttpEntry(entry: string): boolean {
  try {
    const url = new URL(entry)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  } catch {
    return false
  }
}

export function readJiaorongAppHostname(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${JIAORONG_APP_PROTOCOL}:`) return null
    const appId = url.hostname.trim()
    return appId || null
  } catch {
    return null
  }
}

export function buildJiaorongAppEntryUrl(appId: string, entry: string): string {
  const relative = entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return `${JIAORONG_APP_PROTOCOL}://${appId}/${relative}`
}

export function matchGuestInvokeAppId(input: {
  hasSenderFrame: boolean
  isMainFrame: boolean
  frameUrl: string
  boundAppId: string | null
  senderUrl: string
}): string | null {
  const frameHost = readJiaorongAppHostname(input.frameUrl)
  const senderHost = readJiaorongAppHostname(input.senderUrl)
  if (input.boundAppId) {
    if (frameHost && frameHost !== input.boundAppId) return null
    if (senderHost && senderHost !== input.boundAppId) return null
    return input.boundAppId
  }
  if (!input.hasSenderFrame || !input.isMainFrame) return null
  return frameHost || senderHost
}

export function resolveGuestInvokeAppId(input: {
  hasSenderFrame: boolean
  isMainFrame: boolean
  frameUrl: string
  boundAppId: string | null
  senderUrl: string
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
