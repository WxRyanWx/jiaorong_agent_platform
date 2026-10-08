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

/**
 * 可选白名单：null 表示字段没配，全员放行；数组只放行命中手机号或 userName 的人。
 * 配置还没拉到时不要调用，调用方先按不可见处理。
 * @param list 未配置为 null，已配置为名单（可为空）
 * @param identity 当前登录身份
 */
export function allowsIdentityByOptionalWhitelist(
  list: readonly string[] | null,
  identity: JiaorongStoredIdentity
): boolean {
  if (list === null) return true
  return matchesIdentityWhitelist(list, identity)
}
