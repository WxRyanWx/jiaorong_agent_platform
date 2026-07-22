import fs from 'fs'
import os from 'os'
import path from 'path'
import { app } from 'electron'
import type { MessageFile } from '@shared/types/agent-interface'
import { MAX_VISION_IMAGE_BYTES } from './config'
import type { ImageAttachmentRef } from './types'

function resolveMimeType(file: MessageFile): string {
  if (typeof file.mimeType === 'string' && file.mimeType.trim()) {
    return file.mimeType.split(';')[0]!.trim().toLowerCase()
  }
  const description = file.metadata?.fileDescription
  if (typeof description === 'string' && description.trim()) {
    return description.split(';')[0]!.trim().toLowerCase()
  }
  return ''
}

export function isImageFile(file: MessageFile): boolean {
  const mime = resolveMimeType(file)
  if (mime.startsWith('image/')) {
    return true
  }
  const name = typeof file.name === 'string' ? file.name.toLowerCase() : ''
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

export function isAudioFile(file: MessageFile): boolean {
  return resolveMimeType(file).startsWith('audio/')
}

function extensionToMime(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  return 'image/png'
}

/** Approximate decoded byte length of a base64 payload. */
export function estimateBase64PayloadBytes(base64: string): number {
  const cleaned = base64.replace(/\s/g, '')
  if (!cleaned) {
    return 0
  }
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding)
}

export function estimateDataUrlPayloadBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    return Buffer.byteLength(dataUrl, 'utf8')
  }
  const meta = dataUrl.slice(0, comma).toLowerCase()
  const payload = dataUrl.slice(comma + 1)
  if (meta.includes(';base64')) {
    return estimateBase64PayloadBytes(payload)
  }
  try {
    return Buffer.byteLength(decodeURIComponent(payload), 'utf8')
  } catch {
    return Buffer.byteLength(payload, 'utf8')
  }
}

/** PNG / JPEG / GIF / WEBP / BMP / SVG signatures (and XML-wrapped SVG). */
export function bufferLooksLikeImage(buf: Buffer): boolean {
  if (buf.length < 3) {
    return false
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return true
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return true
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x39 || buf[4] === 0x37) &&
    buf[5] === 0x61
  ) {
    return true
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return true
  }
  const head = buf
    .subarray(0, Math.min(buf.length, 256))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return true
  }
  return false
}

function decodeDataUrlToBuffer(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    return null
  }
  const meta = dataUrl.slice(0, comma).toLowerCase()
  const payload = dataUrl.slice(comma + 1)
  try {
    if (meta.includes(';base64')) {
      return Buffer.from(payload.replace(/\s/g, ''), 'base64')
    }
    return Buffer.from(decodeURIComponent(payload), 'utf8')
  } catch {
    return null
  }
}

export function getVisionDiskReadRoots(): string[] {
  const roots: string[] = []
  try {
    const userData = app.getPath('userData')
    roots.push(path.join(userData, 'temp'), path.join(userData, 'images'))
  } catch {
    // Tests / non-Electron import paths may lack app.
  }
  roots.push(os.tmpdir())
  return roots.map((root) => {
    try {
      return typeof fs.realpathSync === 'function' ? fs.realpathSync(root) : path.resolve(root)
    } catch {
      return path.resolve(root)
    }
  })
}

export function isPathInsideRoots(resolvedPath: string, roots: string[]): boolean {
  const normalized = path.resolve(resolvedPath)
  return roots.some((root) => {
    const relative = path.relative(root, normalized)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })
}

function resolveRealPath(filePath: string): string | null {
  try {
    if (typeof fs.realpathSync === 'function') {
      return fs.realpathSync(filePath)
    }
    return path.resolve(filePath)
  } catch {
    return null
  }
}

function acceptInMemoryImagePayload(dataUrl: string): string | null {
  const bytes = estimateDataUrlPayloadBytes(dataUrl)
  if (bytes <= 0 || bytes > MAX_VISION_IMAGE_BYTES) {
    return null
  }
  const buf = decodeDataUrlToBuffer(dataUrl)
  if (!buf || !bufferLooksLikeImage(buf)) {
    return null
  }
  return dataUrl
}

/**
 * Resolve a data URL usable by vision APIs.
 * Disk reads: realpath + allowlisted app dirs + image magic + size limit.
 * In-memory: try content first, then thumbnail if content fails validation.
 */
