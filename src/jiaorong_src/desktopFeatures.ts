import type { Presenter } from '../main/presenter'
import { eventBus } from '../main/eventbus'
import { CONFIG_EVENTS } from '../main/events'
import { destroyHighlightedTextFeature, initHighlightedTextFeature } from './highlightedText'
import { initScreenShotFeature } from './screenShot'

let initialized = false

/** 统一初始化交融桌面私有能力，避免具体实现进入开源主进程启动文件。 */
export const initJiaorongDesktopFeatures = (presenter: Presenter): void => {
  if (initialized) return
  initialized = true

  const applyHighlightedTextEnabled = (enabled: boolean): void => {
    if (!enabled) {
      destroyHighlightedTextFeature()
      return
    }
    void initHighlightedTextFeature(presenter.windowPresenter.mainWindow).catch((error) => {
      console.warn('[jiaorongDesktop] highlighted text initialization failed:', error)
    })
  }

  applyHighlightedTextEnabled(
    presenter.configPresenter.getSetting<boolean>('highlightedTextEnabled') ?? true
  )
  eventBus.on(CONFIG_EVENTS.SETTING_CHANGED, (key, value) => {
    if (key === 'highlightedTextEnabled') applyHighlightedTextEnabled(Boolean(value))
  })

  initScreenShotFeature(
    async () => {
      const mainWindow = presenter.windowPresenter.mainWindow
      if (!mainWindow || mainWindow.isDestroyed()) return null
      try {
        const token = await mainWindow.webContents.executeJavaScript(
          `localStorage.getItem('xkaitoken')`,
          true
        )
        return typeof token === 'string' && token ? token : null
      } catch (error) {
        console.warn('[jiaorongDesktop] screenshot token read failed:', error)
        return null
      }
    },
    () => presenter.configPresenter.getShortcutKey().Screenshot
  )
}
