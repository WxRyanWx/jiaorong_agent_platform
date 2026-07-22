import { formatImageDescriptionBlock } from './config'
import type { VisionProgressEvent } from './types'

/** 与默认系统提示词身份一致：不对外暴露具体模型型号。 */
export const VISION_DISPLAY_IDENTITY = '交融系列模型'

export function buildVisionAnalyzingHeader(): string {
  return `【多模态识图 · ${VISION_DISPLAY_IDENTITY}】\n正在分析图片…`
}

export function buildVisionResultHeader(): string {
  return `【多模态识图 · ${VISION_DISPLAY_IDENTITY}】`
}

export type VisionUiProgressState = {
  completed: Array<{ index: number; fileName: string; description: string }>
  started: boolean
}

export function createVisionUiProgressState(): VisionUiProgressState {
  return { completed: [], started: false }
}

function renderVisionUiText(state: VisionUiProgressState): string {
  if (state.completed.length === 0) {
    return state.started ? `${buildVisionAnalyzingHeader()}\n` : ''
  }
  return [
    buildVisionResultHeader(),
    '',
    ...state.completed.map((block) => formatImageDescriptionBlock(block))
  ].join('\n')
}

/**
 * UI progress reducer (bug 9): ignore raw token deltas; rebuild only on image-done / done.
 * clear = vision started but produced nothing usable (bug 4).
 */
export function applyVisionProgressToDisplayText(
  state: VisionUiProgressState,
  event: VisionProgressEvent
): {
  state: VisionUiProgressState
  text: string
  status: 'loading' | 'success' | 'clear' | 'unchanged'
} {
  if (event.type === 'start') {
    const next = { completed: [], started: true }
    return { state: next, text: renderVisionUiText(next), status: 'loading' }
  }

  if (event.type === 'delta') {
    // Do not append raw stream chunks — avoids messy multi-image UI (bug 9).
    return { state, text: renderVisionUiText(state), status: 'unchanged' }
  }

  if (event.type === 'image-done') {
    const next: VisionUiProgressState = {
      started: true,
      completed: [
        ...state.completed.filter((item) => item.index !== event.index),
        {
          index: event.index,
          fileName: event.fileName,
          description: event.description
        }
      ].sort((a, b) => a.index - b.index)
    }
    return { state: next, text: renderVisionUiText(next), status: 'loading' }
  }

  if (event.type === 'done') {
    if (event.describedImageCount <= 0 || state.completed.length === 0) {
      return { state: { completed: [], started: false }, text: '', status: 'clear' }
    }
    return { state, text: renderVisionUiText(state), status: 'success' }
  }

  return { state, text: renderVisionUiText(state), status: 'unchanged' }
}
