export const DEFAULT_MODEL_CONTEXT_LENGTH = 16000
export const DEFAULT_MODEL_MAX_TOKENS = 4096
export const MODEL_TIMEOUT_MIN_MS = 1000
export const MODEL_TIMEOUT_MAX_MS = 3600000
export const DEFAULT_MODEL_TIMEOUT = 600000
export const DERIVED_MODEL_MAX_TOKENS_CAP = 32000
export const DEFAULT_MODEL_VISION = false
export const DEFAULT_MODEL_SPEECH_RECOGNITION = false
export const DEFAULT_MODEL_FUNCTION_CALL = true
export const DEFAULT_MODEL_REASONING = false

export const DEFAULT_MODEL_CAPABILITY_FALLBACKS = Object.freeze({
  contextLength: DEFAULT_MODEL_CONTEXT_LENGTH,
  maxTokens: DEFAULT_MODEL_MAX_TOKENS,
  vision: DEFAULT_MODEL_VISION,
  speechRecognition: DEFAULT_MODEL_SPEECH_RECOGNITION,
  functionCall: DEFAULT_MODEL_FUNCTION_CALL,
  reasoning: DEFAULT_MODEL_REASONING
})

export const resolveModelContextLength = (value: number | undefined | null): number =>
  value ?? DEFAULT_MODEL_CONTEXT_LENGTH

export const resolveModelMaxTokens = (value: number | undefined | null): number =>
  value ?? DEFAULT_MODEL_MAX_TOKENS

export const resolveDerivedModelMaxTokens = (value: number | undefined | null): number => {
  const resolvedValue = resolveModelMaxTokens(value)
  const sanePositiveValue = Number.isFinite(resolvedValue) && resolvedValue > 0 ? resolvedValue : 1

  return Math.min(sanePositiveValue, DERIVED_MODEL_MAX_TOKENS_CAP)
}

export const resolveModelVision = (value: boolean | undefined | null): boolean =>
  value ?? DEFAULT_MODEL_VISION

export const resolveModelFunctionCall = (value: boolean | undefined | null): boolean =>
  value ?? DEFAULT_MODEL_FUNCTION_CALL

export type BuiltInModelCapabilityOverride = {
  contextLength?: number
  maxTokens?: number
}

/** Product defaults for specific provider/model pairs (not in public Provider DB). */
export const BUILT_IN_MODEL_CAPABILITY_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, BuiltInModelCapabilityOverride>>>
> = Object.freeze({
  jiaorong: Object.freeze({
    'jiaorong-deepseek-v4-pro': Object.freeze({
      contextLength: 1_000_000,
      maxTokens: 32_000
    })
  })
})

const normalizeBuiltInOverrideKey = (value: string | undefined): string =>
  value?.trim().toLowerCase() ?? ''

export const getBuiltInModelCapabilityOverride = (
  providerId: string | undefined,
  modelId: string | undefined
): BuiltInModelCapabilityOverride | undefined => {
  const normalizedProviderId = normalizeBuiltInOverrideKey(providerId)
  const normalizedModelId = normalizeBuiltInOverrideKey(modelId)
  if (!normalizedProviderId || !normalizedModelId) {
    return undefined
  }

  return BUILT_IN_MODEL_CAPABILITY_OVERRIDES[normalizedProviderId]?.[normalizedModelId]
}

export const applyBuiltInModelCapabilityOverrides = <
  T extends { contextLength?: number; maxTokens?: number }
>(
  providerId: string | undefined,
  modelId: string | undefined,
  config: T
): T => {
  const override = getBuiltInModelCapabilityOverride(providerId, modelId)
  if (!override) {
    return config
  }

  return {
    ...config,
    ...(override.contextLength !== undefined ? { contextLength: override.contextLength } : {}),
    ...(override.maxTokens !== undefined
      ? { maxTokens: resolveDerivedModelMaxTokens(override.maxTokens) }
      : {})
  }
}
