import { readUserIdentityFromUserInfo } from '../auth'
import type { JiaorongAppUserIdentity } from '../types'

export type JiaorongAuthSession = {
  token?: string
  userInfo?: string
  userFullInfo?: string
}

function parseJsonObject(raw: string | undefined): unknown {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function readUserIdentityFromAuthSession(
  session: JiaorongAuthSession | undefined
): JiaorongAppUserIdentity {
  const fullInfo = parseJsonObject(session?.userFullInfo) ?? parseJsonObject(session?.userInfo)
  return readUserIdentityFromUserInfo(fullInfo)
}

export function readAuthToken(session: JiaorongAuthSession | undefined): string | null {
  const token = session?.token?.trim()
  return token || null
}

export function readAuthUserKey(session: JiaorongAuthSession | undefined): string {
  return readUserIdentityFromAuthSession(session).userName?.trim() ?? ''
}

/** 超级智能体本地 userInfo + xkaitoken。token 始终覆盖同名字段。 */
export function buildUserInfoPayload(
  session: JiaorongAuthSession | undefined
): Record<string, unknown> {
  const token = readAuthToken(session)
  const parsed = parseJsonObject(session?.userFullInfo) ?? parseJsonObject(session?.userInfo)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...(parsed as Record<string, unknown>), token }
  }
  return { token }
}
