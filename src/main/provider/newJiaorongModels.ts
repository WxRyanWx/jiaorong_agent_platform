import { ModelType } from '@shared/model'
import type { MODEL_META } from '@shared/types/provider'

/**
 * 新 MaaS 网关的 /models 同时返回内部占位模型（og*）和脏 ID，
 * 只有 jrdz-* 是应用可用的模型命名空间。
 */
const NEW_JIAORONG_MODEL_PREFIX = 'jrdz-'

const resolveNewJiaorongModelType = (modelId: string): ModelType => {
  const normalizedModelId = modelId.toLowerCase()
  if (normalizedModelId.includes('rerank')) return ModelType.Rerank
  if (normalizedModelId.includes('embedding') || normalizedModelId.includes('embed')) {
    return ModelType.Embedding
  }
  if (
    normalizedModelId.includes('tts') ||
    normalizedModelId.includes('speech') ||
    normalizedModelId.includes('whisper')
  ) {
    return ModelType.TTS
  }
  return ModelType.Chat
}

export const mapNewJiaorongModelRecords = (
  providerId: string,
  records: ReadonlyArray<Record<string, unknown>>
): MODEL_META[] => {
  const models: MODEL_META[] = []
  const seenModelIds = new Set<string>()

  for (const record of records) {
    const modelId = typeof record.id === 'string' ? record.id.trim() : ''
    if (!modelId.startsWith(NEW_JIAORONG_MODEL_PREFIX) || seenModelIds.has(modelId)) continue

    seenModelIds.add(modelId)
    const type = resolveNewJiaorongModelType(modelId)
    models.push({
      id: modelId,
      name: modelId,
      group: type === ModelType.Chat ? 'default' : type,
      providerId,
      isCustom: false,
      type
    })
  }

  return models
}
