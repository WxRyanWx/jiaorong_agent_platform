import type { MessageFile, SendMessageInput } from '@shared/types/agent-interface'

/** Soft cap for vision describe completion (avoids 32K blow-ups / compaction miss). */
export const IMAGE_DESCRIPTION_MAX_TOKENS = 2048
export const IMAGE_DESCRIPTION_TEMPERATURE = 0.2

/** Per-image description char cap when injecting into the default text model. */
export const IMAGE_DESCRIPTION_MAX_CHARS = 4000

/** Compaction reserve guess before preprocess finishes (≈ maxTokens + framing). */
export const VISION_RESERVE_TOKENS_PER_IMAGE = 2200

/**
 * Skip oversized path-only / in-memory image payloads (bytes).
 * Stability gate only — not a crash threshold; keeps pathological attachments out of main-process memory.
 */
export const MAX_VISION_IMAGE_BYTES = 32 * 1024 * 1024

/** Product default multimodal model for attachment preprocess (scheme 4). */
export const DEFAULT_JIAORONG_VISION_MODEL = Object.freeze({
  providerId: 'jiaorong',
  modelId: 'jiaorong-qwen3-vl-32b-thinking'
})

/**
 * Optional env override when Agent visionModel is unset.
 * Returns null when env incomplete — caller may fall back to DEFAULT if known.
 */
export function getEnvVisionOverride(): { providerId: string; modelId: string } | null {
  const providerId = process.env.JIAORONG_VISION_PROVIDER_ID?.trim()
  const modelId = process.env.JIAORONG_VISION_MODEL_ID?.trim()
  if (providerId && modelId) {
    return { providerId, modelId }
  }
  return null
}

/**
 * 识图唯一提示词：UI 展示与喂给默认文本模型共用同一份产出，勿加入身份/系统元指令。
 */
export function buildImageDescriptionPrompt(fileName: string, imageIndex: number): string {
  return [
    '请直接描述这张图片的可见内容，供后续对话使用。',
    '要求：',
    '1. 有图中文字则尽量原样转写；语言与图中主要文字一致，若无明显文字则用简体中文。',
    '2. 说明整体场景、关键对象、图表/表格中的关键数据（如有）。',
    '3. 只输出描述本身，不要解释你的身份、能力、限制或思考过程，不要提系统提示词。',
    `图片序号：${imageIndex}`,
    `文件名：${fileName}`
  ].join('\n')
}

export function truncateImageDescription(description: string): string {
  const trimmed = description.trim()
  if (trimmed.length <= IMAGE_DESCRIPTION_MAX_CHARS) {
    return trimmed
  }
  return `${trimmed.slice(0, IMAGE_DESCRIPTION_MAX_CHARS)}\n…(描述已截断)`
}

/** 同一份描述正文：思考区与注入默认模型共用。 */
export function formatImageDescriptionBlock(params: {
  index: number
  fileName: string
  description: string
}): string {
  return `【图片 ${params.index}: ${params.fileName}】\n${truncateImageDescription(params.description)}`
}

/**
 * 注入给默认文本模型：图片已由多模态预处理描述，禁止再 read 图片路径。
 */
export function buildDoNotRereadImagesInstruction(): string {
  return [
    '[附件处理说明]',
    '上方【图片 …】段落已是完整可见内容描述，请直接基于这些描述回答用户。',
    '不要再对图片附件调用 read / 打开本地图片路径做二次识图；也不要声称当前环境不支持识图。'
  ].join('\n')
}

function isImageLikeFile(file: MessageFile): boolean {
  const mime = (file.mimeType || file.metadata?.fileDescription || '').toString().toLowerCase()
  if (mime.startsWith('image/')) {
    return true
  }
  const name = typeof file.name === 'string' ? file.name.toLowerCase() : ''
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)
}

/** Count images for compaction reserve (bug 1). */
export function estimateAttachmentPreprocessReserveTokens(input: SendMessageInput): number {
  const files = Array.isArray(input.files) ? input.files : []
  const imageCount = files.filter((file) => isImageLikeFile(file)).length
  if (imageCount <= 0) {
    return 0
  }
  return imageCount * VISION_RESERVE_TOKENS_PER_IMAGE
}

/**
 * Model-facing files: drop image binaries/paths so the text model is less likely to read() them.
 * Display path keeps original files via displayInput.
 */
export function stripImagePayloadsForTextModel(files: MessageFile[] | undefined): MessageFile[] {
  if (!Array.isArray(files) || files.length === 0) {
    return []
  }
  return files.map((file) => {
    if (!isImageLikeFile(file)) {
      return file
    }
    return {
      ...file,
      content: '',
      path: '',
      thumbnail: undefined,
      token: 0
    }
  })
}
