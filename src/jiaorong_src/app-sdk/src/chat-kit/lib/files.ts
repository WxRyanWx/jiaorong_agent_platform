import type { JiaorongChatMessageFile } from '../types'

export async function fileToMessageFile(file: File): Promise<JiaorongChatMessageFile> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return {
    name: file.name,
    mimeType: file.type || undefined,
    size: file.size,
    dataBase64: btoa(binary)
  }
}

export async function filesToMessageFiles(files: File[]): Promise<JiaorongChatMessageFile[]> {
  return Promise.all(files.map((file) => fileToMessageFile(file)))
}
