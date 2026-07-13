type IpcListener = (event: unknown, ...args: unknown[]) => void

import {
  endRuntimeWindowDrag,
  getRuntimeAuthToken,
  getRuntimeCurrentCardPopupText,
  getRuntimeCurrentTranslatePopupText,
  moveRuntimeWindowDrag,
  startRuntimeWindowDrag,
  translateRuntimeSelectedText
} from './runtime'
import { onLegacyIpcChannel, sendLegacyIpc } from './legacy/runtime'

// 划词弹窗专用 client，集中封装 IPC，组件不直接访问 window/electron。
export function createHighlightedTextClient() {
  function getAuthToken() {
    return getRuntimeAuthToken()
  }

  // CardPopup 首次创建时可能错过主进程推送，主动拉取当前划词文本作为兜底。
  function getCurrentCardPopupText() {
    return getRuntimeCurrentCardPopupText()
  }

  // 翻译弹窗首次创建时可能错过 update-translation-text，主动拉取当前原文作为兜底。
  function getCurrentTranslatePopupText() {
    return getRuntimeCurrentTranslatePopupText()
  }

  function showLogin() {
    sendLegacyIpc('highlighted-text:show-login')
  }

  function showTranslation(text: string) {
    sendLegacyIpc('highlighted-text:show-translation', text)
  }

  // 解释调用逻辑未迁移，只保留入口事件给主进程关闭当前划词面板。
  function explain(text: string) {
    sendLegacyIpc('highlighted-text:explain', text)
  }

  // 使用划词专用复制通道，避免复用全局 clipboard-write 产生窗口副作用。
  function copyText(text: string, closeCardPopup = false) {
    sendLegacyIpc('highlighted-text:copy', text, closeCardPopup)
  }

  function closeTranslate() {
    sendLegacyIpc('close-translate')
  }

  function translateSelectedText(text: string, locale?: string) {
    return translateRuntimeSelectedText(text, locale)
  }

  // 无边框弹窗通过主进程移动 BrowserWindow，自身只上报鼠标屏幕坐标。
  function startWindowDrag(screenX: number, screenY: number) {
    startRuntimeWindowDrag(screenX, screenY)
  }

  function moveWindowDrag(screenX: number, screenY: number) {
    moveRuntimeWindowDrag(screenX, screenY)
  }

  function endWindowDrag() {
    endRuntimeWindowDrag()
  }

  function onCardPopupText(listener: (payload: { text?: string }) => void) {
    // 主进程发送的是 Electron IPC 原始参数，这里转换成组件需要的 payload。
    const wrapped: IpcListener = (_event, payload) => {
      listener((payload as { text?: string }) || {})
    }
    return onLegacyIpcChannel('card-popup-text', wrapped)
  }

  function onTranslationText(listener: (text: string) => void) {
    // 翻译弹窗只关心文本本身，兜底转换为空字符串避免 undefined 进入 UI。
    const wrapped: IpcListener = (_event, text) => {
      listener(String(text || ''))
    }
    return onLegacyIpcChannel('update-translation-text', wrapped)
  }

  return {
    getAuthToken,
    getCurrentCardPopupText,
    getCurrentTranslatePopupText,
    showLogin,
    showTranslation,
    explain,
    copyText,
    closeTranslate,
    translateSelectedText,
    startWindowDrag,
    moveWindowDrag,
    endWindowDrag,
    onCardPopupText,
    onTranslationText
  }
}

export type HighlightedTextClient = ReturnType<typeof createHighlightedTextClient>
