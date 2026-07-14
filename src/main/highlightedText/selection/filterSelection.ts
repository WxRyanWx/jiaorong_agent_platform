import type { ActiveWindowInfo } from './activeWindow'

const SYSTEM_FILE_DIALOG_TITLE_RE =
  /^(打开|open|browse for folder|select folder|choose file|选择文件夹|选择文件|浏览文件夹)$/i

const FILTERED_APPS = new Set([
  'wps.exe',
  'et.exe',
  'wpspdf.exe',
  'wpp.exe',
  'explorer',
  '文件资源管理器',
  'finder',
  '访达',
  'wps office',
  'wpsoffice',
  'notepad++.exe'
])

/** Windows 系统文件/文件夹选择对话框不触发划词。 */
export const isSystemFileDialogWindow = (activeApp?: ActiveWindowInfo): boolean =>
  process.platform === 'win32' &&
  !!activeApp?.title &&
  SYSTEM_FILE_DIALOG_TITLE_RE.test(activeApp.title.trim())

/** 过滤不适合显示划词工具条的应用。 */
export const isShowCardPopupApp = (activeApp?: ActiveWindowInfo): boolean =>
  !activeApp || !FILTERED_APPS.has(activeApp.appName?.toLowerCase() || '')
