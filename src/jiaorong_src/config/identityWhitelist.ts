/** 名单匹配：与管理员白名单同一机制，手机号或 userName 命中其一即可。 */

/** 参与匹配的身份。 */
export type JiaorongStoredIdentity = {
  userName: string | null
  phone: string | null
}

/**
 * 身份是否命中白名单。空名单恒不命中。
 * @param list OSS 下发的手机号 / userName 名单
 * @param identity 当前登录身份
 */
export function matchesIdentityWhitelist(
  list: readonly string[],
  identity: JiaorongStoredIdentity
): boolean {
  if (list.length === 0) return false
  const userName = identity.userName?.trim() || ''
  const phone = identity.phone?.trim() || ''
  return list.some(
    (item) => (userName !== '' && item === userName) || (phone !== '' && item === phone)
  )
}
