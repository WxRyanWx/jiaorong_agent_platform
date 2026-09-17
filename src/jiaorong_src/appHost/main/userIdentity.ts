/** 从主进程 `jiaorong_auth_session` 读用户身份、token，以及 `userinfo.get` 载荷。 */

import { readUserIdentityFromUserInfo } from '../auth'
import type { JiaorongAppUserIdentity } from '../types'

/** electron-store 里扫码登录会话。 */
export type JiaorongAuthSession = {
  /** 登录 xkaitoken。 */
  token?: string
  /** 精简 userInfo JSON 字符串。 */
  userInfo?: string
  /** 完整 userFullInfo JSON 字符串。 */
  userFullInfo?: string
}

/**
 * 解析会话里的 JSON 字符串。
 * @param raw userInfo / userFullInfo
 */
function parseJsonObject(raw: string | undefined): unknown {
  // 没有值或只有空白
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // 存的不是合法 JSON，按没有处理
    return null
  }
}

/**
 * 从鉴权会话抽出 userName / orgNos。
 * @param session 可空会话
 */
export function readUserIdentityFromAuthSession(
  session: JiaorongAuthSession | undefined
): JiaorongAppUserIdentity {
  /** 优先完整资料。 */
  const fullInfo = parseJsonObject(session?.userFullInfo) ?? parseJsonObject(session?.userInfo)
  return readUserIdentityFromUserInfo(fullInfo)
}

/**
 * 读登录 token。
 * @param session 可空会话
 */
export function readAuthToken(session: JiaorongAuthSession | undefined): string | null {
  /** trim 后的 token。 */
  const token = session?.token?.trim()
  // 空串统一收成 null，方便应用侧判空
  return token || null
}

/**
 * 读用户名，用作换用户时的缓存键。
 * @param session 可空会话
 */
export function readAuthUserKey(session: JiaorongAuthSession | undefined): string {
  return readUserIdentityFromAuthSession(session).userName?.trim() ?? ''
}

/**
 * 超级智能体本地 userInfo + xkaitoken。token 始终覆盖同名字段。
 * @param session 可空会话
 */
export function buildUserInfoPayload(
  session: JiaorongAuthSession | undefined
): Record<string, unknown> {
  /** 当前 token，未登录为 null 仍写入字段。 */
  const token = readAuthToken(session)
  /** 解析后的用户对象。 */
  const parsed = parseJsonObject(session?.userFullInfo) ?? parseJsonObject(session?.userInfo)
  // 能解析出对象就展开用户字段，token 覆盖同名字段
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...(parsed as Record<string, unknown>), token }
  }
  // 解析不出用户资料，至少给 token 字段保持结构稳定
  return { token }
}
