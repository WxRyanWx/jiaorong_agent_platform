/**
 * 浏览器 File / 待发附件转成超级智能体 MessageFile。
 * 给 runtime.sendDraft 与输入框选文件后组 content.files 使用。
 */

import type { MessageFile } from '../model/host'
import { mimeFromFileName } from './fileTypeIcon'

/**
 * 输入区尚未发送的附件。
 * 有本地绝对路径时只传 path，由超级智能体 prepareFile；否则带上 File 在浏览器里读内容。
 */
export type PendingAttachment = {
  /** 展示与发送用的文件名。 */
  name: string
  /** 本地绝对路径；有则优先走 path，不内嵌 content。 */
  path?: string
  /** 已知 MIME。 */
  mimeType?: string
  /** 浏览器 File；无绝对路径时用来读字节。 */
  file?: File
  /** 预览缩略图。 */
  thumbnail?: string
}

/**
 * 判断字符串是否为本地绝对路径（POSIX、Windows 盘符或 UNC）。
 * @param value 路径或其它字符串
 * @returns 是绝对路径则为 true，可交给超级智能体 prepareFile
 */
export function isAbsoluteFsPath(value: string) {
  /** 去掉首尾空白后再认 POSIX / 盘符 / UNC。 */
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

/**
 * 从路径取出末段文件名。
 * @param filePath 本地或相对路径
 * @returns 最后一段；整串都是分隔符时退回原值
 */
export function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath
}

/**
 * 去掉 data URL 前缀，只留 base64 正文。
 * @param value 完整 data URL 或已经是 base64
 * @returns `base64,` 之后的片段；没有前缀则原样返回
 */
function stripDataUrlBase64(value: string) {
  /** data URL 里 base64 正文的分隔标记。 */
  const marker = 'base64,'
  /** 标记起点；-1 表示已经是纯 base64。 */
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

/** 把字节分块拼成二进制字符串再 btoa，避免超大 TypedArray 一次展开爆栈。 */
function bytesToBase64(bytes: Uint8Array): string {
  /** 分块拼出的二进制字符串，最后交给 btoa。 */
  let binary = ''
  /** 每块 32KB，避免一次展开超大 TypedArray。 */
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 用 FileReader 读成 data URL，给图片附件内嵌预览。 */
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

/** 用浏览器 File 填超级智能体 metadata 字段。 */
function metadataOf(file: File) {
  /** 浏览器读不到真实创建时间，用当前时刻占位。 */
  const now = new Date().toISOString()
  return {
    fileName: file.name || 'file',
    fileSize: file.size,
    fileDescription: file.type || '',
    fileCreated: now,
    fileModified: now
  }
}

/**
 * 浏览器兜底：没有超级智能体选文件对话框时，把 File 打成 content。
 * 图片走 data URL，其它类型走 base64。
 * @param file 浏览器 File
 * @returns 可放进 session.send 的 MessageFile
 */
export async function fileToMessageFile(file: File): Promise<MessageFile> {
  /** 浏览器给出的 MIME；空则留给超级智能体再推断。 */
  const mimeType = file.type || undefined
  /** 展示名；无名图片用 image，其它用 file。 */
  const name = file.name || (mimeType?.startsWith('image/') ? 'image' : 'file')
  // 图片用 data URL，气泡能直接当缩略图
  if (mimeType?.startsWith('image/')) {
    /** 图片 data URL，气泡可当缩略图。 */
    const content = await readAsDataUrl(file)
    return {
      name,
      content,
      mimeType,
      metadata: metadataOf(file)
    }
  }
  /** 非图片文件的原始字节，再转 base64。 */
  const buffer = await file.arrayBuffer()
  return {
    name,
    mimeType,
    content: bytesToBase64(new Uint8Array(buffer)),
    metadata: metadataOf(file)
  }
}

/**
 * 与超级智能体一致：有本地绝对路径就只传 path，由超级智能体 prepareFile。
 * @param item 输入区待发附件
 * @returns MessageFile；无路径且无 File 时只带 name / mimeType
 */
export async function pendingToMessageFile(item: PendingAttachment): Promise<MessageFile> {
  /** 待发附件上的本地绝对路径；空则改走浏览器 File。 */
  const filePath = item.path?.trim() || ''
  // 绝对路径交给超级智能体读盘，避免把大文件打进页面内存
  if (filePath && isAbsoluteFsPath(filePath)) {
    /** 展示名；空则用路径末段。 */
    const name = item.name.trim() || fileNameFromPath(filePath)
    return {
      name,
      path: filePath,
      mimeType: item.mimeType || undefined,
      metadata: { fileName: name }
    }
  }
  // 只有浏览器 File：读内容内嵌
  if (item.file) return fileToMessageFile(item.file)
  return {
    name: item.name.trim() || 'file',
    mimeType: item.mimeType || undefined
  }
}

/**
 * 把 File 与 PendingAttachment 混列表统一转成 MessageFile。
 * @param files 待发送附件
 * @returns 与输入顺序一致的 MessageFile 数组
 */
export async function filesToMessageFiles(
  files: Array<File | PendingAttachment>
): Promise<MessageFile[]> {
  return Promise.all(
    files.map((file) =>
      file instanceof File ? fileToMessageFile(file) : pendingToMessageFile(file)
    )
  )
}

/**
 * 从 Electron / 超级智能体扩展过的 File 上读绝对路径。
 * @param file 可能带 path 字段的浏览器 File
 * @returns 绝对路径；没有或不是绝对路径则空串
 */
export function filePathOf(file: File): string {
  /** Electron 扩展在 File 上挂的绝对路径。 */
  const fromFile = (file as File & { path?: string }).path?.trim()
  // 只有绝对路径才能交给超级智能体 prepareFile
  if (fromFile && isAbsoluteFsPath(fromFile)) return fromFile
  return ''
}

/**
 * 把 `<input type="file">` 选中的 File 收成待发附件。
 * @param files 浏览器文件列表
 * @returns 带 name / mime / 可选 path 的 PendingAttachment
 */
export function browserFilesToPending(files: File[]): PendingAttachment[] {
  return files.map((file) => {
    /** 能解析出的本地绝对路径；浏览器环境通常为空。 */
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
