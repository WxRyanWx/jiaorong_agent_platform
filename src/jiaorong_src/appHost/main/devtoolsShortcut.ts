/** 安装包隐藏快捷键：Win/Linux Ctrl+I S N，macOS Cmd+I S N。挂到所有 WebContents。 */

import { app, webContents, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'

/** `before-input-event` 字段。 */
export type DevToolsChordInput = {
  /** 按键阶段：`keyDown` / `keyUp` / `rawKeyDown` / `char`。 */
  type: string
  /** 键名，如 `i`、`F12`。 */
  key: string
  /** 物理键码，如 `KeyI`。 */
  code?: string
  /** Ctrl 是否按下。 */
  control: boolean
  /** Alt 是否按下。 */
  alt: boolean
  /** Shift 是否按下。 */
  shift: boolean
  /** Cmd（macOS）/ Win 是否按下。 */
  meta: boolean
  /** 是否长按自动重复。 */
  isAutoRepeat?: boolean
}

/** 一次按键处理后的动作。 */
export type DevToolsChordDecision = {
  /** 是否吃掉这次按键，不再交给页面。 */
  preventDefault: boolean
  /** 是否打开 DevTools。 */
  openDevTools: boolean
}

/**
 * I→S→N 序列状态机。
 * @param options 平台与是否拦默认调试快捷键
 */
export function createDevToolsChordTracker(options: {
  /** 运行平台，决定触发修饰键用 Cmd 还是 Ctrl。 */
  platform: NodeJS.Platform
  /** 安装包拦住 F12 / Ctrl+Shift+I 等默认调试快捷键。 */
  blockDefaultShortcuts: boolean
}) {
  /** 0 等 I，1 等 S，2 等 N。 */
  let step: 0 | 1 | 2 = 0
  /** 序列回到起点。 */
  const reset = () => {
    step = 0
  }
  /**
   * 是否带触发序列的修饰键：macOS 只按 Cmd，其它平台只按 Ctrl，且都不能带 Alt。
   * @param input 本次按键
   */
  const hasTriggerModifier = (input: DevToolsChordInput) =>
    options.platform === 'darwin'
      ? input.meta && !input.control && !input.alt
      : input.control && !input.meta && !input.alt
  /**
   * 是否 Electron 默认调试快捷键（F12、Ctrl+Shift+I/J/C、Cmd+Alt+I/J/C）。
   * @param input 本次按键
   */
  const isDefaultDevToolsShortcut = (input: DevToolsChordInput) => {
    /** 小写键名。 */
    const key = input.key.toLowerCase()
    /** 小写物理键码。 */
    const code = (input.code || '').toLowerCase()
    // F12 直接算默认调试键
    if (key === 'f12' || code === 'f12') return true
    // Win/Linux：Ctrl+Shift+I/J/C
    if (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) return true
    // macOS：Cmd+Alt+I/J/C
    if (input.meta && input.alt && (key === 'i' || key === 'j' || key === 'c')) return true
    // 其它组合不拦
    return false
  }
  /**
   * 是否纯修饰键；按下修饰键本身不推进序列。
   * @param key 小写键名
   */
  const isModifierKey = (key: string) =>
    key === 'control' ||
    key === 'meta' ||
    key === 'alt' ||
    key === 'shift' ||
    key === 'command' ||
    key === 'cmd'

  return {
    /**
     * 消费一次按键并给出动作。
     * @param input `before-input-event` 传进来的按键信息
     */
    consume(input: DevToolsChordInput): DevToolsChordDecision {
      /** 小写键名。 */
      const key = input.key.toLowerCase()
      // 抬起阶段：松开修饰键说明序列被打断，重置后放行
      if (input.type === 'keyUp') {
        // 松开的正是修饰键
        if (isModifierKey(key)) reset()
        return { preventDefault: false, openDevTools: false }
      }
      // 只处理 keyDown，其它阶段一律放行
      if (input.type !== 'keyDown') return { preventDefault: false, openDevTools: false }
      // 安装包模式：拦掉默认调试快捷键，同时打断隐藏序列
      if (options.blockDefaultShortcuts && isDefaultDevToolsShortcut(input)) {
        reset()
        return { preventDefault: true, openDevTools: false }
      }
      // 没按对修饰键，序列不成立
      if (!hasTriggerModifier(input)) {
        reset()
        return { preventDefault: false, openDevTools: false }
      }
      // 只按下了修饰键本身，不推进序列也不吃键
      if (isModifierKey(key)) return { preventDefault: false, openDevTools: false }
      // 长按自动重复：已进入序列就吃掉，避免一次长按跳两级
      if (input.isAutoRepeat) return { preventDefault: step > 0, openDevTools: false }
      // 第一级 I
      if (key === 'i' && step === 0) {
        step = 1
        return { preventDefault: false, openDevTools: false }
      }
      // 第二级 S：从这里开始吃掉按键，避免字母落进页面
      if (key === 's' && step === 1) {
        step = 2
        return { preventDefault: true, openDevTools: false }
      }
      // 第三级 N：序列完成，打开 DevTools
      if (key === 'n' && step === 2) {
        reset()
        return { preventDefault: true, openDevTools: true }
      }
      // 序列断了，先重置，再看这次按键能不能当新起点
      reset()
      // 断点后紧跟 I，作为新的第一级
      if (key === 'i') {
        step = 1
        return { preventDefault: false, openDevTools: false }
      }
      // 普通按键，放行
      return { preventDefault: false, openDevTools: false }
    }
  }
}

/** 是否已安装，保证只挂一次。 */
let installed = false

/**
 * 给单个 WebContents 挂上序列监听。
 * @param contents 目标 WebContents（主窗口或 guest webview）
 * @param tracker 共用的序列状态机
 */
function attachDevToolsChord(
  contents: WebContents,
  tracker: ReturnType<typeof createDevToolsChordTracker>
) {
  contents.on('before-input-event', (event, input) => {
    /** 本次按键的判定结果。 */
    const decision = tracker.consume(input)
    // 需要吃掉这次按键
    if (decision.preventDefault) event.preventDefault()
    // 不需要打开，或 WebContents 已销毁
    if (!decision.openDevTools || contents.isDestroyed()) return
    // 独立窗口打开，避免挤压应用页面
    contents.openDevTools({ mode: 'detach' })
  })
}

/** 主窗口和 guest webview 共用一份序列状态。安装包不自动弹 DevTools。 */
export function installJiaorongDevToolsShortcut(): void {
  // 幂等：已装过直接返回
  if (installed) return
  installed = true
  /** 共用的序列状态机。 */
  const tracker = createDevToolsChordTracker({
    platform: process.platform,
    // 开发态保留默认调试快捷键，安装包拦掉
    blockDefaultShortcuts: !is.dev
  })
  // 之后新建的 WebContents（含 guest webview）都挂上
  app.on('web-contents-created', (_event, contents) => {
    attachDevToolsChord(contents, tracker)
  })
  // 安装时已存在的 WebContents 补挂
  for (const contents of webContents.getAllWebContents()) {
    // 跳过已销毁的
    if (!contents.isDestroyed()) attachDevToolsChord(contents, tracker)
  }
}

/** 测试用。 */
export function resetJiaorongDevToolsShortcutForTests(): void {
  /** 允许测试重复安装。 */
  installed = false
}
