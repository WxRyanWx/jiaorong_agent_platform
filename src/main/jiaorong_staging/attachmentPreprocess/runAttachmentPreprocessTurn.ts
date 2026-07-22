import type {
  AssistantMessageBlock,
  SendMessageInput,
  UserMessageContent
} from '@shared/types/agent-interface'
import type { LLMCoreStreamEvent } from '@shared/types/core/llm-events'
import type { ModelConfig } from '@shared/presenter'
import type { ChatMessage } from '@shared/types/core/chat-message'
import { preprocessUserAttachmentsForTextModel } from './preprocessUserAttachments'
import {
  applyVisionProgressToDisplayText,
  createVisionUiProgressState
} from './visionProgressDisplay'
import { consumeVisionCoreStream } from './visionStream'
import type { PreprocessUserAttachmentsDeps } from './types'

export type AttachmentPreprocessTurnResult = {
  modelInput: SendMessageInput
  visionInitialBlocks: AssistantMessageBlock[]
  persistUserContent: UserMessageContent | null
  /** True when vision reserve should be dropped from buildContext extraReserve. */
  didAugmentModelInput: boolean
}

type StreamFactory = (params: {
  providerId: string
  modelId: string
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  modelConfig: ModelConfig
}) => AsyncGenerator<LLMCoreStreamEvent>

/**
 * Host-facing helper: keeps product UI + stream merge logic in staging (bug 10).
 */
export async function runAttachmentPreprocessTurn(params: {
  displayInput: SendMessageInput
  sessionSupportsVision: boolean
  providerId?: string | null
  modelId?: string | null
  agentId?: string | null
  configPresenter: PreprocessUserAttachmentsDeps['configPresenter']
  signal?: AbortSignal
  logWarn?: PreprocessUserAttachmentsDeps['logWarn']
  throwIfAborted: () => void
  executeWithRateLimit: (providerId: string) => Promise<void>
  openVisionStream: StreamFactory
  getModelConfig: (modelId: string, providerId: string) => ModelConfig
  publishVisionBlocks: (blocks: AssistantMessageBlock[], force?: boolean) => void
}): Promise<AttachmentPreprocessTurnResult> {
  let uiState = createVisionUiProgressState()
  let visionInitialBlocks: AssistantMessageBlock[] = []
  const reasoningStartedAt = Date.now()
  let lastEmitAt = 0

  const emit = (blocks: AssistantMessageBlock[], force = false) => {
    visionInitialBlocks = blocks
    const now = Date.now()
    if (force || blocks.length === 0 || now - lastEmitAt >= 80) {
      lastEmitAt = now
      params.publishVisionBlocks(blocks, force)
    }
  }

  const toBlocks = (
    content: string,
    status: AssistantMessageBlock['status']
  ): AssistantMessageBlock[] => {
    if (!content.trim()) {
      return []
    }
    return [
      {
        type: 'reasoning_content',
        content,
        status,
        timestamp: Date.now(),
        reasoning_time: {
          start: reasoningStartedAt,
          end: Date.now()
        }
      }
    ]
  }

  const preprocessed = await preprocessUserAttachmentsForTextModel({
    input: params.displayInput,
    sessionSupportsVision: params.sessionSupportsVision,
    providerId: params.providerId,
    modelId: params.modelId,
    agentId: params.agentId,
    configPresenter: params.configPresenter,
    signal: params.signal,
    logWarn: params.logWarn,
    onVisionProgress: (event) => {
      const next = applyVisionProgressToDisplayText(uiState, event)
      uiState = next.state
      if (next.status === 'unchanged') {
        return
      }
      if (next.status === 'clear') {
        emit([], true)
        return
      }
      emit(toBlocks(next.text, next.status === 'success' ? 'success' : 'loading'))
    },
    generateVisionCompletion: async (request) => {
      await params.executeWithRateLimit(request.providerId)
      const modelConfig = params.getModelConfig(request.modelId, request.providerId)
      const stream = params.openVisionStream({
        providerId: request.providerId,
        modelId: request.modelId,
        messages: request.messages,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        modelConfig
      })
      return await consumeVisionCoreStream(stream, {
        throwIfAborted: params.throwIfAborted,
        signal: request.signal ?? params.signal
      })
    }
  })

  if (preprocessed.visionReasoningText.trim()) {
    emit(toBlocks(preprocessed.visionReasoningText, 'success'), true)
  } else if (preprocessed.clearVisionUi) {
    emit([], true)
  }

  const didAugmentModelInput =
    preprocessed.didDescribeImages ||
    preprocessed.emptyNonImageCount > 0 ||
    preprocessed.input.text !== params.displayInput.text

  return {
    modelInput: preprocessed.input,
    visionInitialBlocks,
    persistUserContent: preprocessed.persistUserContent ?? null,
    didAugmentModelInput
  }
}
