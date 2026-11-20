/** 未安装时只取远程 zip 尾部和 app.json，用来判断当前客户端能不能装。 */

import { isJiaorongPrivateApiUrl, resolveAuthProductId } from '../../api/auth/config'
import { clientSupportsPlatformList } from '../platforms'
import {
  readPlatformDeclaration,
  type PlatformDeclaration,
  type ZipByteReader
} from '../zipPlatforms'
import type { JiaorongAppHostDeps } from './deps'
import {
  readPlatformSupportCache,
  rememberPlatformSupport,
  type PlatformSupportRecord
} from './platformSupportCache'
import { readAuthToken } from './userIdentity'

const RANGE_TIMEOUT_MS = 15_000
const MAX_RANGE_BYTES = 256 * 1024
const SHA256_RE = /^[a-f0-9]{64}$/

type PeekItem = {
  id: string
  downloadUrl: string
  sha256: string
}

type RangeBody = {
  bytes: Uint8Array
  total: number | null
  status: number
  start: number
}

const memoryCache = new Map<string, PlatformSupportRecord>()
const inflight = new Map<string, Promise<PlatformSupportRecord | null>>()

function cacheKey(item: PeekItem): string {
  return SHA256_RE.test(item.sha256) ? `sha:${item.sha256}` : `url:${item.downloadUrl}`
}

/**
 * 读一段字节。服务器忽略 Range 且整包很大时丢掉响应，避免把安装包下完。
 * @param url 下载地址
 * @param headers 鉴权头，公开地址为空
 * @param start 起始字节
 * @param end 结束字节，含在内
 */
async function fetchRange(
  url: string,
  headers: Record<string, string>,
  start: number,
  end: number
): Promise<RangeBody | null> {
  let response: Response
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: { ...headers, Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(RANGE_TIMEOUT_MS)
    })
  } catch {
    return null
  }
  const range = response.headers.get('content-range')?.match(/bytes (\d+)-(\d+)\/(\d+)/)
  const total = range ? Number(range[3]) : null
  const rangeStart = range ? Number(range[1]) : start
  if (response.status === 206) {
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      total: Number.isFinite(total) ? total : null,
      status: 206,
      start: rangeStart
    }
  }
  const length = Number(response.headers.get('content-length') || '0')
  if (response.status === 200 && length > 0 && length <= MAX_RANGE_BYTES && start === 0) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { bytes, total: bytes.length, status: 200, start: 0 }
  }
  await response.body?.cancel().catch(() => undefined)
  return null
}

/**
 * 远程包的 platforms。读不到不猜测。
 * @param url 下载地址
 * @param headers 鉴权头
 */
export async function peekRemotePlatformDeclaration(
  url: string,
  headers: Record<string, string> = {}
): Promise<PlatformDeclaration> {
  const suffix = await fetchRange(url, headers, 0, 0)
  if (!suffix) return { known: false }
  if (suffix.status === 200)
    return readPlatformDeclaration(readerFrom(suffix.bytes, async () => null))
  const total = suffix.total
  if (!total) return { known: false }
  const tail = await fetchRange(url, headers, Math.max(0, total - MAX_RANGE_BYTES), total - 1)
  if (!tail || tail.status !== 206) return { known: false }
  const tailStart = tail.start
  const reader: ZipByteReader = {
    size: total,
    async read(start, endInclusive) {
      if (start >= tailStart && endInclusive < tailStart + tail.bytes.length) {
        return tail.bytes.subarray(start - tailStart, endInclusive - tailStart + 1)
      }
      const fetched = await fetchRange(url, headers, start, endInclusive)
      if (!fetched || fetched.start !== start) return null
      return fetched.bytes
    }
  }
  return readPlatformDeclaration(reader)
}

/**
 * 内存里的整包。第二段读取留给测试里用不到的分支。
 * @param bytes zip
 * @param readOutside 整包之外的读取
 */
function readerFrom(bytes: Uint8Array, readOutside: ZipByteReader['read']): ZipByteReader {
  return {
    size: bytes.length,
    async read(start, endInclusive) {
      if (start >= 0 && endInclusive < bytes.length) return bytes.subarray(start, endInclusive + 1)
      return readOutside(start, endInclusive)
    }
  }
}

function recordFromDeclaration(declaration: PlatformDeclaration): PlatformSupportRecord | null {
  if (!declaration.known) return null
  return { platforms: declaration.platforms === undefined ? null : declaration.platforms }
}

function supportedFromRecord(record: PlatformSupportRecord): boolean {
  if (record.platforms === null) return true
  return clientSupportsPlatformList(record.platforms)
}

async function loadRecord(
  item: PeekItem,
  headers: Record<string, string>,
  disk: Map<string, PlatformSupportRecord>
): Promise<PlatformSupportRecord | null> {
  const key = cacheKey(item)
  const remembered = memoryCache.get(key)
  if (remembered) return remembered
  if (SHA256_RE.test(item.sha256)) {
    const stored = disk.get(item.sha256)
    if (stored) {
      memoryCache.set(key, stored)
      return stored
    }
  }
  const pending = inflight.get(key)
  if (pending) return pending
  const task = peekRemotePlatformDeclaration(item.downloadUrl, headers)
    .then((declaration) => {
      const record = recordFromDeclaration(declaration)
      if (!record) return null
      memoryCache.set(key, record)
      if (SHA256_RE.test(item.sha256)) rememberPlatformSupport(item.sha256, record)
      return record
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, task)
  return task
}

/**
 * 收成要查询的包。一次最多 30 个。
 * @param input 渲染进程入参
 */
export function readPlatformPeekInput(input: unknown): PeekItem[] {
  if (!input || typeof input !== 'object') return []
  const items = (input as { items?: unknown }).items
  if (!Array.isArray(items)) return []
  const result: PeekItem[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const record = item as { id?: unknown; downloadUrl?: unknown; sha256?: unknown }
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    const downloadUrl = typeof record.downloadUrl === 'string' ? record.downloadUrl.trim() : ''
    const sha256 = typeof record.sha256 === 'string' ? record.sha256.trim().toLowerCase() : ''
    if (!id || !downloadUrl) continue
    result.push({ id, downloadUrl, sha256 })
    if (result.length >= 30) break
  }
  return result
}

/**
 * 批量判断这些包在当前客户端上能不能装。读不到的 id 不返回。
 * @param deps 超级智能体依赖，私有下载地址要带登录态
 * @param input 卡片上的下载地址
 */
export async function peekAppPlatformSupport(
  deps: JiaorongAppHostDeps,
  input: unknown
): Promise<{ id: string; supported: boolean }[]> {
  const items = readPlatformPeekInput(input)
  if (items.length === 0) return []
  const token = readAuthToken(deps.getAuthSession())
  const disk = readPlatformSupportCache()
  const out: { id: string; supported: boolean }[] = []
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index]
      if (!item || !isJiaorongPrivateApiUrl(item.downloadUrl) || !token) continue
      const headers = {
        'Fusion-Auth': token,
        'Product-Id': resolveAuthProductId()
      }
      const record = await loadRecord(item, headers, disk)
      if (!record) continue
      out.push({ id: item.id, supported: supportedFromRecord(record) })
    }
  }
  const workers = Array.from({ length: Math.min(3, items.length) }, () => worker())
  await Promise.all(workers)
  return out
}
