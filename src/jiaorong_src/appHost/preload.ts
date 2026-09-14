/** 应用 webview 专用 preload。注入 `window.jiaorong`，不走官方窗口那份 preload。 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  JIAORONG_APP_BRIDGE_EVENT_CHANNEL,
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL
} from '@jiaorong/appHost/channels'
import { isJiaorongBridgeFailure } from '@jiaorong/appHost/bridgeErrors'

/** SDK `on(event)` 的回调。 */
type Handler = (payload: unknown) => void

/** 事件名 → 本页监听集合。 */
const listeners = new Map<string, Set<Handler>>()

ipcRenderer.on(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, (_event, envelope: unknown) => {
  if (!envelope || typeof envelope !== 'object') return
  /** 主进程推来的 `{ event, payload }`。 */
  const record = envelope as { event?: unknown; payload?: unknown }
  if (typeof record.event !== 'string') return
  /** 该事件已注册的回调。 */
  const handlers = listeners.get(record.event)
  if (!handlers) return
  /** 一条回调。 */
  for (const handler of handlers) {
    try {
      handler(record.payload)
    } catch (error) {
      console.error('[jiaorong-app] event handler failed', error)
    }
  }
})

/**
 * 调主进程桥。失败对象转成 Promise reject，供 SDK 变成 `JiaorongError`。
 * @param method 如 `session.send`
 * @param args 方法入参
 */
function invoke(method: string, args?: unknown) {
  return ipcRenderer.invoke(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, { method, args }).then((result) => {
    if (isJiaorongBridgeFailure(result)) {
      return Promise.reject(result)
    }
    return result
  })
}

/**
 * 把拖入的 File 转成本机路径（仅 Electron）。
 * @param file 浏览器 File
 */
function getPathForFile(file: File) {
  try {
    return webUtils.getPathForFile(file) || ''
  } catch {
    return ''
  }
}

/** 注入页面的宿主桥，SDK 只认这几个方法。 */
const jiaorong = Object.freeze({
  invoke,
  getPathForFile,
  /**
   * 订阅主进程事件。
   * @param event 事件名
   * @param handler 回调
   * @returns 取消订阅
   */
  on(event: string, handler: Handler) {
    /** 该事件的监听集合。 */
    const set = listeners.get(event) ?? new Set<Handler>()
    set.add(handler)
    listeners.set(event, set)
    return () => {
      /** 取消时的集合。 */
      const current = listeners.get(event)
      if (!current) return
      current.delete(handler)
      if (current.size === 0) listeners.delete(event)
    }
  },
  /** 当前登录 userInfo + token。 */
  userinfo() {
    return invoke('userinfo.get', {})
  }
})

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('jiaorong', jiaorong)
  } catch (error) {
    console.warn('[jiaorong-app] preload already exposed', error)
  }
} else {
  ;(window as unknown as Window & { jiaorong: typeof jiaorong }).jiaorong = jiaorong
}
