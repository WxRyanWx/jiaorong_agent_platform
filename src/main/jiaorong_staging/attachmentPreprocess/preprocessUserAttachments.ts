import {
  collectEmptyNonImageFiles,
  collectImageAttachments,
  collectUnreadableImageAttachments
} from './fileHelpers'
import { describeImageAttachments, resolvePreprocessVisionTarget } from './describeImages'
import { formatImageDescriptionBlock, stripImagePayloadsForTextModel } from './config'
import { buildVisionResultHeader } from './visionProgressDisplay'
import {
  buildAugmentedAttachmentText,
  buildPersistableUserContent,
  readStoredVisionPreprocessMeta
} from './historyPersist'
import type { PreprocessUserAttachmentsDeps, PreprocessUserAttachmentsResult } from './types'

/**
 * Scheme 4: keep session text model; when images are attached and the session
 * model cannot see them, describe images via a side vision model and inject
 * the text into the user turn.
 */
export async function preprocessUserAttachmentsForTextModel(
  deps: PreprocessUserAttachmentsDeps
): Promise<PreprocessUserAttachmentsResult> {
  const files = Array.isArray(deps.input.files) ? deps.input.files : []
  const emptyNonImage = collectEmptyNonImageFiles(files)
  const emptyMeta = emptyNonImage.map((item) => {
    const name =
      typeof item.file.name === 'string' && item.file.name.trim()
        ? item.file.name.trim()
        : `file-${item.index + 1}`
    return { index: item.index + 1, name }
  })

  const emptyResult = (
    input: PreprocessUserAttachmentsResult['input'],
    emptyCount: number,
    clearVisionUi = false,
    persistUserContent: PreprocessUserAttachmentsResult['persistUserContent'] = null
  ): PreprocessUserAttachmentsResult => ({
    input,
    didDescribeImages: false,
    describedImageCount: 0,
    emptyNonImageCount: emptyCount,
    visionReasoningText: '',
    clearVisionUi,
    persistUserContent
  })

  if (deps.sessionSupportsVision) {
    if (emptyMeta.length === 0) {
      return emptyResult(deps.input, 0)
    }
    const augmented = buildAugmentedAttachmentText({
      originalText: deps.input.text ?? '',
      imageBlocks: [],
      emptyFiles: emptyMeta
    })
    return emptyResult(
      {
        ...deps.input,
        text: augmented
      },
      emptyMeta.length,
      false,
      buildPersistableUserContent({
        displayText: deps.input.text ?? '',
        files: deps.input.files,
        imageBlocks: [],
        emptyFileIndexes: emptyMeta.map((item) => item.index)
      })
    )
  }

  const imageRefs = collectImageAttachments(files)
  const unreadableImages = collectUnreadableImageAttachments(files)
  if (imageRefs.length === 0 && emptyMeta.length === 0 && unreadableImages.length === 0) {
    return emptyResult(deps.input, 0)
  }

  const unreadableSkipped = unreadableImages.map((item) => {
    const fileName =
      typeof item.file.name === 'string' && item.file.name.trim()
        ? item.file.name.trim()
        : `image-${item.index + 1}`
    return {
      index: item.index + 1,
      fileName,
      reason: item.reason
    }
  })

  // Reuse descriptions already stored on files (retry / resend) to avoid a second VL pass.
  const cachedBlocks: Array<{ index: number; fileName: string; description: string }> = []
  const refsNeedingDescribe: typeof imageRefs = []
  for (const ref of imageRefs) {
    const fileName =
      typeof ref.file.name === 'string' && ref.file.name.trim()
        ? ref.file.name.trim()
        : `image-${ref.index + 1}`
    const cached = readStoredVisionPreprocessMeta(ref.file)
    if (cached) {
      cachedBlocks.push({
        index: ref.index + 1,
        fileName,
        description: cached.description
      })
      continue
    }
    refsNeedingDescribe.push(ref)
  }

  let describedBlocks: Array<{ index: number; fileName: string; description: string }> = []
  let visionAttempted = false
  let skippedImages: Array<{ index: number; fileName: string; reason: string }> = [
    ...unreadableSkipped
  ]
  if (refsNeedingDescribe.length > 0) {
    const vision = await resolvePreprocessVisionTarget(deps)
    if (!vision) {
      skippedImages = [
        ...skippedImages,
        ...refsNeedingDescribe.map((ref) => {
          const fileName =
            typeof ref.file.name === 'string' && ref.file.name.trim()
              ? ref.file.name.trim()
              : `image-${ref.index + 1}`
          return {
            index: ref.index + 1,
            fileName,
            reason: '未能生成描述（无可用多模态模型）'
          }
        })
      ]
      deps.logWarn?.(
        '[jiaorong_staging] No vision target; skip image describe (configure agent visionModel or JIAORONG_VISION_* env)',
        {
          cachedCount: cachedBlocks.length,
          pendingCount: refsNeedingDescribe.length,
          unreadableCount: unreadableSkipped.length,
          pendingFiles: refsNeedingDescribe.map((ref) =>
            typeof ref.file.name === 'string' && ref.file.name.trim()
              ? ref.file.name.trim()
              : `image-${ref.index + 1}`
          )
        }
      )
      // Still surface cached blocks in the UI so partial reuse is visible.
      if (cachedBlocks.length > 0) {
        deps.onVisionProgress?.({
          type: 'start',
          modelId: 'cached',
          imageCount: cachedBlocks.length
        })
        for (const block of cachedBlocks) {
          deps.onVisionProgress?.({
            type: 'image-done',
            index: block.index,
            fileName: block.fileName,
            description: block.description
          })
        }
        deps.onVisionProgress?.({
          type: 'done',
          describedImageCount: cachedBlocks.length
        })
      }
    } else {
      visionAttempted = true
      deps.onVisionProgress?.({
        type: 'start',
        modelId: vision.modelId,
        imageCount: refsNeedingDescribe.length + cachedBlocks.length
      })
      // Replay cached blocks into the UI before describing the rest.
      for (const block of cachedBlocks) {
        deps.onVisionProgress?.({
          type: 'image-done',
          index: block.index,
          fileName: block.fileName,
          description: block.description
        })
      }
      describedBlocks = await describeImageAttachments(deps, vision, refsNeedingDescribe)
      const describedIndexes = new Set(describedBlocks.map((block) => block.index))
      skippedImages = [
        ...skippedImages,
        ...refsNeedingDescribe
          .filter((ref) => !describedIndexes.has(ref.index + 1))
          .map((ref) => {
            const fileName =
              typeof ref.file.name === 'string' && ref.file.name.trim()
                ? ref.file.name.trim()
                : `image-${ref.index + 1}`
            return {
              index: ref.index + 1,
              fileName,
              reason: '未能生成描述（识图失败或结果为空）'
            }
          })
      ]
      deps.onVisionProgress?.({
        type: 'done',
        describedImageCount: describedBlocks.length + cachedBlocks.length
      })
    }
  } else if (cachedBlocks.length > 0) {
    deps.onVisionProgress?.({
      type: 'start',
      modelId: 'cached',
      imageCount: cachedBlocks.length
    })
    for (const block of cachedBlocks) {
      deps.onVisionProgress?.({
        type: 'image-done',
        index: block.index,
        fileName: block.fileName,
        description: block.description
      })
    }
    deps.onVisionProgress?.({
      type: 'done',
      describedImageCount: cachedBlocks.length
    })
  }

  const imageBlocks = [...cachedBlocks, ...describedBlocks].sort((a, b) => a.index - b.index)
  skippedImages.sort((a, b) => a.index - b.index)

  if (imageBlocks.length === 0 && emptyMeta.length === 0 && skippedImages.length === 0) {
    return emptyResult(deps.input, 0, visionAttempted)
  }

  const visionReasoningText = imageBlocks.length
    ? `${buildVisionResultHeader()}\n\n${imageBlocks
        .map((block) => formatImageDescriptionBlock(block))
        .join('\n\n')}`
    : ''

  return {
    input: {
      ...deps.input,
      text: buildAugmentedAttachmentText({
        originalText: deps.input.text ?? '',
        imageBlocks,
        emptyFiles: emptyMeta,
        skippedImages
      }),
      files: stripImagePayloadsForTextModel(deps.input.files)
    },
    didDescribeImages: imageBlocks.length > 0,
    describedImageCount: imageBlocks.length,
    emptyNonImageCount: emptyMeta.length,
    visionReasoningText,
    clearVisionUi: visionAttempted && imageBlocks.length === 0,
    persistUserContent: buildPersistableUserContent({
      displayText: deps.input.text ?? '',
      files: deps.input.files,
      imageBlocks,
      emptyFileIndexes: emptyMeta.map((item) => item.index),
      skippedImages
    })
  }
}
