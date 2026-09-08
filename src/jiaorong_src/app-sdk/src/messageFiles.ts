import type { MessageFile } from './types'

export type PendingAttachment = {
  name: string
  path?: string
  mimeType?: string
  file?: File
}

export function isAbsoluteFsPath(value: string) {
  const pathValue = value.trim()
  return (
    pathValue.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathValue) || pathValue.startsWith('\\\\')
  )
}

export function fileNameFromPath(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath
}

function stripDataUrlBase64(value: string) {
  const marker = 'base64,'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

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

function metadataOf(file: File) {
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
  const mimeType = file.type || undefined
  const name = file.name || (mimeType?.startsWith('image/') ? 'image' : 'file')
  if (mimeType?.startsWith('image/')) {
    const content = await readAsDataUrl(file)
    return {
      name,
      content,
      mimeType,
      metadata: metadataOf(file)
    }
  }
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
  const filePath = item.path?.trim() || ''
  if (filePath && isAbsoluteFsPath(filePath)) {
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

export async function filesToMessageFiles(
  files: Array<File | PendingAttachment>
): Promise<MessageFile[]> {
  return Promise.all(
    files.map((file) =>
      file instanceof File ? fileToMessageFile(file) : pendingToMessageFile(file)
    )
  )
}

export function browserFilesToPending(files: File[]): PendingAttachment[] {
  return files.map((file) => ({
    name: file.name || 'file',
    mimeType: file.type || undefined,
    file
  }))
}

export { stripDataUrlBase64 }
