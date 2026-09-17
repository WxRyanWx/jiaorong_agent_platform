/** 目录级可见性：组织号 / 用户名 / 手机号任一命中才展示；缺 auth 或三数组皆空 = 全员可见。 */

import type { JiaorongAppAuth, JiaorongAppUserIdentity } from './types'

/**
 * 从未知 JSON 抽出非空字符串数组。
 * @param value 目录字段，期望 string[]
 */
function nonEmptyStrings(value: unknown): string[] {
  // 误写成单个字符串时，收成单元素数组
  if (typeof value === 'string') {
    /** 去空白后的字符串。 */
    const trimmed = value.trim()
    // 空串视为未配置
    return trimmed ? [trimmed] : []
  }
  // 非数组一律视为未配置
  if (!Array.isArray(value)) return []
  // 只保留字符串项，去空白后再滤掉空串
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 规范化目录里的 `auth`。兼容误写的 `userid` / `phone`。
 * @param raw 目录 JSON 的 auth 字段
 * @returns 三数组都空则视为未配置（全员可见），返回 null
 */
export function normalizeAppAuth(raw: unknown): JiaorongAppAuth | null {
  // 非对象或数组视为未配置
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  /** 原始 auth 对象。 */
  const record = raw as Record<string, unknown>
  /** 可见组织 orgNo。 */
  const orgs = nonEmptyStrings(record.orgs)
  /** 可见用户 userName；兼容 `userid`。 */
  const userIds = nonEmptyStrings(record.userIds ?? record.userid)
  /** 可见手机号；兼容单数 `phone`。 */
  const phones = nonEmptyStrings(record.phones ?? record.phone)
  // 三数组皆空 = 未限制可见性，等价于全员可见
  if (orgs.length === 0 && userIds.length === 0 && phones.length === 0) return null
  return { orgs, userIds, phones }
}

/**
 * 是否未限制可见性。
 * @param auth 规范化后的 auth
 */
export function isAppAuthOpen(auth: JiaorongAppAuth | null | undefined): boolean {
  return (
    !auth ||
    ((auth.orgs?.length ?? 0) === 0 &&
      (auth.userIds?.length ?? 0) === 0 &&
      (auth.phones?.length ?? 0) === 0)
  )
}

/**
 * 当前登录用户是否看得见该应用。
 * 用户名、任一组织 orgNo、手机号三者命中其一即可见。
 * @param auth 目录 auth
 * @param user 当前用户身份
 */
export function isAppVisibleToUser(
  auth: JiaorongAppAuth | null | undefined,
  user: JiaorongAppUserIdentity
): boolean {
  // 未限制可见性，直接放行
  if (isAppAuthOpen(auth)) return true
  /** 登录用户名，对目录 `userIds`。 */
  const userName = user.userName?.trim() || ''
  // 命中用户名白名单
  if (userName && auth?.userIds?.includes(userName)) return true
  /** 登录手机号，对目录 `phones`。 */
  const phone = user.phone?.trim() || ''
  // 命中手机号白名单
  if (phone && auth?.phones?.includes(phone)) return true
  /** 用户所属组织号集合。 */
  const orgSet = new Set(user.orgNos.map((orgNo) => orgNo.trim()).filter(Boolean))
  // 目录组织号任一命中即可见
  return Boolean(auth?.orgs?.some((orgNo) => orgSet.has(orgNo)))
}

/**
 * 从超级智能体本地 userInfo JSON 抽出 userName / orgNos / phone。
 * @param raw `userInfo` 或 `userFullInfo` 解析结果
 */
export function readUserIdentityFromUserInfo(raw: unknown): JiaorongAppUserIdentity {
  // 非对象 userInfo：返回空身份，调用方按未登录处理
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { userName: null, orgNos: [], phone: null }
  }
  /** userInfo 对象。 */
  const record = raw as Record<string, unknown>
  /** 用户名，对应目录 userIds。 */
  const userName = typeof record.userName === 'string' ? record.userName.trim() : ''
  /** 手机号；登录态里常见 phone / phoneNumber。 */
  const phoneRaw = [record.phone, record.phoneNumber, record.mobile].find(
    (item) => typeof item === 'string' && item.trim()
  )
  /** trim 后的手机号。 */
  const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() : ''
  /** 组织号列表。 */
  const orgNos: string[] = []
  // orgList 可能缺失或不是数组
  if (Array.isArray(record.orgList)) {
    /** 单条组织。 */
    for (const org of record.orgList) {
      // 跳过空项与非对象项
      if (!org || typeof org !== 'object') continue
      /** 单条组织的 orgNo。 */
      const orgNo = (org as { orgNo?: unknown }).orgNo
      // 只收非空组织号
      if (typeof orgNo === 'string' && orgNo.trim()) {
        orgNos.push(orgNo.trim())
      }
    }
  }
  return {
    userName: userName || null,
    orgNos,
    phone: phone || null
  }
}
