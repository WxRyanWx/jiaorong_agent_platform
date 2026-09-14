import { hostArgs, hostBridge, isAbsoluteFsPath } from './hostDialog'
import type { PendingAttachment } from '../../messageFiles'
import { isImageAttachment, mimeFromFileName } from '../../fileTypeIcon'

/** File 读成 data URL。 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    /** 浏览器 FileReader。 */
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/** 经宿主读文件预览（缩略图/MIME）。 */
export async function readHostFilePreview(
  filePath: string,
  appId?: string
): Promise<{ mimeType: string; thumbnail?: string } | null> {
  /** 宿主桥。 */
  const host = hostBridge()
  if (!host?.invoke || !isAbsoluteFsPath(filePath)) return null
  try {
    /** 调用结果。 */
    const result = await host.invoke('dialog.readFilePreview', {
      ...hostArgs(appId),
      path: filePath
    })
    if (!result || typeof result !== 'object') return null
    /** 单行对象。 */
    const row = result as { mimeType?: unknown; thumbnail?: unknown; code?: unknown }
    if (typeof row.code === 'string') return null
    /** MIME 类型。 */
    const mimeType = typeof row.mimeType === 'string' ? row.mimeType : ''
    /** 缩略图。 */
    const thumbnail = typeof row.thumbnail === 'string' ? row.thumbnail : ''
    return {
      mimeType: mimeType || mimeFromFileName(filePath),
      thumbnail: thumbnail || undefined
    }
  } catch {
    return null
  }
}

/** 补全待发送附件的预览。 */
export async function hydratePendingAttachment(
  item: PendingAttachment,
  appId?: string
): Promise<PendingAttachment> {
  /** MIME 类型。 */
  const mimeType = item.mimeType || mimeFromFileName(item.name)
  /** 下一步值。 */
  const next: PendingAttachment = { ...item, mimeType }
  if (next.thumbnail) return next
  if (next.file && isImageAttachment(next.name, mimeType)) {
    try {
      next.thumbnail = await readAsDataUrl(next.file)
    } catch {
      // 浏览器读失败时仍保留文件本身，发送不受影响。
    }
    return next
  }
  if (next.path && isAbsoluteFsPath(next.path) && isImageAttachment(next.name, mimeType)) {
    /** 预览数据。 */
    const preview = await readHostFilePreview(next.path, appId)
    if (preview?.mimeType) next.mimeType = preview.mimeType
    if (preview?.thumbnail) next.thumbnail = preview.thumbnail
  }
  return next
}

/** 批量补全待发送附件预览。 */
export async function hydratePendingAttachments(
  items: PendingAttachment[],
  appId?: string
): Promise<PendingAttachment[]> {
  return Promise.all(items.map((item) => hydratePendingAttachment(item, appId)))
}
