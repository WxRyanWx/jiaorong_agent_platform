import type {
  MessageFile,
  SendMessageInput,
  UserMessageContent
} from '@shared/types/agent-interface'
import {
  buildDoNotRereadImagesInstruction,
  formatImageDescriptionBlock,
  stripImagePayloadsForTextModel
} from './config'

export const JIAORONG_VISION_PREPROCESS_META_KEY = 'jiaorongVisionPreprocess'
export const JIAORONG_EMPTY_ATTACHMENT_META_KEY = 'jiaorongEmptyAttachment'
export const JIAORONG_SKIPPED_IMAGE_META_KEY = 'jiaorongVisionSkipped'

export type JiaorongVisionPreprocessMeta = {
  index: number
  description: string
}

export type JiaorongSkippedImageMeta = {
  index: number
  reason: string
}

/** Shared model-facing text builder (current turn + history rehydrate). */
export function buildAugmentedAttachmentText(params: {
  originalText: string
  imageBlocks: Array<{ index: number; fileName: string; description: string }>
  emptyFiles: Array<{ index: number; name: string }>
  skippedImages?: Array<{ index: number; fileName: string; reason: string }>
}): string {
  const sections: string[] = []
  if (params.originalText.trim()) {
    sections.push(params.originalText.trim())
  }

  if (params.imageBlocks.length > 0) {
    sections.push(
      params.imageBlocks.map((block) => formatImageDescriptionBlock(block)).join('\n\n')
    )
    sections.push(buildDoNotRereadImagesInstruction())
  }

  if (params.skippedImages && params.skippedImages.length > 0) {
    const skippedSection = [
      '[附件识图未完成]',
      ...params.skippedImages.map(
        (file) => `【图片 ${file.index}: ${file.fileName}】${file.reason}`
      )
    ].join('\n')
    sections.push(skippedSection)
    if (params.imageBlocks.length === 0) {
      sections.push(
        [
          '[附件处理说明]',
          '上述图片未能完成识图，请勿再对图片附件调用 read / 打开本地图片路径；也不要声称已看见这些图片的像素内容。'
        ].join('\n')
      )
    }
  }

  if (params.emptyFiles.length > 0) {
    const emptySection = [
      '[附件无法读取正文]',
      ...params.emptyFiles.map(
        (file) =>
          `【文件 ${file.index}: ${file.name}】内容提取为空，文本模型无法直接阅读该文件正文。`
      )
    ].join('\n')
    sections.push(emptySection)
  }

  return sections.join('\n\n')
}

function readVisionMeta(file: MessageFile): JiaorongVisionPreprocessMeta | null {
  const raw = file.metadata?.[JIAORONG_VISION_PREPROCESS_META_KEY]
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const index = typeof record.index === 'number' ? record.index : Number(record.index)
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  if (!Number.isFinite(index) || index <= 0 || !description) {
    return null
  }
  return { index, description }
}

function readSkippedMeta(file: MessageFile): JiaorongSkippedImageMeta | null {
  const raw = file.metadata?.[JIAORONG_SKIPPED_IMAGE_META_KEY]
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const index = typeof record.index === 'number' ? record.index : Number(record.index)
  const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
  if (!Number.isFinite(index) || index <= 0 || !reason) {
    return null
  }
  return { index, reason }
}

/** Public helper for reuse-on-retry paths. */
export function readStoredVisionPreprocessMeta(
  file: MessageFile
): JiaorongVisionPreprocessMeta | null {
  return readVisionMeta(file)
}

function isMarkedEmptyAttachment(file: MessageFile): boolean {
  return file.metadata?.[JIAORONG_EMPTY_ATTACHMENT_META_KEY] === true
}

/**
 * UI-facing store payload: keep original text + thumbnails/paths;
 * stash descriptions / skip reasons in file metadata for later rehydrate.
 */
