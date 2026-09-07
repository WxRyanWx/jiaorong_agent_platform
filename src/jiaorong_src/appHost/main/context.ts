import { resolveAuthApiBaseUrl, resolveAuthProductId } from '../../api/auth/config'
import { readUserIdentityFromUserInfo } from '../auth'
import type { JiaorongAppHostContext, JiaorongAppRuntime } from '../types'
import type { JiaorongAppHostDeps } from './deps'
import { readAuthToken } from './userIdentity'

function parseUserInfo(session: ReturnType<JiaorongAppHostDeps['getAuthSession']>): unknown {
  const raw = session?.userFullInfo || session?.userInfo
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function buildHostContext(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime
): JiaorongAppHostContext {
  const session = deps.getAuthSession()
  const identity = readUserIdentityFromUserInfo(parseUserInfo(session))
  return {
    userId: identity.userName || '',
    orgId: identity.orgNos[0] ?? null,
    locale: deps.getLocale(),
    theme: deps.getTheme(),
    appId: runtime.id,
    appDir: runtime.appDir || '',
    token: readAuthToken(session),
    apiBaseUrl: resolveAuthApiBaseUrl(),
    productId: resolveAuthProductId()
  }
}
