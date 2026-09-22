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

/** 桥事件回调。 */
type Handler = (payload: unknown) => void

/** 事件名 → 回调集合。 */
const listeners = new Map<string, Set<Handler>>()
/** 是否打印桥调试日志。 */
let debugEnabled = false

// 主进程推来的桥事件统一入口
ipcRenderer.on(JIAORONG_APP_BRIDGE_EVENT_CHANNEL, (_event, envelope: unknown) => {
  // 非对象信封直接丢弃
  if (!envelope || typeof envelope !== 'object') return
  /** 事件信封。 */
  const record = envelope as { event?: unknown; payload?: unknown }
  // 没有事件名无法分发
  if (typeof record.event !== 'string') return
  // 调试态打一条脱敏日志
  if (debugEnabled) {
    logJiaorongSdkDebug('event', record.event, record.payload)
  }
  /** 该事件的回调集合。 */
  const handlers = listeners.get(record.event)
  // 没人订阅这个事件
  if (!handlers) return
  for (const handler of handlers) {
    try {
      handler(record.payload)
    } catch (error) {
      // 单个回调抛错不能影响其它回调
      console.error('[jiaorong-app] event handler failed', error)
    }
  }
})

/**
 * 按方法名调用主进程桥，失败统一 reject 带 `code` 的 Error。
 * @param method 桥方法名，如 `session.send`
 * @param args 方法入参
 */
function invoke(method: string, args?: unknown) {
  // 调试态记录本次调用
  if (debugEnabled) {
    logJiaorongSdkDebug('invoke', method, args)
  }
  return ipcRenderer.invoke(JIAORONG_APP_BRIDGE_INVOKE_CHANNEL, { method, args }).then(
    (result) => {
      // 主进程返回的是失败体：转成带稳定 code 的 Error
      if (isJiaorongBridgeFailure(result)) {
        if (debugEnabled) logJiaorongSdkDebug('invoke:err', method, result)
        /** 抛给应用的错误。 */
        const error = new Error(result.message || method)
        // 附上失败码，供应用侧分支处理
        ;(error as Error & { code: string }).code = result.code
        return Promise.reject(error)
      }
      // 成功：原样透传 payload
      if (debugEnabled) logJiaorongSdkDebug('invoke:ok', method, result)
      return result
    },
    (error) => {
      // IPC 层本身失败（handler 未注册、渲染进程被销毁等）
      if (debugEnabled) logJiaorongSdkDebug('invoke:err', method, error)
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  )
}

/**
 * 生成绑定固定方法名的调用函数，供下面的能力表批量声明。
 * @param method 桥方法名
 */
function call(method: string) {
  return (args?: unknown) => invoke(method, args)
}

/**
 * 把页面拿到的 File 换成本机绝对路径。
 * @param file 拖入或选中的文件
 */
function getPathForFile(file: File) {
  try {
    return webUtils.getPathForFile(file) || ''
  } catch {
    // 非本机文件（远程 blob 等）拿不到路径
    return ''
  }
}

/**
 * 开关桥调试日志。
 * @param enabled 是否打开
 */
function setDebug(enabled: boolean) {
  debugEnabled = Boolean(enabled)
  console.log('[jiaorong-app] debug', debugEnabled ? 'on' : 'off')
}

/**
 * 订阅主进程推送的事件。
 * @param event 事件名
 * @param handler 回调
 * @returns 取消订阅函数
 */
function on(event: string, handler: Handler) {
  const name = typeof event === 'string' ? event.trim() : ''
  // Node 经 WS 调过来时回调会被 JSON 丢掉，绝不能把非函数塞进表
  if (!name || typeof handler !== 'function') {
    return () => {}
  }
  /** 该事件的回调集合，没有就新建。 */
  const set = listeners.get(name) ?? new Set<Handler>()
  set.add(handler)
  listeners.set(name, set)
  return () => {
    /** 取消时该事件的回调集合。 */
    const current = listeners.get(name)
    // 已经被清空，无需处理
    if (!current) return
    current.delete(handler)
    // 最后一个回调退订后删掉键，避免 Map 无限增长
    if (current.size === 0) listeners.delete(name)
  }
}

/** 暴露给应用页面的 `window.jiaorong` 能力表。 */
const jiaorong = {
  invoke, // 按方法名走 IPC
  on, // 订阅超级智能体推送
  getPathForFile, // File 转本机路径
  setDebug, // 打开桥调试日志
  disconnect: call('disconnect'), // 断开本页桥
  getContext: call('context.get'), // 应用目录、登录态与环境（dev / prod）
  userinfo: call('userinfo.get'), // 当前用户
  respondToolInteraction: call('chat.respondToolInteraction'), // 回答工具审批
  openDevTools: call('devtools.open'), // 打开应用 DevTools
  agent: {
    create: call('agent.create'), // 按 agentKey 创建或覆盖，兼容 key
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
  mcp: {
    create: call('mcp.create') // 按 JSON 创建 MCP，默开，可限定智能体
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

/**
 * 把 `window.jiaorong` 钉在当前 window 上。
 * contextBridge 生成的代理可能被页面覆盖，这里用 defineProperty 再兜一层。
 */
function pinJiaorong() {
  try {
    Object.defineProperty(window, 'jiaorong', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: jiaorong
    })
  } catch {
    // 属性不可重定义时退化成直接赋值
    ;(window as unknown as { jiaorong: typeof jiaorong }).jiaorong = jiaorong
  }
}

// preload 一进来先钉一次，保证页面脚本能同步拿到
pinJiaorong()

// 开了上下文隔离：通过 contextBridge 正式暴露
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('jiaorong', jiaorong)
    // 暴露后再钉一次，覆盖 contextBridge 生成的代理对象
    pinJiaorong()
    contextBridge.exposeInMainWorld(
      'initRendererBridge',
      // 页面调这个连包内 Node 的 WS 桥
      async (port: number, apisCustom?: unknown) => {
        // 连桥前再钉一次，防止 Node 侧拿到空的 jiaorong
        pinJiaorong()
        /** WS 桥实例。 */
        const bridge = await initRendererBridge(port, apisCustom)
        // 只暴露 stop，不把整个桥对象递给页面
        return { stop: () => bridge.stop() }
      }
    )
  } catch (error) {
    // 同一 window 重复暴露会抛错，忽略即可
    console.warn('[jiaorong-app] preload already exposed', error)
  }
} else {
  // 未开隔离：直接挂到 window
  pinJiaorong()
  ;(window as unknown as { initRendererBridge: typeof initRendererBridge }).initRendererBridge =
    initRendererBridge
}
