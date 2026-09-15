/** 把隐藏 DevTools 序列挂到所有 WebContents（主窗口和嵌入 webview）。 */

import { app, webContents, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { createDevToolsChordTracker } from './devtoolsChord'

/** 是否已挂到 app。 */
let installed = false

/** 给一个 WebContents 挂 before-input-event。 */
function attachDevToolsChord(
  contents: WebContents,
  tracker: ReturnType<typeof createDevToolsChordTracker>
) {
  contents.on('before-input-event', (event, input) => {
    /** 本次按键结论。 */
    const decision = tracker.consume(input)
    if (decision.preventDefault) event.preventDefault()
    if (!decision.openDevTools || contents.isDestroyed()) return
    contents.openDevTools({ mode: 'detach' })
  })
}

/** 监听所有窗口和嵌入 webview；安装包不自动弹出，只响应隐藏序列。 */
export function installJiaorongDevToolsShortcut(): void {
  if (installed) return
  installed = true
  /** 全局一份序列状态，主窗口和 guest 共用。 */
  const tracker = createDevToolsChordTracker({
    platform: process.platform,
    blockDefaultShortcuts: !is.dev
  })
  app.on('web-contents-created', (_event, contents) => {
    attachDevToolsChord(contents, tracker)
  })
  /** 一个已存在的 webContents。 */
  for (const contents of webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) attachDevToolsChord(contents, tracker)
  }
}

/** 测试用：清安装标记。 */
export function resetJiaorongDevToolsShortcutForTests(): void {
  installed = false
}
