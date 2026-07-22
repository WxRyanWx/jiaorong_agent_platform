import type {
  MessageFile,
  SendMessageInput,
  UserMessageContent
} from '@shared/types/agent-interface'
import type { ChatMessage } from '@shared/types/core/chat-message'
import type { IConfigPresenter } from '@shared/presenter'

export type VisionCompletionRequest = {
  providerId: string
  modelId: string
  messages: ChatMessage[]
  temperature: number
  maxTokens: number
  signal?: AbortSignal
  /** Stream deltas for UI (reasoning / text chunks). */
  onDelta?: (chunk: string, accumulated: string) => void
}

export type VisionProgressEvent =
  | { type: 'start'; modelId: string; imageCount: number }
  | { type: 'delta'; text: string }
  | { type: 'image-done'; index: number; fileName: string; description: string }
  | { type: 'done'; describedImageCount: number }

export type PreprocessUserAttachmentsDeps = {
  input: SendMessageInput
  sessionSupportsVision: boolean
  providerId?: string | null
  modelId?: string | null
  agentId?: string | null
  configPresenter: Pick<
    IConfigPresenter,
    'getModelConfig' | 'resolveDeepChatAgentConfig' | 'isKnownModel'
  >
  /** Injected so staging does not import AgentRuntimePresenter. */
  generateVisionCompletion: (request: VisionCompletionRequest) => Promise<string>
  onVisionProgress?: (event: VisionProgressEvent) => void
  signal?: AbortSignal
  logWarn?: (message: string, meta?: Record<string, unknown>) => void
}

export type PreprocessUserAttachmentsResult = {
  input: SendMessageInput
  didDescribeImages: boolean
  describedImageCount: number
  emptyNonImageCount: number
  /** Markdown/text shown in the assistant reasoning block. */
  visionReasoningText: string
  /** When true, host should clear any temporary vision UI blocks (bug 4). */
  clearVisionUi?: boolean
  /**
   * UI-facing user message to persist after preprocess (original text + metadata).
   * Null when nothing to persist.
   */
  persistUserContent?: UserMessageContent | null
}

export type ImageAttachmentRef = {
  index: number
  file: MessageFile
  dataUrl: string
}
