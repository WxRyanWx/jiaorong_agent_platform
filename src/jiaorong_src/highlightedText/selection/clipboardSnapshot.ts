import { clipboard } from 'electron'
import { readFilePaths, writeFilePaths } from 'electron-clipboard-ex'

export type ClipboardSnapshot = {
  kind: 'text' | 'files'
  text?: string
  filePaths?: string[]
}

/** 保存当前文本或文件剪贴板，避免模拟复制破坏用户原内容。 */
export const takeClipboardSnapshot = (): ClipboardSnapshot => {
  try {
    const filePaths = readFilePaths()
    const text = clipboard.readText()
    return {
      filePaths: [...filePaths],
      kind: filePaths.length > 0 ? 'files' : 'text',
      text: text || ''
    }
  } catch {
    return { filePaths: [], kind: 'text', text: clipboard.readText() || '' }
  }
}

/** 按原类型恢复文本或文件剪贴板。 */
export const restoreClipboardSnapshot = (snapshot: ClipboardSnapshot): void => {
  if (snapshot.filePaths?.length) {
    writeFilePaths(snapshot.filePaths)
    return
  }
  clipboard.writeText(snapshot.text || '')
}
