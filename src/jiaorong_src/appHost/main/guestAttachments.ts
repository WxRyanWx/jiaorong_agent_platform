/** guest 附件落地；知识库 context 不当文件写盘。 */

import { isAbsoluteGuestPath } from './guestBind'
import {
  JIAORONG_KB_CONTEXT_MIME,
  JIAORONG_KB_CONTEXT_PATH
} from '../../knowledgeBase/mcp/knowledgeBaseMcpConstants'

/** guest 附件落地端口。 */
export type JiaorongGuestFilePort = {
  writeTemp(file: { name: string; content: Buffer | string }): Promise<string>
  writeImageBase64(file: { name: string; content: string }): Promise<string>
  prepareFile(path: string, mimeType?: string): Promise<Record<string, unknown>>
}

/** 把未知值收成对象；否则 null。 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 读附件 name。 */
function readName(row: Record<string, unknown>): string {
  /** 名称。 */
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  return name || 'file'
}

/** 读附件 mime。 */
function readMime(row: Record<string, unknown>): string {
  if (typeof row.mimeType === 'string' && row.mimeType.trim()) return row.mimeType.trim()
  if (typeof row.type === 'string' && row.type.trim()) return row.type.trim()
  return ''
}

/** 读附件 content / dataBase64。 */
function readPayload(row: Record<string, unknown>): string {
  if (typeof row.content === 'string' && row.content.trim()) return row.content.trim()
  if (typeof row.dataBase64 === 'string' && row.dataBase64.trim()) return row.dataBase64.trim()
  return ''
}

/** 去掉 data URL 的 base64, 前缀。 */
function stripDataUrl(value: string): string {
  /** data URL 里的 base64, 标记。 */
  const marker = 'base64,'
  /** 下标。 */
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

/** 是否图片 data URL。 */
function isImageDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

/** 是否图片 MIME。 */
function isImageMime(mime: string, payload: string): boolean {
  return mime.startsWith('image/') || isImageDataUrl(payload)
}

/** 拼图片 data URL。 */
function toImageDataUrl(mime: string, payload: string): string {
  if (isImageDataUrl(payload)) return payload
  return `data:${mime || 'image/png'};base64,${stripDataUrl(payload)}`
}

/** 是否知识库上下文附件。 */
export function isJiaorongGuestKnowledgeBaseContextFile(
  row: Record<string, unknown> | null | undefined
): boolean {
  if (!row) return false
  /** 文件路径。 */
  const filePath = typeof row.path === 'string' ? row.path.trim() : ''
  /** MIME 类型。 */
  const mimeType = readMime(row)
  return filePath === JIAORONG_KB_CONTEXT_PATH || mimeType === JIAORONG_KB_CONTEXT_MIME
}

/** 规范化知识库上下文附件。 */
export function normalizeGuestKnowledgeBaseContextFile(
  row: Record<string, unknown>
): Record<string, unknown> {
  /** 事件或请求负载。 */
  const payload = readPayload(row)
  /** 下一步值。 */
  const next: Record<string, unknown> = {
    ...row,
    name: readName(row) || '知识库',
    path: JIAORONG_KB_CONTEXT_PATH,
    mimeType: JIAORONG_KB_CONTEXT_MIME,
    content: payload
  }
  delete next.dataBase64
  return next
}

/** 与超级智能体一致：落临时文件后走 prepareFile，抽取文档文本 / 图片表示。 */
export async function materializeGuestFiles(
  files: unknown,
  port: JiaorongGuestFilePort | undefined
): Promise<unknown[] | undefined> {
  if (!Array.isArray(files)) return undefined
  /** 下一步值。 */
  const next: unknown[] = []
  /** 一条附件。 */
  for (const file of files) {
    /** 单行对象。 */
    const row = asRecord(file)
    if (!row) continue
    if (isJiaorongGuestKnowledgeBaseContextFile(row)) {
      next.push(normalizeGuestKnowledgeBaseContextFile(row))
      continue
    }
    /** 名称。 */
    const name = readName(row)
    /** MIME 类型。 */
    const mimeType = readMime(row)
    /** 文件路径。 */
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
    /** 事件或请求负载。 */
    const payload = readPayload(row)

    if (filePath && isAbsoluteGuestPath(filePath)) {
      if (!port) {
        next.push(file)
        continue
      }
      try {
        next.push(await port.prepareFile(filePath, mimeType || undefined))
      } catch (error) {
        console.warn('[jiaorong-app] Failed to prepare guest file', name, error)
        next.push({ name, path: filePath, mimeType: mimeType || undefined })
      }
      continue
    }

    if (filePath && !payload) continue

    if (!payload) continue
    if (!port) {
      /** 去掉 path 后的附件对象。 */
      const rest = { ...row }
      delete rest.dataBase64
      next.push({
        ...rest,
        name,
        mimeType: mimeType || undefined,
        content: payload
      })
      continue
    }
    try {
      /** 临时路径。 */
      const tempPath = isImageMime(mimeType, payload)
        ? await port.writeImageBase64({
            name,
            content: toImageDataUrl(mimeType, payload)
          })
        : await port.writeTemp({
            name,
            content: Buffer.from(stripDataUrl(payload), 'base64')
          })
      /** 已落地的附件。 */
      const prepared = await port.prepareFile(tempPath, mimeType || undefined)
      next.push({ ...prepared, name })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to materialize guest file', name, error)
    }
  }
  return next
}
