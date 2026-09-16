/** 安装包隐藏快捷键：Win/Linux Ctrl+I S N，macOS Cmd+I S N。挂到所有 WebContents。 */

import { app, webContents, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'

/** `before-input-event` 字段。 */
export type DevToolsChordInput = {
  type: string
  key: string
  code?: string
  control: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  isAutoRepeat?: boolean
}

/** 一次按键处理后的动作。 */
export type DevToolsChordDecision = {
  preventDefault: boolean
  openDevTools: boolean
}

/** I→S→N 序列状态机。 */
export function createDevToolsChordTracker(options: {
  platform: NodeJS.Platform
  /** 安装包拦住 F12 / Ctrl+Shift+I 等默认调试快捷键。 */
  blockDefaultShortcuts: boolean
}) {
  /** 0 等 I，1 等 S，2 等 N。 */
  let step: 0 | 1 | 2 = 0
  const reset = () => {
    step = 0
  }
  const hasTriggerModifier = (input: DevToolsChordInput) =>
    options.platform === 'darwin'
      ? input.meta && !input.control && !input.alt
      : input.control && !input.meta && !input.alt
  const isDefaultDevToolsShortcut = (input: DevToolsChordInput) => {
    const key = input.key.toLowerCase()
    const code = (input.code || '').toLowerCase()
    if (key === 'f12' || code === 'f12') return true
    if (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) return true
    if (input.meta && input.alt && (key === 'i' || key === 'j' || key === 'c')) return true
    return false
  }
  const isModifierKey = (key: string) =>
    key === 'control' ||
    key === 'meta' ||
    key === 'alt' ||
    key === 'shift' ||
    key === 'command' ||
    key === 'cmd'

  return {
    consume(input: DevToolsChordInput): DevToolsChordDecision {
      const key = input.key.toLowerCase()
      if (input.type === 'keyUp') {
        if (isModifierKey(key)) reset()
        return { preventDefault: false, openDevTools: false }
      }
      if (input.type !== 'keyDown') return { preventDefault: false, openDevTools: false }
      if (options.blockDefaultShortcuts && isDefaultDevToolsShortcut(input)) {
        reset()
        return { preventDefault: true, openDevTools: false }
      }
      if (!hasTriggerModifier(input)) {
        reset()
        return { preventDefault: false, openDevTools: false }
      }
      if (isModifierKey(key)) return { preventDefault: false, openDevTools: false }
      if (input.isAutoRepeat) return { preventDefault: step > 0, openDevTools: false }
      if (key === 'i' && step === 0) {
        step = 1
        return { preventDefault: false, openDevTools: false }
      }
      if (key === 's' && step === 1) {
        step = 2
        return { preventDefault: true, openDevTools: false }
      }
      if (key === 'n' && step === 2) {
        reset()
        return { preventDefault: true, openDevTools: true }
      }
      reset()
      if (key === 'i') {
        step = 1
        return { preventDefault: false, openDevTools: false }
      }
      return { preventDefault: false, openDevTools: false }
    }
  }
}

let installed = false

function attachDevToolsChord(
  contents: WebContents,
  tracker: ReturnType<typeof createDevToolsChordTracker>
) {
  contents.on('before-input-event', (event, input) => {
    const decision = tracker.consume(input)
    if (decision.preventDefault) event.preventDefault()
    if (!decision.openDevTools || contents.isDestroyed()) return
    contents.openDevTools({ mode: 'detach' })
  })
}

/** 主窗口和 guest webview 共用一份序列状态。安装包不自动弹 DevTools。 */
export function installJiaorongDevToolsShortcut(): void {
  if (installed) return
  installed = true
  const tracker = createDevToolsChordTracker({
    platform: process.platform,
    blockDefaultShortcuts: !is.dev
  })
  app.on('web-contents-created', (_event, contents) => {
    attachDevToolsChord(contents, tracker)
  })
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) attachDevToolsChord(contents, tracker)
  }
}

/** 测试用。 */
export function resetJiaorongDevToolsShortcutForTests(): void {
  installed = false
}
