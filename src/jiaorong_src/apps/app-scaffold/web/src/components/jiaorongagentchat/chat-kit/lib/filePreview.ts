/**
 * 待发送附件预览：浏览器读 Data URL，或走 Host `dialog.readFilePreview` 补缩略图。
 */
import { isAbsoluteFsPath } from './hostDialog'
import { readFilePreview } from '../../../../api'
import type { PendingAttachment } from '../../lib/messageFiles'
import { isImageAttachment, mimeFromFileName } from '../../lib/fileTypeIcon'

/** 用 FileReader 把本地 File 读成 Data URL，供芯片缩略图。 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * 向 Host 要指定绝对路径的 MIME 与缩略图。
 * 无桥、路径非法、或返回带 `code` 的错误对象时返回 null。
 */
export async function readHostFilePreview(
  filePath: string,
  appId?: string
): Promise<{ mimeType: string; thumbnail?: string } | null> {
  if (!isAbsoluteFsPath(filePath)) return null
  try {
    /** 超级智能体预览 invoke 原始结果。 */
    const result = await readFilePreview(filePath, appId)
    // 非对象结果没有预览字段
    if (!result || typeof result !== 'object') return null
    /** 超级智能体预览结果。 */
    const row = result as { mimeType?: unknown; thumbnail?: unknown; code?: unknown }
    // Host 用 code 字段表示失败，不当成预览
    if (typeof row.code === 'string') return null
    /** 超级智能体返回的 MIME。 */
    const mimeType = typeof row.mimeType === 'string' ? row.mimeType : ''
    /** 超级智能体返回的缩略图 Data URL。 */
    const thumbnail = typeof row.thumbnail === 'string' ? row.thumbnail : ''
    return {
      mimeType: mimeType || mimeFromFileName(filePath),
      thumbnail: thumbnail || undefined
    }
  } catch {
    return null
  }
}

/**
 * 补齐单条待发送附件的 MIME 与缩略图。
 * 已有缩略图直接返回；浏览器 File 优先本地读；否则走 Host。
 */
export async function hydratePendingAttachment(
  item: PendingAttachment,
  appId?: string
): Promise<PendingAttachment> {
  /** 已有 MIME 或按文件名推断。 */
  const mimeType = item.mimeType || mimeFromFileName(item.name)
  /** 补齐预览后的附件副本，不改入参。 */
  const next: PendingAttachment = { ...item, mimeType }
  // 调用方已给缩略图，不再读盘
  if (next.thumbnail) return next
  // 浏览器 File 且是图片：本地读 Data URL，不必走超级智能体
  if (next.file && isImageAttachment(next.name, mimeType)) {
    try {
      next.thumbnail = await readAsDataUrl(next.file)
    } catch {
      // 浏览器读失败时仍保留文件本身，发送不受影响。
    }
    return next
  }
  // 仅有绝对路径的图片：向 Host 要预览
  if (next.path && isAbsoluteFsPath(next.path) && isImageAttachment(next.name, mimeType)) {
    /** 超级智能体返回的 MIME 与缩略图。 */
    const preview = await readHostFilePreview(next.path, appId)
    // 超级智能体认出了更准的 MIME
    if (preview?.mimeType) next.mimeType = preview.mimeType
    // 有缩略图才写入，避免用空串盖掉
    if (preview?.thumbnail) next.thumbnail = preview.thumbnail
  }
  return next
}

/**
 * 并行补齐一组待发送附件的预览。
 */
export async function hydratePendingAttachments(
  items: PendingAttachment[],
  appId?: string
): Promise<PendingAttachment[]> {
  return Promise.all(items.map((item) => hydratePendingAttachment(item, appId)))
}
