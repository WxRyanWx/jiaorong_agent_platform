import { createRequire } from 'node:module'
import type { SelectionKeyMap, UiohookApi } from '../contracts/types'

const require = createRequire(import.meta.url)

export type UiohookRuntime = {
  hook: UiohookApi
  keys: SelectionKeyMap
}

let runtime: UiohookRuntime | null = null

/**
 * 全局输入监听由应用进程运行，但加载器保持在交融私有目录，
 * 避免在公开主进程目录中承载划词实现并降低上游合并冲突。
 */
export const loadLocalUiohookRuntime = (): UiohookRuntime | null => {
  if (runtime) return runtime
  try {
    const module = require('uiohook-napi') as {
      uIOhook: UiohookApi
      UiohookKey: SelectionKeyMap
    }
    runtime = { hook: module.uIOhook, keys: module.UiohookKey }
    return runtime
  } catch (error) {
    console.warn('[highlightedText] local uiohook runtime unavailable:', error)
    return null
  }
}
