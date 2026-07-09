import { matchesAnyDeeplinkUrl, normalizeDeeplinkUrl } from '@shared/appIdentity'

const STARTUP_DEEPLINK_ENV_KEY = 'STARTUP_DEEPLINK'
const SECONDARY_STARTUP_ENV_KEYS = [
  'DEEPLINK_URL',
  'deepchat_deeplink',
  'jiaorongchat_deeplink'
] as const
let pendingStartupDeepLink: string | null = null

export const isDeepLinkUrl = matchesAnyDeeplinkUrl

export const normalizeDeepLinkUrl = normalizeDeeplinkUrl

export const findDeepLinkArg = (argv: readonly string[]): string | null => {
  const matched = argv.find((arg) => isDeepLinkUrl(arg))
  return matched ? normalizeDeepLinkUrl(matched) : null
}

export const readStartupDeepLinkFromEnv = (env: NodeJS.ProcessEnv = process.env): string | null => {
  if (pendingStartupDeepLink) {
    return pendingStartupDeepLink
  }

  const stored = env[STARTUP_DEEPLINK_ENV_KEY]
  return matchesAnyDeeplinkUrl(stored) ? normalizeDeeplinkUrl(stored) : null
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
    if (matchesAnyDeeplinkUrl(value)) {
      return normalizeDeeplinkUrl(value)
    }
  }

  return null
}

export const storeStartupDeepLink = (
  url: string,
  _env: NodeJS.ProcessEnv = process.env
): string | null => {
  if (!matchesAnyDeeplinkUrl(url)) {
    return null
  }

  const normalized = normalizeDeeplinkUrl(url)
  pendingStartupDeepLink = normalized
  return normalized
}

export const consumeStartupDeepLink = (_env: NodeJS.ProcessEnv = process.env): string | null => {
  const stored = pendingStartupDeepLink
  pendingStartupDeepLink = null
  return stored
}
