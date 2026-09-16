/** 组装 `context.get` 的宿主上下文（含登录 token）。应用 Node 端口由应用自己探，宿主不注入。 */

import { resolveAuthApiBaseUrl, resolveAuthProductId } from '../../api/auth/config'
import { readUserIdentityFromUserInfo } from '../auth'
import type { JiaorongAppHostContext, JiaorongAppRuntime } from '../types'
import type { JiaorongAppHostDeps } from './deps'
import { readAuthToken } from './userIdentity'

/**
 * 从鉴权会话里解析 userInfo JSON。
 * @param session 主进程 `jiaorong_auth_session`
 */
function parseUserInfo(session: ReturnType<JiaorongAppHostDeps['getAuthSession']>): unknown {
  /** 优先完整 userFullInfo。 */
  const raw = session?.userFullInfo || session?.userInfo
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * 给当前打开的应用构造 `HostContext`。
 * @param deps 宿主依赖
 * @param runtime 已安装且当前可见的应用
 */
export function buildHostContext(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime
): JiaorongAppHostContext {
  /** 当前登录会话。 */
  const session = deps.getAuthSession()
  /** 用户名与组织。 */
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
