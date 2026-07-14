import type { ScreenshotAction, ScreenshotPayload } from '../contracts/types'
import { runOcrAction } from './ocr'
export { warmOcrWorker } from './ocr'
import { runPinAction } from './pin'

/** 将截图动作分发到独立的 OCR 或钉图功能模块。 */
export const runPostScreenshotAction = async (
  action: ScreenshotAction,
  payload: ScreenshotPayload
): Promise<void> => {
  if (action === 'ocr-rec') await runOcrAction(payload)
  if (action === 'pin-by-pic') runPinAction(payload)
}