export function buildPersistableUserContent(params: {
  displayText: string
  files: MessageFile[] | undefined
  imageBlocks: Array<{ index: number; fileName: string; description: string }>
  /** 1-based indexes into the files array (same scheme as imageBlocks). */
  emptyFileIndexes: number[]
  skippedImages?: Array<{ index: number; fileName: string; reason: string }>
}): UserMessageContent {
  const files = Array.isArray(params.files) ? params.files : []
  const byIndex = new Map(params.imageBlocks.map((block) => [block.index, block]))
  const skippedByIndex = new Map(
    (params.skippedImages ?? []).map((block) => [block.index, block] as const)
  )
  const emptyIndexSet = new Set(params.emptyFileIndexes)

  const nextFiles = files.map((file, fileIndex) => {
    const matched = byIndex.get(fileIndex + 1)
    const skipped = skippedByIndex.get(fileIndex + 1)
    const markEmpty = emptyIndexSet.has(fileIndex + 1)

    if (!matched && !skipped && !markEmpty) {
      return file
    }

    const metadata: NonNullable<MessageFile['metadata']> = {
      ...(file.metadata ?? {})
    }

    if (matched) {
      metadata[JIAORONG_VISION_PREPROCESS_META_KEY] = {
        index: matched.index,
        description: matched.description
      } satisfies JiaorongVisionPreprocessMeta
      delete metadata[JIAORONG_SKIPPED_IMAGE_META_KEY]
    } else if (skipped) {
      metadata[JIAORONG_SKIPPED_IMAGE_META_KEY] = {
        index: skipped.index,
        reason: skipped.reason
      } satisfies JiaorongSkippedImageMeta
      delete metadata[JIAORONG_VISION_PREPROCESS_META_KEY]
    }

    if (markEmpty) {
      metadata[JIAORONG_EMPTY_ATTACHMENT_META_KEY] = true
    }

    return {
      ...file,
      metadata
    }
  })

  return {
    text: params.displayText,
    files: nextFiles,
    links: [],
    search: false,
    think: false
  }
}

/**
 * History / LLM path: rebuild augmented text from metadata; strip image payloads
 * so tools are less likely to re-read local paths (host contextBuilder one-liner).
 */
export function applyStoredAttachmentPreprocessToUserInput(
  input: SendMessageInput
): SendMessageInput {
  const files = Array.isArray(input.files) ? input.files : []
  const imageBlocks: Array<{ index: number; fileName: string; description: string }> = []
  const skippedImages: Array<{ index: number; fileName: string; reason: string }> = []
  const emptyFiles: Array<{ index: number; name: string }> = []

  files.forEach((file, fileIndex) => {
    const fileName =
      typeof file.name === 'string' && file.name.trim() ? file.name.trim() : `file-${fileIndex + 1}`
    const vision = readVisionMeta(file)
    if (vision) {
      imageBlocks.push({
        index: vision.index,
        fileName,
        description: vision.description
      })
    }
    const skipped = readSkippedMeta(file)
    if (skipped) {
      skippedImages.push({
        index: skipped.index,
        fileName,
        reason: skipped.reason
      })
    }
    if (isMarkedEmptyAttachment(file)) {
      emptyFiles.push({ index: fileIndex + 1, name: fileName })
    }
  })

  if (imageBlocks.length === 0 && emptyFiles.length === 0 && skippedImages.length === 0) {
    return input
  }

  // Avoid double-inject when current-turn modelInput already contains blocks.
  const existingText = input.text ?? ''
  if (
    existingText.includes('[附件处理说明]') ||
    existingText.includes('[附件无法读取正文]') ||
    existingText.includes('[附件识图未完成]') ||
    /【图片\s+\d+:/.test(existingText)
  ) {
    return {
      ...input,
      files:
        imageBlocks.length > 0 || skippedImages.length > 0
          ? stripImagePayloadsForTextModel(files)
          : files
    }
  }

  imageBlocks.sort((a, b) => a.index - b.index)
  skippedImages.sort((a, b) => a.index - b.index)

  return {
    ...input,
    text: buildAugmentedAttachmentText({
      originalText: existingText,
      imageBlocks,
      emptyFiles,
      skippedImages
    }),
    files:
      imageBlocks.length > 0 || skippedImages.length > 0
        ? stripImagePayloadsForTextModel(files)
        : files
  }
}
