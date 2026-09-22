/** 组装 `context.get` 的超级智能体上下文（含登录 token）。 */

import { resolveAuthApiBaseUrl, resolveAuthEnv, resolveAuthProductId } from '../../api/auth/config'
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
  // 两份资料都没有
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // JSON 损坏按未登录处理
    return null
  }
}

/**
 * 给当前打开的应用构造 `HostContext`。
 * @param deps 超级智能体依赖
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
    // 用户名缺失时给空串，应用侧按未登录处理
    userId: identity.userName || '',
    // 只取第一个组织号作为当前组织
    orgId: identity.orgNos[0] ?? null,
    locale: deps.getLocale(),
    theme: deps.getTheme(),
    appId: runtime.id,
    // 系统应用没有用户安装目录时给空串
    appDir: runtime.appDir || '',
    // 未登录为 null，应用据此决定是否跳登录
    token: readAuthToken(session),
    apiBaseUrl: resolveAuthApiBaseUrl(),
    productId: resolveAuthProductId(),
    env: resolveAuthEnv()
  }
}
