import { readUserIdentityFromUserInfo } from '../appHost/auth'
import type { JiaorongStoredIdentity } from './identityWhitelist'

/**
 * 读 localStorage 里的登录 userInfo；解析失败按未登录处理。
 * 渲染进程专用（主进程身份走 auth session）。
 */
export function readStoredUserInfo(): JiaorongStoredIdentity {
  try {
    const raw = localStorage.getItem('userInfo')
    if (!raw) return { userName: null, phone: null }
    const identity = readUserIdentityFromUserInfo(JSON.parse(raw))
    return { userName: identity.userName, phone: identity.phone }
  } catch {
    return { userName: null, phone: null }
  }
}
