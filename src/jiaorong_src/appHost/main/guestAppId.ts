import { JIAORONG_APP_PROTOCOL } from '../channels'

export function guestPartitionForApp(appId: string): string {
  return `persist:jiaorong-app-${appId}`
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
  if (!input.hasSenderFrame) return null
  const frameHost = readJiaorongAppHostname(input.frameUrl)
  if (!input.isMainFrame) {
    if (!input.boundAppId || !frameHost || frameHost !== input.boundAppId) return null
    return input.boundAppId
  }
  if (input.boundAppId) {
    if (frameHost && frameHost !== input.boundAppId) return null
    return input.boundAppId
  }
  return frameHost || readJiaorongAppHostname(input.senderUrl)
}
