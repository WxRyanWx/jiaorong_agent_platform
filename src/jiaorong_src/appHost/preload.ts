import { contextBridge, ipcRenderer } from 'electron'
import {
  JIAORONG_APP_BRIDGE_EVENT_CHANNEL,
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL
} from '@jiaorong/appHost/channels'
import { isJiaorongBridgeFailure } from '@jiaorong/appHost/bridgeErrors'

type Handler = (payload: unknown) => void

const listeners = new Map<string, Set<Handler>>()

ipcRenderer.on(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, (_event, envelope: unknown) => {
  if (!envelope || typeof envelope !== 'object') return
  const record = envelope as { event?: unknown; payload?: unknown }
  if (typeof record.event !== 'string') return
  const handlers = listeners.get(record.event)
  if (!handlers) return
  for (const handler of handlers) {
    try {
      handler(record.payload)
    } catch (error) {
      console.error('[jiaorong-app] event handler failed', error)
    }
  }
})

function invoke(method: string, args?: unknown) {
  return ipcRenderer.invoke(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, { method, args }).then((result) => {
    if (isJiaorongBridgeFailure(result)) {
      return Promise.reject(result)
    }
    return result
  })
}

const jiaorong = Object.freeze({
  invoke,
  on(event: string, handler: Handler) {
    const set = listeners.get(event) ?? new Set<Handler>()
    set.add(handler)
    listeners.set(event, set)
    return () => {
      const current = listeners.get(event)
      if (!current) return
      current.delete(handler)
      if (current.size === 0) listeners.delete(event)
    }
  },
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
