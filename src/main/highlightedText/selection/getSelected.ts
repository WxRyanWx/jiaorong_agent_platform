import { clipboard } from 'electron'
import type { SelectionKeyMap, UiohookApi } from '../contracts/types'
import { getActiveApp } from './activeWindow'
import { takeClipboardSnapshot, restoreClipboardSnapshot } from './clipboardSnapshot'
import { isShowCardPopupApp } from './filterSelection'
import { loadSelectionNative } from './nativeSelection'

let ctrlDownLock = false
let copyFlag = false

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 记录 Ctrl/Command 是否正被用户操作。 */
export const setControlKeyDown = (value: boolean): void => {
  ctrlDownLock = value
}

/** 标记用户执行了真实复制，避免随后恢复旧剪贴板覆盖用户内容。 */
export const markUserCopy = (): void => {
  copyFlag = true
}

/** 获取当前选中文本；Windows 优先使用 Rust/UIA，失败后才模拟复制。 */
export const getSelected = async (
  uIOhook: UiohookApi,
  keys: SelectionKeyMap,
  isDoubleClick = false
): Promise<{ text: string }> => {
  void isDoubleClick
  if (process.platform === 'win32') {
    try {
      const text = loadSelectionNative().getSelectedText()
      if (text) return { text }
    } catch (error) {
      console.warn('[highlightedText] native selection failed, fallback to clipboard:', error)
    }
  }

  const lastSnapshot = takeClipboardSnapshot()
  if (process.platform === 'darwin') {
    const foregroundApp = await getActiveApp()
    if (!isShowCardPopupApp(foregroundApp)) return { text: '' }
  }
  if (ctrlDownLock) return { text: '' }

  const tempEmptyMarker = `__EMPTY_${Date.now()}__`
  let userCopyFlag = false
  clipboard.writeText(tempEmptyMarker)

  try {
    if (ctrlDownLock) {
      if (copyFlag) {
        userCopyFlag = true
        copyFlag = false
      }
      return { text: '' }
    }
    // 全局 hook 收到 mouseup 时，目标应用未必已经完成最终选区更新
    // 拖动过程中，应用内部选区更新到 3 字
    // → 全局 hook 先收到 mouseup
    // → 程序立即发送 Command+C
    // → 复制到当时内部记录的 3 字
    // → 目标应用稍后处理 mouseup
    // → 屏幕最终显示完整的 10 字选区
    await delay(50)
    uIOhook.keyTap(keys.C, [process.platform === 'win32' ? keys.Ctrl : keys.Meta])
    await delay(80)
    if (ctrlDownLock) {
      if (copyFlag) {
        userCopyFlag = true
        copyFlag = false
      }
      return { text: '' }
    }

    const copiedText = clipboard.readText('clipboard') || ''
    console.log('copiedText', copiedText)
    if (ctrlDownLock) {
      if (copyFlag) {
        userCopyFlag = true
        copyFlag = false
      }
      return { text: '' }
    }
    return { text: copiedText === tempEmptyMarker ? '' : copiedText }
  } finally {
    if (!userCopyFlag) restoreClipboardSnapshot(lastSnapshot)
  }
}
