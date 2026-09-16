/**
 * 应用 webview 专用 preload。注入 window.jiaorong + initRendererBridge。
 * 页面业务不直接调这些方法；Node 经 WS 按路径调（如 jiaorong.agent.create）。
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  JIAORONG_APP_BRIDGE_EVENT_CHANNEL,
  JIAORONG_APP_BRIDGE_INVOKE_CHANNEL
} from '@jiaorong/appHost/channels'
import { isJiaorongBridgeFailure } from '@jiaorong/appHost/bridgeErrors'
import { logJiaorongSdkDebug } from '@jiaorong/appHost/sdkDebugLog'
import { initRendererBridge } from './main/bir'

type Handler = (payload: unknown) => void

const listeners = new Map<string, Set<Handler>>()
let debugEnabled = false

ipcRenderer.on(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, (_event, envelope: unknown) => {
  if (!envelope || typeof envelope !== 'object') return
  const record = envelope as { event?: unknown; payload?: unknown }
  if (typeof record.event !== 'string') return
  if (debugEnabled) {
    logJiaorongSdkDebug('event', record.event, record.payload)
  }
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
  if (debugEnabled) {
    logJiaorongSdkDebug('invoke', method, args)
  }
  return ipcRenderer.invoke(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, { method, args }).then(
    (result) => {
      if (isJiaorongBridgeFailure(result)) {
        if (debugEnabled) logJiaorongSdkDebug('invoke:err', method, result)
        const error = new Error(result.message || method)
        ;(error as Error & { code: string }).code = result.code
        return Promise.reject(error)
      }
      if (debugEnabled) logJiaorongSdkDebug('invoke:ok', method, result)
      return result
    },
    (error) => {
      if (debugEnabled) logJiaorongSdkDebug('invoke:err', method, error)
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  )
}

function call(method: string) {
  return (args?: unknown) => invoke(method, args)
}

function getPathForFile(file: File) {
  try {
    return webUtils.getPathForFile(file) || ''
  } catch {
    return ''
  }
}

function setDebug(enabled: boolean) {
  debugEnabled = Boolean(enabled)
  console.log('[jiaorong-app] debug', debugEnabled ? 'on' : 'off')
}

function on(event: string, handler: Handler) {
  const set = listeners.get(event) ?? new Set<Handler>()
  set.add(handler)
  listeners.set(event, set)
  return () => {
    const current = listeners.get(event)
    if (!current) return
    current.delete(handler)
    if (current.size === 0) listeners.delete(event)
  }
}

const jiaorong = {
  invoke, // 按方法名走 IPC
  on, // 订阅超级智能体推送
  getPathForFile, // File 转本机路径
  setDebug, // 打开桥调试日志
  disconnect: call('disconnect'), // 断开本页桥
  getContext: call('context.get'), // 应用目录与登录态
  userinfo: call('userinfo.get'), // 当前用户
  respondToolInteraction: call('chat.respondToolInteraction'), // 回答工具审批
  openDevTools: call('devtools.open'), // 打开应用 DevTools
  agent: {
    create: call('agent.create'), // 按 key 创建或覆盖
    get: call('agent.get'), // 按 key/id 取一条
    list: call('agent.list') // 列出本应用智能体
  },
  session: {
    create: call('session.create'), // 新建会话
    list: call('session.list'), // 会话列表
    search: call('session.search'), // 搜历史
    get: call('session.get'), // 会话详情
    rename: call('session.rename'), // 改标题
    delete: call('session.delete'), // 删会话
    send: call('session.send'), // 发消息
    stop: call('session.stop'), // 停生成
    steer: call('session.steer'), // 中途改指令
    pin: call('session.pin'), // 置顶
    setModel: call('session.setModel'), // 换模型
    setPermissionMode: call('session.setPermissionMode'), // 权限模式
    setOrchestrationPolicy: call('session.setOrchestrationPolicy'), // 编排策略
    getGenerationSettings: call('session.getGenerationSettings'), // 读生成设置
    updateGenerationSettings: call('session.updateGenerationSettings'), // 写生成设置
    getContextOccupancy: call('session.getContextOccupancy'), // 上下文占用
    setToolMode: call('session.setToolMode'), // 工具模式
    getDisabledAgentTools: call('session.getDisabledAgentTools'), // 已禁用工具
    updateDisabledAgentTools: call('session.updateDisabledAgentTools'), // 改禁用工具
    retryMessage: call('session.retryMessage'), // 重试消息
    deleteMessage: call('session.deleteMessage'), // 删消息
    editUserMessage: call('session.editUserMessage'), // 改用户消息
    fork: call('session.fork') // 从某条分叉
  },
  catalog: {
    slash: call('catalog.slash'), // 斜杠命令
    models: call('catalog.models'), // 可用模型
    systemPrompts: call('catalog.systemPrompts'), // 系统提示词
    agentTools: call('catalog.agentTools') // 智能体工具
  },
  knowledgeBase: {
    query: call('knowledgeBase.query'), // 查知识库
    queryDirectory: call('knowledgeBase.queryDirectory') // 下探目录
  },
  dialog: {
    selectDirectory: call('dialog.selectDirectory'), // 选目录
    selectFiles: call('dialog.selectFiles'), // 选文件
    readFilePreview: call('dialog.readFilePreview'), // 读预览
    rememberDroppedFiles: call('dialog.rememberDroppedFiles'), // 记住拖入文件
    allowProjectDir: call('dialog.allowProjectDir') // 授权项目目录
  },
  clipboard: {
    writeImage: call('clipboard.writeImage') // 写图片到剪贴板
  },
  capture: {
    pageArea: call('capture.pageArea') // 截页面区域
  }
}

function pinJiaorong() {
  try {
    Object.defineProperty(window, 'jiaorong', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: jiaorong
    })
  } catch {
    ;(window as unknown as { jiaorong: typeof jiaorong }).jiaorong = jiaorong
  }
}

pinJiaorong()

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('jiaorong', jiaorong)
    pinJiaorong()
    contextBridge.exposeInMainWorld(
      'initRendererBridge',
      async (port: number, apisCustom?: unknown) => {
        pinJiaorong()
        const bridge = await initRendererBridge(port, apisCustom)
        return { stop: () => bridge.stop() }
      }
    )
  } catch (error) {
    console.warn('[jiaorong-app] preload already exposed', error)
  }
} else {
  pinJiaorong()
  ;(window as unknown as { initRendererBridge: typeof initRendererBridge }).initRendererBridge =
    initRendererBridge
}
