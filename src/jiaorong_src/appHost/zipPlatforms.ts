/** 从 zip 里只取出 app.json 的 platforms，不必解开整个安装包。 */

import { inflateSync, strFromU8 } from 'fflate'
import { parsePlatformField } from './platforms'

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50
const MAX_DIRECTORY_BYTES = 256 * 1024
const MAX_MANIFEST_BYTES = 256 * 1024
const MAX_ENTRIES = 10_000

/** 已读到的声明。platforms 缺省表示 app.json 没写这个字段。 */
export type PlatformDeclaration = { known: true; platforms?: string[] } | { known: false }

/** 按绝对偏移读 zip。end 含在结果里。读不到返回 null。 */
export type ZipByteReader = {
  size: number
  read(start: number, endInclusive: number): Promise<Uint8Array | null>
}

type ZipEntry = {
  name: string
  method: number
  flags: number
  compSize: number
  localOffset: number
}

function u16(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8)
}

function u32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0
  )
}

/**
 * 根目录或只包一层目录的 app.json。资源叉里的副本不算。
 * @param name zip 条目名
 */
function isAppJsonPath(name: string): boolean {
  const key = name.replace(/\\/g, '/')
  if (key.endsWith('/')) return false
  if (key.split('/').includes('__MACOSX')) return false
  return key === 'app.json' || (key.endsWith('/app.json') && key.split('/').length === 2)
}

/**
 * 中央目录末尾的定位记录。没找到返回 -1。
 * @param buf 文件尾
 */
function findEocd(buf: Uint8Array): number {
  const latest = buf.length - 22
  const earliest = Math.max(0, buf.length - (22 + 65535))
  for (let offset = latest; offset >= earliest; offset -= 1) {
    if (u32(buf, offset) !== EOCD_SIG) continue
    const commentLength = u16(buf, offset + 20)
    if (offset + 22 + commentLength === buf.length) return offset
  }
  return -1
}

/**
 * 在中央目录里找 app.json。
 * @param directory 中央目录字节
 */
function findAppJsonEntry(directory: Uint8Array): ZipEntry | null {
  let offset = 0
  let seen = 0
  let found: ZipEntry | null = null
  while (offset + 46 <= directory.length && seen < MAX_ENTRIES) {
    if (u32(directory, offset) !== CD_SIG) break
    const flags = u16(directory, offset + 8)
    const method = u16(directory, offset + 10)
    const compSize = u32(directory, offset + 20)
    const nameLength = u16(directory, offset + 28)
    const extraLength = u16(directory, offset + 30)
    const commentLength = u16(directory, offset + 32)
    const localOffset = u32(directory, offset + 42)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > directory.length) return found
    const name = new TextDecoder().decode(directory.subarray(nameStart, nameEnd))
    if (isAppJsonPath(name) && (!found || name.length < found.name.length)) {
      found = { name, method, flags, compSize, localOffset }
    }
    offset = nameEnd + extraLength + commentLength
    seen += 1
  }
  return found
}

/**
 * app.json 字节收成声明。没有 platforms 字段表示全部客户端。
 * @param raw 条目原文
 */
function declarationFromAppJson(raw: Uint8Array): PlatformDeclaration {
  try {
    const parsed: unknown = JSON.parse(strFromU8(raw))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { known: false }
    const record = parsed as Record<string, unknown>
    if (!Object.prototype.hasOwnProperty.call(record, 'platforms')) return { known: true }
    return { known: true, platforms: parsePlatformField(record.platforms) }
  } catch {
    return { known: false }
  }
}

/**
 * 用分段读取找出 app.json 的 platforms。
 * @param reader zip 字节来源
 */
export async function readPlatformDeclaration(reader: ZipByteReader): Promise<PlatformDeclaration> {
  if (reader.size < 22) return { known: false }
  const tailLength = Math.min(reader.size, MAX_DIRECTORY_BYTES)
  const tailStart = reader.size - tailLength
  const tail = await reader.read(tailStart, reader.size - 1)
  if (!tail || tail.length !== tailLength) return { known: false }
  const eocd = findEocd(tail)
  if (eocd < 0) return { known: false }
  const directorySize = u32(tail, eocd + 12)
  const directoryOffset = u32(tail, eocd + 16)
  if (
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff ||
    directorySize > MAX_DIRECTORY_BYTES ||
    directoryOffset + directorySize > reader.size
  ) {
    return { known: false }
  }
  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await reader.read(directoryOffset, directoryOffset + directorySize - 1)
  if (!directory || directory.length < directorySize) return { known: false }
  const entry = findAppJsonEntry(directory.subarray(0, directorySize))
  if (!entry || entry.localOffset === 0xffffffff) return { known: false }
  if ((entry.flags & 1) !== 0 || entry.compSize > MAX_MANIFEST_BYTES) return { known: false }
  if (entry.method !== 0 && entry.method !== 8) return { known: false }
  const header = await reader.read(entry.localOffset, entry.localOffset + 29)
  if (!header || header.length < 30 || u32(header, 0) !== LOCAL_SIG) return { known: false }
  const dataStart = entry.localOffset + 30 + u16(header, 26) + u16(header, 28)
  if (entry.compSize === 0) return declarationFromAppJson(new Uint8Array())
  const data = await reader.read(dataStart, dataStart + entry.compSize - 1)
  if (!data || data.length < entry.compSize) return { known: false }
  try {
    const raw =
      entry.method === 0
        ? data.subarray(0, entry.compSize)
        : inflateSync(data.subarray(0, entry.compSize))
    return declarationFromAppJson(raw)
  } catch {
    return { known: false }
  }
}

/**
 * 整段 zip 已经在内存里时的读取器。
 * @param bytes zip 原文
 */
export function zipReaderFromBytes(bytes: Uint8Array): ZipByteReader {
  return {
    size: bytes.length,
    async read(start, endInclusive) {
      if (start < 0 || endInclusive < start || endInclusive >= bytes.length) return null
      return bytes.subarray(start, endInclusive + 1)
    }
  }
}
