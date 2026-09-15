/** 安装包隐藏快捷键序列：Win/Linux Ctrl+I S N，macOS Cmd+I S N。 */

/** `before-input-event` 用到的按键字段。 */
export type DevToolsChordInput = {
  /** keyDown / keyUp / char。 */
  type: string
  /** 键名，如 i / Control / F12。 */
  key: string
  /** 物理键，如 KeyI / F12。 */
  code?: string
  /** Ctrl。 */
  control: boolean
  /** Alt / Option。 */
  alt: boolean
  /** Shift。 */
  shift: boolean
  /** Cmd / Win。 */
  meta: boolean
  /** 长按重复。 */
  isAutoRepeat?: boolean
}

/** 一次按键处理后的动作。 */
export type DevToolsChordDecision = {
  /** 是否拦住浏览器默认快捷键。 */
  preventDefault: boolean
  /** 是否打开当前页 DevTools。 */
  openDevTools: boolean
}

/** 创建 I→S→N 序列状态机。 */
export function createDevToolsChordTracker(options: {
  /** 进程平台，darwin 用 Cmd，其它用 Ctrl。 */
  platform: NodeJS.Platform
  /** 安装包里拦住 F12 / Ctrl+Shift+I 等默认调试快捷键。 */
  blockDefaultShortcuts: boolean
}) {
  /** 0 等待 I，1 等待 S，2 等待 N。 */
  let step: 0 | 1 | 2 = 0

  /** 松开修饰键或按错键时回到起点。 */
  function reset() {
    step = 0
  }

  /** 当前平台要求的修饰键是否按住（不要混用 Ctrl+Cmd）。 */
  function hasTriggerModifier(input: DevToolsChordInput): boolean {
    if (options.platform === 'darwin') {
      return input.meta && !input.control && !input.alt
    }
    return input.control && !input.meta && !input.alt
  }

  /** Chromium 默认打开 DevTools 的组合。 */
  function isDefaultDevToolsShortcut(input: DevToolsChordInput): boolean {
    /** 规范化键名。 */
    const key = input.key.toLowerCase()
    /** 规范化物理键。 */
    const code = (input.code || '').toLowerCase()
    if (key === 'f12' || code === 'f12') return true
    if (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) return true
    if (input.meta && input.alt && (key === 'i' || key === 'j' || key === 'c')) return true
    return false
  }

  /** 修饰键自身，不推进序列。 */
  function isModifierKey(key: string): boolean {
    return (
      key === 'control' ||
      key === 'meta' ||
      key === 'alt' ||
      key === 'shift' ||
      key === 'command' ||
      key === 'cmd'
    )
  }

  return {
    /** 处理一次键盘事件。 */
    consume(input: DevToolsChordInput): DevToolsChordDecision {
      /** 规范化键名。 */
      const key = input.key.toLowerCase()
      if (input.type === 'keyUp') {
        if (isModifierKey(key)) reset()
        return { preventDefault: false, openDevTools: false }
      }
      if (input.type !== 'keyDown') {
        return { preventDefault: false, openDevTools: false }
      }
      if (options.blockDefaultShortcuts && isDefaultDevToolsShortcut(input)) {
        reset()
        return { preventDefault: true, openDevTools: false }
      }
      if (!hasTriggerModifier(input)) {
        reset()
        return { preventDefault: false, openDevTools: false }
      }
      if (isModifierKey(key)) {
        return { preventDefault: false, openDevTools: false }
      }
      if (input.isAutoRepeat) {
        return { preventDefault: step > 0, openDevTools: false }
      }
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
