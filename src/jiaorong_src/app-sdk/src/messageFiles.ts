/** 消息附件结构。 */

import type { MessageFile } from './types'
import { mimeFromFileName } from './fileTypeIcon'

/** 待发送附件（含浏览器 File）。 */
export type PendingAttachment = {
  /** 名称。 */
  name: string
  /** 路径。 */
  path?: string
  /** MIME 类型。 */
  mimeType?: string
  /** 单个文件。 */
  file?: File
  /** 缩略图。 */
  thumbnail?: string
}

/** 是否绝对路径。 */
export function isAbsoluteFsPath(value: string) {
  /** 路径字符串。 */
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

/** 从路径取文件名。 */
export function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath
}

/** 去掉 data URL 的 base64 前缀。 */
function stripDataUrlBase64(value: string) {
  /** data URL 里的 base64, 标记。 */
  const marker = 'base64,'
  /** 下标。 */
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

/** 字节转 base64。 */
function bytesToBase64(bytes: Uint8Array): string {
  /** 二进制拼出的字符串。 */
  let binary = ''
  /** 按块编码的字节长度。 */
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

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

/** 读浏览器 File 元数据。 */
function metadataOf(file: File) {
  /** 当前时间戳。 */
  const now = new Date().toISOString()
  return {
    fileName: file.name || 'file',
    fileSize: file.size,
    fileDescription: file.type || '',
    fileCreated: now,
    fileModified: now
  }
}

/** 浏览器兜底：没有宿主选文件对话框时，把 File 打成 content。 */
export async function fileToMessageFile(file: File): Promise<MessageFile> {
  /** MIME 类型。 */
  const mimeType = file.type || undefined
  /** 名称。 */
  const name = file.name || (mimeType?.startsWith('image/') ? 'image' : 'file')
  if (mimeType?.startsWith('image/')) {
    /** 内容。 */
    const content = await readAsDataUrl(file)
    return {
      name,
      content,
      mimeType,
      metadata: metadataOf(file)
    }
  }
  /** 未拆完的行缓冲。 */
  const buffer = await file.arrayBuffer()
  return {
    name,
    mimeType,
    content: bytesToBase64(new Uint8Array(buffer)),
    metadata: metadataOf(file)
  }
}

/** 与超级智能体一致：有本地绝对路径就只传 path，由宿主 prepareFile。 */
export async function pendingToMessageFile(item: PendingAttachment): Promise<MessageFile> {
  /** 文件路径。 */
  const filePath = item.path?.trim() || ''
  if (filePath && isAbsoluteFsPath(filePath)) {
    /** 名称。 */
    const name = item.name.trim() || fileNameFromPath(filePath)
    return {
      name,
      path: filePath,
      mimeType: item.mimeType || undefined,
      metadata: { fileName: name }
    }
  }
  if (item.file) return fileToMessageFile(item.file)
  return {
    name: item.name.trim() || 'file',
    mimeType: item.mimeType || undefined
  }
}

/** File[] 转 MessageFile[]。 */
export async function filesToMessageFiles(
  files: Array<File | PendingAttachment>
): Promise<MessageFile[]> {
  return Promise.all(
    files.map((file) =>
      file instanceof File ? fileToMessageFile(file) : pendingToMessageFile(file)
    )
  )
}

/** 待发送附件的路径。 */
export function filePathOf(file: File): string {
  /** 从 File 解析出的路径。 */
  const fromFile = (file as File & { path?: string }).path?.trim()
  if (fromFile && isAbsoluteFsPath(fromFile)) return fromFile
  return ''
}

/** 浏览器 File 转 PendingAttachment。 */
export function browserFilesToPending(files: File[]): PendingAttachment[] {
  return files.map((file) => {
    /** 路径。 */
    const path = filePathOf(file)
    return {
      name: file.name || 'file',
      mimeType: file.type || mimeFromFileName(file.name),
      path: path || undefined,
      file
    }
  })
}

export { stripDataUrlBase64 }
