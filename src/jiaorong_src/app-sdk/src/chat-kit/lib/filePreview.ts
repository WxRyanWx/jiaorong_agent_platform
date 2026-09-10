import { hostArgs, hostBridge, isAbsoluteFsPath } from './hostDialog'
import type { PendingAttachment } from '../../messageFiles'
import { isImageAttachment, mimeFromFileName } from '../../fileTypeIcon'

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

export async function readHostFilePreview(
  filePath: string,
  appId?: string
): Promise<{ mimeType: string; thumbnail?: string } | null> {
  const host = hostBridge()
  if (!host?.invoke || !isAbsoluteFsPath(filePath)) return null
  try {
    const result = await host.invoke('dialog.readFilePreview', {
      ...hostArgs(appId),
      path: filePath
    })
    if (!result || typeof result !== 'object') return null
    const row = result as { mimeType?: unknown; thumbnail?: unknown; code?: unknown }
    if (typeof row.code === 'string') return null
    const mimeType = typeof row.mimeType === 'string' ? row.mimeType : ''
    const thumbnail = typeof row.thumbnail === 'string' ? row.thumbnail : ''
    return {
      mimeType: mimeType || mimeFromFileName(filePath),
      thumbnail: thumbnail || undefined
    }
  } catch {
    return null
  }
}

export async function hydratePendingAttachment(
  item: PendingAttachment,
  appId?: string
): Promise<PendingAttachment> {
  const mimeType = item.mimeType || mimeFromFileName(item.name)
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
    const preview = await readHostFilePreview(next.path, appId)
    if (preview?.mimeType) next.mimeType = preview.mimeType
    if (preview?.thumbnail) next.thumbnail = preview.thumbnail
  }
  return next
}

export async function hydratePendingAttachments(
  items: PendingAttachment[],
  appId?: string
): Promise<PendingAttachment[]> {
  return Promise.all(items.map((item) => hydratePendingAttachment(item, appId)))
}
