import { isAbsoluteGuestPath } from './guestBind'

export type JiaorongGuestFilePort = {
  writeTemp(file: { name: string; content: Buffer | string }): Promise<string>
  writeImageBase64(file: { name: string; content: string }): Promise<string>
  prepareFile(path: string, mimeType?: string): Promise<Record<string, unknown>>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readName(row: Record<string, unknown>): string {
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  return name || 'file'
}

function readMime(row: Record<string, unknown>): string {
  if (typeof row.mimeType === 'string' && row.mimeType.trim()) return row.mimeType.trim()
  if (typeof row.type === 'string' && row.type.trim()) return row.type.trim()
  return ''
}

function readPayload(row: Record<string, unknown>): string {
  if (typeof row.content === 'string' && row.content.trim()) return row.content.trim()
  if (typeof row.dataBase64 === 'string' && row.dataBase64.trim()) return row.dataBase64.trim()
  return ''
}

function stripDataUrl(value: string): string {
  const marker = 'base64,'
  const index = value.indexOf(marker)
  return index >= 0 ? value.slice(index + marker.length) : value
}

function isImageDataUrl(value: string): boolean {
  return value.startsWith('data:image/')
}

function isImageMime(mime: string, payload: string): boolean {
  return mime.startsWith('image/') || isImageDataUrl(payload)
}

function toImageDataUrl(mime: string, payload: string): string {
  if (isImageDataUrl(payload)) return payload
  return `data:${mime || 'image/png'};base64,${stripDataUrl(payload)}`
}

/** 与超级智能体一致：落临时文件后走 prepareFile，抽取文档文本 / 图片表示。 */
export async function materializeGuestFiles(
  files: unknown,
  port: JiaorongGuestFilePort | undefined
): Promise<unknown[] | undefined> {
  if (!Array.isArray(files)) return undefined
  const next: unknown[] = []
  for (const file of files) {
    const row = asRecord(file)
    if (!row) continue
    const name = readName(row)
    const mimeType = readMime(row)
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
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
      const tempPath = isImageMime(mimeType, payload)
        ? await port.writeImageBase64({
            name,
            content: toImageDataUrl(mimeType, payload)
          })
        : await port.writeTemp({
            name,
            content: Buffer.from(stripDataUrl(payload), 'base64')
          })
      const prepared = await port.prepareFile(tempPath, mimeType || undefined)
      next.push({ ...prepared, name })
    } catch (error) {
      console.warn('[jiaorong-app] Failed to materialize guest file', name, error)
    }
  }
  return next
}
