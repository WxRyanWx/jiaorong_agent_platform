import type { ChatMessage } from '@shared/types/core/chat-message'
import { resolveSessionVisionTarget } from '../../presenter/vision/sessionVisionResolver'
import {
  IMAGE_DESCRIPTION_MAX_TOKENS,
  IMAGE_DESCRIPTION_TEMPERATURE,
  DEFAULT_JIAORONG_VISION_MODEL,
  buildImageDescriptionPrompt,
  getEnvVisionOverride
} from './config'
import type { ImageAttachmentRef, PreprocessUserAttachmentsDeps } from './types'

export async function resolvePreprocessVisionTarget(
  deps: Pick<
    PreprocessUserAttachmentsDeps,
    'providerId' | 'modelId' | 'agentId' | 'configPresenter' | 'signal' | 'logWarn'
  >
): Promise<{ providerId: string; modelId: string } | null> {
  const resolved = await resolveSessionVisionTarget({
    providerId: deps.providerId,
    modelId: deps.modelId,
    agentId: deps.agentId,
    configPresenter: deps.configPresenter,
    signal: deps.signal,
    logLabel: 'jiaorong-staging:attachment-preprocess'
  })

  if (resolved?.source === 'agent-vision-model') {
    return { providerId: resolved.providerId, modelId: resolved.modelId }
  }

  const candidate = getEnvVisionOverride() ?? {
    providerId: DEFAULT_JIAORONG_VISION_MODEL.providerId,
    modelId: DEFAULT_JIAORONG_VISION_MODEL.modelId
  }

  // Skip when catalog explicitly marks the fallback unknown (align spec).
  if (deps.configPresenter.isKnownModel?.(candidate.providerId, candidate.modelId) === false) {
    deps.logWarn?.('[jiaorong_staging] Vision fallback model unknown; skip image describe', {
      providerId: candidate.providerId,
      modelId: candidate.modelId
    })
    return null
  }

  return candidate
}

export async function describeImageAttachment(
  deps: Pick<
    PreprocessUserAttachmentsDeps,
    'generateVisionCompletion' | 'configPresenter' | 'signal'
  >,
  vision: { providerId: string; modelId: string },
  ref: ImageAttachmentRef,
  onDelta?: (chunk: string, accumulated: string) => void
): Promise<string> {
  const fileName =
    typeof ref.file.name === 'string' && ref.file.name.trim()
      ? ref.file.name.trim()
      : `image-${ref.index + 1}`

  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: buildImageDescriptionPrompt(fileName, ref.index + 1)
        },
        {
          type: 'image_url',
          image_url: {
            url: ref.dataUrl,
            detail: 'auto'
          }
        }
      ]
    }
  ]

  const modelConfig = deps.configPresenter.getModelConfig(vision.modelId, vision.providerId)
  const configuredMax = modelConfig?.maxTokens ?? IMAGE_DESCRIPTION_MAX_TOKENS
  const maxTokens = Math.min(Math.max(configuredMax, 1), IMAGE_DESCRIPTION_MAX_TOKENS)

  const raw = await deps.generateVisionCompletion({
    providerId: vision.providerId,
    modelId: vision.modelId,
    messages,
    temperature: modelConfig?.temperature ?? IMAGE_DESCRIPTION_TEMPERATURE,
    maxTokens,
    signal: deps.signal,
    onDelta
  })

  return raw.trim()
}

export async function describeImageAttachments(
  deps: Pick<
    PreprocessUserAttachmentsDeps,
    'generateVisionCompletion' | 'configPresenter' | 'signal' | 'logWarn' | 'onVisionProgress'
  >,
  vision: { providerId: string; modelId: string },
  refs: ImageAttachmentRef[]
): Promise<Array<{ index: number; fileName: string; description: string }>> {
  const results: Array<{ index: number; fileName: string; description: string }> = []

  for (const ref of refs) {
    const fileName =
      typeof ref.file.name === 'string' && ref.file.name.trim()
        ? ref.file.name.trim()
        : `image-${ref.index + 1}`
    try {
      const description = await describeImageAttachment(deps, vision, ref, (chunk, _full) => {
        deps.onVisionProgress?.({ type: 'delta', text: chunk })
      })
      if (!description) {
        deps.logWarn?.('[jiaorong_staging] Empty vision description', { fileName })
        continue
      }
      results.push({ index: ref.index + 1, fileName, description })
      deps.onVisionProgress?.({
        type: 'image-done',
        index: ref.index + 1,
        fileName,
        description
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      deps.logWarn?.('[jiaorong_staging] Vision describe failed', {
        fileName,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return results
}
