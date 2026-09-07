import type { JiaorongAppAuth, JiaorongAppUserIdentity } from './types'

function nonEmptyStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 兼容目录里的 userIds 与误写的 userid */
export function normalizeAppAuth(raw: unknown): JiaorongAppAuth | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const orgs = nonEmptyStrings(record.orgs)
  const userIds = nonEmptyStrings(record.userIds ?? record.userid)
  if (orgs.length === 0 && userIds.length === 0) return null
  return { orgs, userIds }
}

export function isAppAuthOpen(auth: JiaorongAppAuth | null | undefined): boolean {
  return !auth || (auth.orgs.length === 0 && auth.userIds.length === 0)
}

/**
 * 缺 auth = 全员可见。
 * 否则 userid（userName）或任一组织 orgNo 命中即可见。
 */
export function isAppVisibleToUser(
  auth: JiaorongAppAuth | null | undefined,
  user: JiaorongAppUserIdentity
): boolean {
  if (isAppAuthOpen(auth)) return true
  const userName = user.userName?.trim() || ''
  if (userName && auth?.userIds.includes(userName)) return true
  const orgSet = new Set(user.orgNos.map((orgNo) => orgNo.trim()).filter(Boolean))
  return Boolean(auth?.orgs.some((orgNo) => orgSet.has(orgNo)))
}

export function readUserIdentityFromUserInfo(raw: unknown): JiaorongAppUserIdentity {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { userName: null, orgNos: [] }
  }
  const record = raw as Record<string, unknown>
  const userName = typeof record.userName === 'string' ? record.userName.trim() : ''
  const orgNos: string[] = []
  if (Array.isArray(record.orgList)) {
    for (const org of record.orgList) {
      if (!org || typeof org !== 'object') continue
      const orgNo = (org as { orgNo?: unknown }).orgNo
      if (typeof orgNo === 'string' && orgNo.trim()) {
        orgNos.push(orgNo.trim())
      }
    }
  }
  return {
    userName: userName || null,
    orgNos
  }
}
