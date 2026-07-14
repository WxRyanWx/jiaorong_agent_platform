import { createRequire } from 'node:module'
import type { SelectionKeyMap, UiohookApi } from '../contracts/types'

const require = createRequire(import.meta.url)

export type UiohookRuntime = {
  hook: UiohookApi
  keys: SelectionKeyMap
}

let runtime: UiohookRuntime | null = null

/** 延迟加载 uiohook 原生模块，避免模块缺失时阻断应用启动。 */
export const loadUiohookRuntime = (): UiohookRuntime | null => {
  if (runtime) return runtime
  try {
    const mod = require('uiohook-napi') as {
      uIOhook: UiohookApi
      UiohookKey: SelectionKeyMap
    }
    runtime = { hook: mod.uIOhook, keys: mod.UiohookKey }
    return runtime
  } catch (error) {
    console.warn('[highlightedText] uiohook-napi not available, selection popup disabled:', error)
    return null
  }
}
