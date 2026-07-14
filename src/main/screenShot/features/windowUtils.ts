import { app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { writeScreenshotLog } from '../logging/runtimeLogger'

/**
 * 获取功能窗口共用的 preload 路径。
 * 主进程源码会统一打包到 out/main，因此这里按构建产物目录计算，而不是按源码层级计算。
 */
export const getFeaturePreloadPath = (): string => join(__dirname, '../preload/index.mjs')

/** 获取随截图资源一起打包的轻量功能页面路径。 */
export const getScreenshotFeatureHtmlPath = (filename: string): string =>
  is.dev
    ? join(app.getAppPath(), 'resources/screen-shot', filename)
    : join(process.resourcesPath, 'app.asar.unpacked/resources/screen-shot', filename)

/** 在指定窗口中加载主 Renderer 的 hash 路由。 */
export const loadFeatureRoute = (win: BrowserWindow, hash: string): void => {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`).catch((error) => {
      writeScreenshotLog('error', 'window', `load renderer route failed ${hash}`, error)
    })
    return
  }
  // 与 preload 相同，__dirname 指向打包后的 out/main。
  const rendererHtmlPath = join(__dirname, '../renderer/index.html')
  win.loadFile(rendererHtmlPath, { hash }).catch((error) => {
    writeScreenshotLog('error', 'window', `load renderer route failed ${hash}`, error)
  })
}

/** 显示窗口并使其在各平台保持置顶和聚焦。 */
export const showAlwaysOnTop = (win: BrowserWindow): void => {
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true)
    win.setAlwaysOnTop(true, 'floating')
  } else {
    win.setAlwaysOnTop(true)
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.show()
  win.focus()
}

/** 稍后显示已拿到初始化数据的结果窗口，避免闪现空内容。 */
export const revealWindowAfterPayloadApply = (
  win: BrowserWindow,
  reveal: (target: BrowserWindow) => void
): void => {
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) reveal(win)
  }, 40)
}
