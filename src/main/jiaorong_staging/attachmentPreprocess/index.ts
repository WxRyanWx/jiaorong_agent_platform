export { preprocessUserAttachmentsForTextModel } from './preprocessUserAttachments'
export { collectImageAttachments } from './fileHelpers'
export {
  applyVisionProgressToDisplayText,
  createVisionUiProgressState
} from './visionProgressDisplay'
export { estimateAttachmentPreprocessReserveTokens, stripImagePayloadsForTextModel } from './config'
export { runAttachmentPreprocessTurn } from './runAttachmentPreprocessTurn'
export { consumeVisionCoreStream } from './visionStream'
export { pickVisionDescription } from './visionAnswer'
export {
  applyStoredAttachmentPreprocessToUserInput,
  buildPersistableUserContent,
  JIAORONG_VISION_PREPROCESS_META_KEY,
  JIAORONG_SKIPPED_IMAGE_META_KEY,
  readStoredVisionPreprocessMeta
} from './historyPersist'
export type {
  PreprocessUserAttachmentsDeps,
  PreprocessUserAttachmentsResult,
  VisionCompletionRequest,
  VisionProgressEvent
} from './types'
