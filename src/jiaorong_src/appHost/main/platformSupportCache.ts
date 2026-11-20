/** 按安装包 sha256 记住 app.json 有没有写 platforms。不跟某一次安装目录走。 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getAppHomeDir } from '@jiaorong/brand/appIdentity'
import { parsePlatformField } from '../platforms'

const SHA256_RE = /^[a-f0-9]{64}$/

/** null 表示包里没有 platforms，全部客户端可用。 */
export type PlatformSupportRecord = {
  platforms: string[] | null
}

/**
 * 缓存文件路径。
 * @param homeDir 用户 home，测试可注入
 */
export function getPlatformSupportCacheFile(homeDir = os.homedir()): string {
  return path.join(getAppHomeDir(homeDir), 'app-platform-support.json')
}

/**
 * 读已经看过的安装包。坏档当没有。
 * @param homeDir 用户 home，测试可注入
 */
export function readPlatformSupportCache(
  homeDir = os.homedir()
): Map<string, PlatformSupportRecord> {
  try {
    const raw = JSON.parse(fs.readFileSync(getPlatformSupportCacheFile(homeDir), 'utf8')) as {
      packages?: unknown
    }
    if (!raw.packages || typeof raw.packages !== 'object' || Array.isArray(raw.packages)) {
      return new Map()
    }
    const cache = new Map<string, PlatformSupportRecord>()
    for (const [key, value] of Object.entries(raw.packages)) {
      const sha = key.trim().toLowerCase()
      if (!SHA256_RE.test(sha) || !value || typeof value !== 'object' || Array.isArray(value))
        continue
      const platforms = (value as { platforms?: unknown }).platforms
      if (platforms === null) {
        cache.set(sha, { platforms: null })
        continue
      }
      if (!Array.isArray(platforms)) continue
      cache.set(sha, { platforms: parsePlatformField(platforms) })
    }
    return cache
  } catch {
    return new Map()
  }
}

/**
 * 记住一份安装包的声明。sha256 不合法时不写文件。
 * @param sha256 包校验和
 * @param record 声明
 * @param homeDir 用户 home，测试可注入
 */
export function rememberPlatformSupport(
  sha256: string,
  record: PlatformSupportRecord,
  homeDir = os.homedir()
): void {
  const sha = sha256.trim().toLowerCase()
  if (!SHA256_RE.test(sha)) return
  const cache = readPlatformSupportCache(homeDir)
  const previous = cache.get(sha)
  const nextPlatforms = record.platforms === null ? null : [...record.platforms]
  if (
    previous &&
    ((previous.platforms === null && nextPlatforms === null) ||
      (previous.platforms &&
        nextPlatforms &&
        previous.platforms.join('\n') === nextPlatforms.join('\n')))
  ) {
    return
  }
  cache.set(sha, { platforms: nextPlatforms })
  const packages: Record<string, PlatformSupportRecord> = {}
  for (const key of [...cache.keys()].sort()) {
    const item = cache.get(key)
    if (item) packages[key] = item
  }
  const filePath = getPlatformSupportCacheFile(homeDir)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, `${JSON.stringify({ packages }, null, 2)}\n`, 'utf8')
  fs.renameSync(tempPath, filePath)
}
