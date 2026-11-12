/** 反馈正文：编辑区读写，以及提交给后端的 HTML。 */

export const FEEDBACK_TEXT_LIMIT = 5000
export const FEEDBACK_IMAGE_LIMIT = 10
export const FEEDBACK_IMAGE_MAX_BYTES = 50 * 1024 * 1024
export const FEEDBACK_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

export const FEEDBACK_RATING_LABELS = ['很差', '较差', '一般', '很好', '很棒'] as const

export type FeedbackPart = { kind: 'text'; text: string } | { kind: 'image'; fileToken: string }

export type FeedbackEditorState = {
  parts: FeedbackPart[]
  textLength: number
  imageCount: number
  hasText: boolean
}

const FILE_TOKEN = /^[A-Za-z0-9]+$/

/**
 * 评分、文字或图片任一存在即可提交。
 */
export function canSubmitFeedback(rating: number, state: FeedbackEditorState): boolean {
  return rating > 0 || state.hasText || state.imageCount > 0
}

/**
 * 按剩余字数截断粘贴文本。换行不占 5000 字额度。
 * @param text 待插入文本
 * @param usedLength 编辑区已有字数（不含换行）
 */
export function clipFeedbackText(text: string, usedLength: number): string {
  let count = usedLength
  let result = ''
  for (const char of text) {
    if (char !== '\n' && char !== '\r') {
      if (count >= FEEDBACK_TEXT_LIMIT) break
      count += 1
    }
    result += char
  }
  return result
}

/**
 * 校验粘贴进来的图片，返回给用户看的失败原因。
 * @param file 剪贴板文件
 * @param imageCount 编辑区里已有的图片数
 */
export function feedbackImageRejection(file: File, imageCount: number): string | null {
  if (!FEEDBACK_IMAGE_TYPES.includes(file.type)) return '只支持上传 jpg、jpeg、png 格式的图片'
  if (file.size > FEEDBACK_IMAGE_MAX_BYTES) return '图片大小不能超过 50MB'
  if (imageCount >= FEEDBACK_IMAGE_LIMIT) return '最多只能上传 10 张图片'
  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>')
}

/**
 * 拼网页端同款评论 HTML。图片只用相对下载地址，便于服务端原样保存。
 */
export function buildFeedbackComment(parts: FeedbackPart[]): string {
  const html = parts
    .map((part) => {
      if (part.kind === 'text') return escapeHtml(part.text)
      if (!FILE_TOKEN.test(part.fileToken)) return ''
      return `<img src="/api/sys-storage/download?f8s=${part.fileToken}" alt="" data-href="" style=""/>`
    })
    .join('')
  return `<p>${html}</p>`
}

function appendPart(parts: FeedbackPart[], part: FeedbackPart): void {
  if (part.kind === 'image') {
    parts.push(part)
    return
  }
  if (!part.text) return
  const prev = parts[parts.length - 1]
  if (prev?.kind === 'text') {
    prev.text += part.text
    return
  }
  parts.push(part)
}

function walkEditor(node: Node, parts: FeedbackPart[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    appendPart(parts, { kind: 'text', text: node.textContent ?? '' })
    return
  }
  if (!(node instanceof HTMLElement)) return
  if (node instanceof HTMLImageElement) {
    const token = node.dataset.f8s?.trim() ?? ''
    if (FILE_TOKEN.test(token)) appendPart(parts, { kind: 'image', fileToken: token })
    return
  }
  if (node instanceof HTMLBRElement) {
    appendPart(parts, { kind: 'text', text: '\n' })
    return
  }
  node.childNodes.forEach((child) => walkEditor(child, parts))
  if (node.tagName === 'DIV' || node.tagName === 'P') {
    appendPart(parts, { kind: 'text', text: '\n' })
  }
}

/**
 * 从编辑区抽出文字和已上传图片。只认 `data-f8s`，忽略任意粘贴进来的外链图片。
 */
export function readFeedbackEditor(root: ParentNode): FeedbackEditorState {
  const parts: FeedbackPart[] = []
  root.childNodes.forEach((child) => walkEditor(child, parts))
  const text = parts
    .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
    .map((part) => part.text)
    .join('')
  return {
    parts,
    textLength: text.replace(/[\n\r]/g, '').length,
    imageCount: parts.filter((part) => part.kind === 'image').length,
    hasText: text.trim().length > 0
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

/**
 * 列表摘要：纯文本截断，并取出第一张本站图片的 fileToken。
 */
export function previewFeedbackComment(html: string): { text: string; fileToken: string | null } {
  const tokenMatch = html.match(/\/api\/sys-storage\/download\?f8s=([A-Za-z0-9]+)/)
  const text = stripTags(html).replace(/\s+/g, ' ').trim()
  const clipped = text.length > 50 ? `${text.slice(0, 50)}...` : text
  return { text: clipped, fileToken: tokenMatch?.[1] ?? null }
}
