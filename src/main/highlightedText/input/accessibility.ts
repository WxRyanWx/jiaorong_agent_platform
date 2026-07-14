import { BrowserWindow, dialog, systemPreferences } from 'electron'

let permissionPromptScheduled = false

/** 延迟展示 macOS 辅助功能授权提示，避免阻塞应用启动。 */
const schedulePermissionPrompt = (
  mainWindow: BrowserWindow | null,
  permissionStatus: string
): void => {
  if (permissionPromptScheduled) return
  permissionPromptScheduled = true
  setTimeout(() => {
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      title: '需要辅助功能权限',
      message: '本应用需要开启「系统设置-隐私与安全性-辅助功能」权限，才能正常使用划词功能',
      buttons: ['立即去设置', '取消'],
      defaultId: 0,
      cancelId: 1
    }
    const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const request = owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options)
    request
      .then(({ response }) => {
        if (response === 0) systemPreferences.isTrustedAccessibilityClient(true)
      })
      .catch((error) => {
        console.warn('[highlightedText] macOS accessibility permission prompt failed:', error)
      })
  }, 1200)
  console.warn(
    `[highlightedText] macOS accessibility permission is ${permissionStatus}; skip initialization`
  )
}

/** 初始化 uiohook 前检查 macOS 辅助功能权限。 */
export const checkAccessibilityPermission = async (
  mainWindow: BrowserWindow | null
): Promise<boolean> => {
  if (process.platform !== 'darwin') return true
  try {
    if (systemPreferences.isTrustedAccessibilityClient(false)) return true
    schedulePermissionPrompt(mainWindow, 'denied')
    return false
  } catch (error) {
    console.warn('[highlightedText] macOS accessibility permission check failed:', error)
    return true
  }
}