export function resolveImageDataUrl(file: MessageFile): string | null {
  const primary = typeof file.content === 'string' ? file.content.trim() : ''
  const fallback = typeof file.thumbnail === 'string' ? file.thumbnail.trim() : ''
  const mime = resolveMimeType(file) || 'image/png'

  if (primary.startsWith('data:image/')) {
    const accepted = acceptInMemoryImagePayload(primary)
    if (accepted) {
      return accepted
    }
    // Fall through: oversized/invalid full image may still have a usable thumbnail.
  }
  if (fallback.startsWith('data:image/')) {
    const accepted = acceptInMemoryImagePayload(fallback)
    if (accepted) {
      return accepted
    }
  }
  if (primary && /^[A-Za-z0-9+/=\s]+$/.test(primary) && primary.replace(/\s/g, '').length > 32) {
    const cleaned = primary.replace(/\s/g, '')
    if (estimateBase64PayloadBytes(cleaned) <= MAX_VISION_IMAGE_BYTES) {
      try {
        const buf = Buffer.from(cleaned, 'base64')
        if (bufferLooksLikeImage(buf)) {
          return `data:${mime.startsWith('image/') ? mime : 'image/png'};base64,${cleaned}`
        }
      } catch {
        // try thumbnail / path below
      }
    }
    if (fallback.startsWith('data:image/')) {
      const accepted = acceptInMemoryImagePayload(fallback)
      if (accepted) {
        return accepted
      }
    }
  }

  const filePath = typeof file.path === 'string' ? file.path.trim() : ''
  if (!filePath || !fs.existsSync(filePath)) {
    return null
  }

  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_VISION_IMAGE_BYTES) {
      return null
    }

    const resolved = resolveRealPath(filePath)
    if (!resolved) {
      return null
    }

    const roots = getVisionDiskReadRoots()
    // Disk reads only from app temp/images + OS tmp (after realpath). In-memory payloads
    // cover normal uploads; this blocks forged MessageFile.path to arbitrary files.
    if (!isPathInsideRoots(resolved, roots)) {
      return null
    }

    const buf = fs.readFileSync(resolved)
    if (buf.length === 0 || buf.length > MAX_VISION_IMAGE_BYTES) {
      return null
    }
    if (!bufferLooksLikeImage(buf)) {
      return null
    }

    const resolvedMime = mime.startsWith('image/') ? mime : extensionToMime(resolved)
    return `data:${resolvedMime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export function explainImageResolveFailure(file: MessageFile): string {
  const mb = Math.floor(MAX_VISION_IMAGE_BYTES / (1024 * 1024))
  const primary = typeof file.content === 'string' ? file.content.trim() : ''
  const fallback = typeof file.thumbnail === 'string' ? file.thumbnail.trim() : ''
  const filePath = typeof file.path === 'string' ? file.path.trim() : ''

  const dataUrl = primary.startsWith('data:image/')
    ? primary
    : fallback.startsWith('data:image/')
      ? fallback
      : ''
  if (dataUrl) {
    if (estimateDataUrlPayloadBytes(dataUrl) > MAX_VISION_IMAGE_BYTES) {
      return `图片过大（超过 ${mb}MB），已跳过识图`
    }
    return '图片内容无法识别为有效图像，已跳过识图'
  }

  if (primary && /^[A-Za-z0-9+/=\s]+$/.test(primary) && primary.replace(/\s/g, '').length > 32) {
    if (estimateBase64PayloadBytes(primary.replace(/\s/g, '')) > MAX_VISION_IMAGE_BYTES) {
      return `图片过大（超过 ${mb}MB），已跳过识图`
    }
    return '图片内容无法识别为有效图像，已跳过识图'
  }

  if (filePath && fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath)
      if (stat.size > MAX_VISION_IMAGE_BYTES) {
        return `图片过大（超过 ${mb}MB），已跳过识图`
      }
      if (stat.size <= 0) {
        return '图片文件为空，已跳过识图'
      }
      const resolved = resolveRealPath(filePath)
      if (!resolved) {
        return '无法解析图片路径，已跳过识图'
      }
      if (!isPathInsideRoots(resolved, getVisionDiskReadRoots())) {
        return '图片路径不在允许的附件目录内，已跳过识图'
      }
      const buf = fs.readFileSync(resolved)
      if (!bufferLooksLikeImage(buf)) {
        return '图片内容无法识别为有效图像，已跳过识图'
      }
      return '无法读取图片文件内容，已跳过识图'
    } catch {
      return '无法读取图片文件内容，已跳过识图'
    }
  }

  return '无法读取图片内容（缺少可用像素数据）'
}

export function collectImageAttachments(files: MessageFile[]): ImageAttachmentRef[] {
  const refs: ImageAttachmentRef[] = []
  files.forEach((file, index) => {
    if (!isImageFile(file)) {
      return
    }
    const dataUrl = resolveImageDataUrl(file)
    if (!dataUrl) {
      return
    }
    refs.push({ index, file, dataUrl })
  })
  return refs
}

/** Images that look like images but cannot be turned into a vision payload. */
export function collectUnreadableImageAttachments(
  files: MessageFile[]
): Array<{ index: number; file: MessageFile; reason: string }> {
  const results: Array<{ index: number; file: MessageFile; reason: string }> = []
  files.forEach((file, index) => {
    if (!isImageFile(file)) {
      return
    }
    if (resolveImageDataUrl(file)) {
      return
    }
    results.push({ index, file, reason: explainImageResolveFailure(file) })
  })
  return results
}

/** Empty non-image files with their 0-based index in the original files array. */
export function collectEmptyNonImageFiles(
  files: MessageFile[]
): Array<{ index: number; file: MessageFile }> {
  const results: Array<{ index: number; file: MessageFile }> = []
  files.forEach((file, index) => {
    if (isImageFile(file) || isAudioFile(file)) {
      return
    }
    const content = typeof file.content === 'string' ? file.content.trim() : ''
    if (content.length === 0) {
      results.push({ index, file })
    }
  })
  return results
}
