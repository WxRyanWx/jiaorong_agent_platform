import { isSupportedDeeplinkProtocol, matchesAnyDeeplinkUrl } from '@shared/appIdentity'

/** iframe 导航只吃扫码登录，避免第三方页触发 mcp/start 等命令 */
export function resolveInAppChatLoginNavigation(url: string): string | null {
  const trimmed = url.trim()
  if (!matchesAnyDeeplinkUrl(trimmed)) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (!isSupportedDeeplinkProtocol(parsed.protocol)) {
      return null
    }

    const rawPath = [parsed.hostname, parsed.pathname.replace(/^\/+/, '')]
      .filter((segment) => segment.length > 0)
      .join('/')
    const command = rawPath.split('/')[0]?.toLowerCase() ?? ''
    const token = parsed.searchParams.get('token') || parsed.searchParams.get('accessToken')
    if (command !== 'chat' || !token?.trim()) {
      return null
    }
    return trimmed
  } catch {
    return null
  }
}
