/** app.json 的 platforms：这个包能在哪几个客户端上安装和打开。 */

/** 与构建矩阵一致的 6 个客户端。 */
export const APP_CLIENT_PLATFORMS = [
  'windows-x64',
  'windows-arm64',
  'linux-x64',
  'linux-arm64',
  'mac-x64',
  'mac-arm64'
] as const

/** 安装、打开被系统挡住时，界面和接口共用这一句。 */
export const APP_UNSUPPORTED_PLATFORM_MESSAGE = '该应用不支持当前系统'

const OS_ALIASES: Record<string, string> = {
  win: 'windows',
  win32: 'windows',
  windows: 'windows',
  mac: 'mac',
  macos: 'mac',
  osx: 'mac',
  darwin: 'mac',
  linux: 'linux'
}

/**
 * 把一句系统名收成 6 个客户端 id 之一。认不出返回 null。
 * @param raw app.json 里的一项，如 `windows x64`
 */
export function normalizePlatformToken(raw: string): string | null {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  const parts = text.split('-').filter(Boolean)
  if (parts.length !== 2) return null
  const os = OS_ALIASES[parts[0]]
  const arch = parts[1] === 'amd64' ? 'x64' : parts[1]
  if (!os || (arch !== 'x64' && arch !== 'arm64')) return null
  const id = `${os}-${arch}`
  return (APP_CLIENT_PLATFORMS as readonly string[]).includes(id) ? id : null
}

/**
 * 当前进程对应哪个客户端。不在 6 个之中时返回 null。
 * @param platform process.platform
 * @param arch process.arch
 */
export function currentClientPlatform(
  platform: string = typeof process === 'undefined' ? '' : process.platform,
  arch: string = typeof process === 'undefined' ? '' : process.arch
): string | null {
  const os =
    platform === 'win32'
      ? 'windows'
      : platform === 'darwin'
        ? 'mac'
        : platform === 'linux'
          ? 'linux'
          : ''
  const cpu = arch === 'x64' || arch === 'amd64' ? 'x64' : arch === 'arm64' ? 'arm64' : ''
  if (!os || !cpu) return null
  return `${os}-${cpu}`
}

/**
 * 字段已经出现时，收成去重后的客户端 id。非法项丢掉。
 * 不是数组则没有任何系统可用。
 * @param value app.json 的 platforms
 */
export function parsePlatformField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = normalizePlatformToken(item)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * 没写 platforms 时全部客户端可用。写了就只认列表里的项。
 * @param platforms 清单字段；undefined 表示字段不存在
 * @param client 当前客户端 id；不在 6 个之中则传 null
 */
export function clientSupportsPlatformList(
  platforms: readonly string[] | undefined,
  client: string | null = currentClientPlatform()
): boolean {
  if (platforms === undefined) return true
  if (!client) return false
  return platforms.some((item) => normalizePlatformToken(item) === client)
}

/**
 * 已装清单、目录和安装包缓存里，有一份明确不支持就把卡片关掉。
 * 一份都还没读到时先允许，等安装解包再拦。
 */
export function resolveSupportedOnClient(input: {
  manifestKnown: boolean
  manifestPlatforms?: string[]
  catalogKnown: boolean
  catalogPlatforms?: string[]
  cachedKnown: boolean
  cachedPlatforms?: string[] | null
  client?: string | null
}): boolean {
  const client = input.client === undefined ? currentClientPlatform() : input.client
  const votes: boolean[] = []
  if (input.manifestKnown) votes.push(clientSupportsPlatformList(input.manifestPlatforms, client))
  if (input.catalogKnown) votes.push(clientSupportsPlatformList(input.catalogPlatforms, client))
  if (input.cachedKnown) {
    votes.push(
      input.cachedPlatforms == null
        ? true
        : clientSupportsPlatformList(input.cachedPlatforms, client)
    )
  }
  if (votes.length === 0) return true
  return votes.every((supported) => supported)
}
