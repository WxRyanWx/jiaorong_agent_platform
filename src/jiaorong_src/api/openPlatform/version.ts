/**
 * 开放平台资产版本号工具：semver 三段式（可带预发布段）。
 * 发布弹窗校验与客户端更新判定共用同一实现，保证前后端口径一致。
 */

const OPEN_PLATFORM_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/

export function isValidOpenPlatformVersion(version: string): boolean {
  return OPEN_PLATFORM_VERSION_PATTERN.test(version.trim())
}

function parseVersionParts(version: string): { core: number[]; pre: string[] } | null {
  // 真实后端可能返回 v1.2.0 这类带前缀的 tag，比较时统一剥掉，避免整条更新判定静默失效。
  const normalized = version.trim().replace(/^[vV]/, '')
  const matched = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+[\w.]+)?$/.exec(normalized)
  if (!matched) return null
  return {
    core: [Number(matched[1]), Number(matched[2]), Number(matched[3])],
    pre: matched[4] ? matched[4].split('.') : []
  }
}

/** a > b 返回 1，a < b 返回 -1，相等或任一无法解析返回 0。 */
export function compareOpenPlatformVersions(a: string, b: string): number {
  const left = parseVersionParts(a)
  const right = parseVersionParts(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] > right.core[index] ? 1 : -1
    }
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1
  const length = Math.max(left.pre.length, right.pre.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.pre[index]
    const rightPart = right.pre[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) return leftNumber > rightNumber ? 1 : -1
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

/** 市场版本是否比本地已装版本新；本地版本缺失或不可解析时视为可更新（点击后补写版本）。 */
export function isNewerOpenPlatformVersion(
  marketVersion: string | null | undefined,
  localVersion: string | null | undefined
): boolean {
  const market = marketVersion?.trim()
  if (!market) return false
  const local = localVersion?.trim()
  if (!local) return true
  // 市场版本自身无法解析时不提示更新，避免把一个坏版本推给用户。
  if (!parseVersionParts(market)) return false
  // 本地版本是脏数据（历史写入、手改配置、后端换了版本格式）时按可更新处理，
  // 否则 compare 恒为 0，「更新」按钮永远不会出现，用户会卡在旧版本上。
  if (!parseVersionParts(local)) return true
  return compareOpenPlatformVersions(market, local) > 0
}

/**
 * 已装记录与市场版本是否需要同步（客户端「更新」按钮判定用）。
 * 相比 `isNewerOpenPlatformVersion` 多一条：本地记录版本高于市场版本时也要提示同步。
 * 这种记录来自后端重置过版本号（如 1.10.3 一代回落到 1.0.4），
 * 若按「市场必须更新」判，脏记录会把按钮永久压掉，用户只能删了重装。
 * 发布侧「必须比上一版更新」的校验请继续用 `isNewerOpenPlatformVersion`，不要混用。
 */
export function needsOpenPlatformVersionSync(
  marketVersion: string | null | undefined,
  localVersion: string | null | undefined
): boolean {
  const market = marketVersion?.trim()
  if (!market) return false
  if (!parseVersionParts(market)) return false
  const local = localVersion?.trim()
  if (!local) return true
  if (!parseVersionParts(local)) return true
  return compareOpenPlatformVersions(market, local) !== 0
}
