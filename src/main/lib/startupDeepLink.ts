import { matchesAnyDeeplinkUrl } from '@shared/appIdentity'

const STARTUP_DEEPLINK_ENV_KEY = 'STARTUP_DEEPLINK'
const SECONDARY_STARTUP_ENV_KEYS = [
  'DEEPLINK_URL',
  'deepchat_deeplink',
  'jiaorongchat_deeplink'
] as const
let pendingStartupDeepLink: string | null = null

/** Windows second-instance / 启动参数常把协议 URL 包在引号里 */
const unwrapQuotedArg = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.length < 2) {
    return trimmed
  }
  const start = trimmed[0]
  const end = trimmed[trimmed.length - 1]
  if ((start === '"' && end === '"') || (start === "'" && end === "'")) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export const isDeepLinkUrl = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && matchesAnyDeeplinkUrl(unwrapQuotedArg(value))
}

export const normalizeDeepLinkUrl = (value: string): string => unwrapQuotedArg(value)

export const findDeepLinkArg = (argv: readonly string[]): string | null => {
  const matched = argv.find((arg) => isDeepLinkUrl(arg))
  return matched ? normalizeDeepLinkUrl(matched) : null
}

export const readStartupDeepLinkFromEnv = (env: NodeJS.ProcessEnv = process.env): string | null => {
  if (pendingStartupDeepLink) {
    return pendingStartupDeepLink
  }

  const stored = env[STARTUP_DEEPLINK_ENV_KEY]
  return isDeepLinkUrl(stored) ? normalizeDeepLinkUrl(stored) : null
}

export const findStartupDeepLink = (
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): string | null => {
  const stored = readStartupDeepLinkFromEnv(env)
  if (stored) {
    return stored
  }

  const deepLinkArg = findDeepLinkArg(argv)
  if (deepLinkArg) {
    return deepLinkArg
  }

  for (const key of SECONDARY_STARTUP_ENV_KEYS) {
    const value = env[key]
    if (isDeepLinkUrl(value)) {
      return normalizeDeepLinkUrl(value)
    }
  }

  return null
}

export const storeStartupDeepLink = (
  url: string,
  _env: NodeJS.ProcessEnv = process.env
): string | null => {
  if (!isDeepLinkUrl(url)) {
    return null
  }

  const normalized = normalizeDeepLinkUrl(url)
  pendingStartupDeepLink = normalized
  return normalized
}

export const consumeStartupDeepLink = (_env: NodeJS.ProcessEnv = process.env): string | null => {
  const stored = pendingStartupDeepLink
  pendingStartupDeepLink = null
  return stored
}
