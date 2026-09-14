/** 侧栏打开时 spawn 应用 Node，注入 globalThis.jiaorong。 */

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isJiaorongBridgeFailure } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'
import { handleAppBridgeInvoke } from './bridge'
import type { JiaorongAppHostDeps } from './deps'
import { bindGuestAppId } from './guestBind'
import { isPathInsideRoot } from './paths'
import { findVisibleOpenableApp, scanJiaorongApps } from './scan'
import { readUserIdentityFromAuthSession } from './userIdentity'

/** guest Node → 宿主的 invoke 消息。 */
type NodeInvokeMessage = {
  /** 类型。 */
  type: 'invoke'
  /** 记录 id。 */
  id: string
  /** 桥方法名。 */
  method: string
  /** invoke 参数。 */
  args?: unknown
}

/** 子进程已监听端口的通知。 */
type NodeListeningMessage = {
  /** 类型。 */
  type: 'listening'
  /** 端口。 */
  port: number
}

/** 虚拟 guestId 起点，避开真实 webContents id。 */
const NODE_GUEST_ID_BASE = 2_000_000
/** appId → Node 子进程。 */
const children = new Map<string, ChildProcess>()
/** appId → 虚拟 guestId。 */
const guestIds = new Map<string, number>()
/** appId → 已监听端口。 */
const allocatedPorts = new Map<string, number>()
/** 下一个虚拟 guestId。 */
let nextGuestId = NODE_GUEST_ID_BASE

/** 本应用 Node HTTP 根地址。 */
export function jiaorongAppNodeBase(port: number): string {
  return `http://127.0.0.1:${Math.floor(port)}`
}

/** 已分配的 Node 监听端口。 */
export function getAllocatedJiaorongAppNodePort(appId: string): number | null {
  if (!isAlive(children.get(appId))) return null
  return allocatedPorts.get(appId) ?? null
}

/** 允许带进子进程的环境变量名。 */
const GUEST_NODE_ENV_ALLOW = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'TMP',
  'TEMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'USER',
  'LOGNAME',
  'SHELL'
])

/** 构造 spawn Node 时的环境变量。 */
export function buildGuestNodeEnv(input: { appId: string; entry: string }): NodeJS.ProcessEnv {
  /** 子进程环境变量。 */
  const env: NodeJS.ProcessEnv = {}
  /** Map 键。 */
  for (const key of GUEST_NODE_ENV_ALLOW) {
    /** 待处理的值。 */
    const value = process.env[key]
    if (value) env[key] = value
  }
  env.ELECTRON_RUN_AS_NODE = '1'
  env.EGG_SERVER_ENV = 'prod'
  env.JIAORONG_NODE_ENTRY = input.entry
  env.JIAORONG_APP_ID = input.appId
  env.JIAORONG_NODE_HOST = '127.0.0.1'
  // 0 = 内核分配空闲口。不要自己探 20 个或抽随机数。
  env.JIAORONG_NODE_PORT = '0'
  return env
}

/**
 * 必须用动态 import()。静态 `import ... from` 会被 electron-vite esmShim
 * 当成主进程 import，把 __dirname shim 插进这段字符串里，启动直接崩。
 */
export const guestNodeBootstrapSource = `const { pathToFileURL } = await import('node:url')
const path = await import('node:path')
const net = await import('node:net')

const pending = new Map()
const listeners = new Map()
let reportedListen = false

function requestedListenPort(args) {
  const first = args[0]
  if (first == null || typeof first === 'function') return 0
  if (typeof first === 'number') return first
  if (typeof first === 'string') return /^\\d+$/.test(first) ? Number(first) : -1
  if (typeof first === 'object' && first && typeof first.port === 'number') return first.port
  if (typeof first === 'object' && first && !first.path) return 0
  return -1
}

function reportListening(server) {
  if (reportedListen || typeof process.send !== 'function') return
  const addr = server.address()
  if (!addr || typeof addr === 'string') return
  const host = String(addr.address || '')
  if (host !== '127.0.0.1' && host !== '::1' && host !== '::ffff:127.0.0.1') return
  const port = Number(addr.port)
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return
  reportedListen = true
  process.send({ type: 'listening', port })
}

const originalListen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  const requested = requestedListenPort(args)
  this.once('listening', () => {
    if (requested !== 0) return
    reportListening(this)
  })
  return originalListen.apply(this, args)
}



function isBridgeFailure(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    value.session === undefined &&
    value.agents === undefined &&
    value.items === undefined &&
    value.ok === undefined &&
    value.accepted === undefined &&
    value.hidden === undefined
  )
}

process.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'invoke:ok') {
    const waiter = pending.get(msg.id)
    pending.delete(msg.id)
    if (!waiter) return
    if (isBridgeFailure(msg.result)) waiter.reject(msg.result)
    else waiter.resolve(msg.result)
    return
  }
  if (msg.type === 'invoke:err') {
    const waiter = pending.get(msg.id)
    pending.delete(msg.id)
    waiter?.reject(msg.error ?? { code: 'GENERATION_FAILED', message: '请求失败' })
    return
  }
  if (msg.type === 'event') {
    const handlers = listeners.get(msg.event)
    if (!handlers) return
    for (const handler of handlers) {
      try {
        handler(msg.payload)
      } catch (error) {
        console.error('[jiaorong-app-node] event handler failed', error)
      }
    }
  }
})

function invoke(method, args) {
  const id = \`\${Date.now()}-\${Math.random().toString(16).slice(2)}\`
  return new Promise((resolve, reject) => {
    if (typeof process.send !== 'function') {
      reject({
        code: 'JIAORONG_NOT_RUNNING',
        message: '交融 Node 服务未启动'
      })
      return
    }
    pending.set(id, { resolve, reject })
    process.send({ type: 'invoke', id, method, args: args ?? {} })
  })
}

globalThis.jiaorong = Object.freeze({
  invoke,
  on(event, handler) {
    const set = listeners.get(event) ?? new Set()
    set.add(handler)
    listeners.set(event, set)
    return () => {
      set.delete(handler)
      if (set.size === 0) listeners.delete(event)
    }
  },
  userinfo() {
    return invoke('userinfo.get', {})
  }
})

const entry = process.env.JIAORONG_NODE_ENTRY
if (!entry) {
  throw new Error('JIAORONG_NODE_ENTRY is missing')
}
await import(pathToFileURL(path.resolve(entry)).href)
`

/** 当前用户可见且可打开的该应用运行时。 */
function currentVisibleRuntime(
  deps: JiaorongAppHostDeps,
  appId: string
): JiaorongAppRuntime | null {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  /** 应用列表。 */
  const apps = scanJiaorongApps(user).filter((item) => {
    if (!item.visible) return false
    if (item.source === 'store' && item.installStatus === 'not_installed') return false
    return true
  })
  return findVisibleOpenableApp(apps, appId)
}

/** 等到子进程 listening 或失败。 */
function waitForChildListening(child: ChildProcess, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolve) => {
    /** listening 是否已结束。 */
    let settled = false
    /** 结束等待。 */
    const finish = (port: number | null) => {
      if (settled) return
      settled = true
      child.off('message', onMessage)
      child.off('exit', onExit)
      clearTimeout(timer)
      resolve(port)
    }
    /** 收到一行消息时的回调。 */
    const onMessage = (raw: unknown) => {
      /** 消息对象。 */
      const msg = raw as Partial<NodeListeningMessage>
      if (msg?.type !== 'listening') return
      /** 端口。 */
      const port = typeof msg.port === 'number' ? Math.floor(msg.port) : 0
      if (port > 0 && port < 65536) finish(port)
    }
    /** 子进程退出回调。 */
    const onExit = () => finish(null)
    /** 定时器。 */
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.on('message', onMessage)
    child.once('exit', onExit)
  })
}

/** 给该应用 Node 分配虚拟 guestId。 */
export function guestIdForAppNode(appId: string): number {
  /** 已有记录。 */
  const existing = guestIds.get(appId)
  if (existing) return existing
  /** 记录 id。 */
  const id = nextGuestId++
  guestIds.set(appId, id)
  bindGuestAppId(id, appId)
  return id
}

/** guest Node bootstrap 脚本路径。 */
function bootstrapPath(appId: string): string {
  /** 目录。 */
  const dir = path.join(os.tmpdir(), 'jiaorong-app-node')
  fs.mkdirSync(dir, { recursive: true })
  /** 单个文件。 */
  const file = path.join(dir, `${appId}.mjs`)
  fs.writeFileSync(file, guestNodeBootstrapSource)
  return file
}

/** 子进程是否还活着。 */
function isAlive(child: ChildProcess | undefined): child is ChildProcess {
  return Boolean(child && !child.killed && child.exitCode === null)
}

/** 向该应用 Node 推桥事件。 */
export function sendJiaorongAppNodeEvent(appId: string, event: string, payload: unknown): void {
  /** 子进程。 */
  const child = children.get(appId)
  if (!isAlive(child) || typeof child.send !== 'function') return
  child.send({ type: 'event', event, payload })
}

/** 停掉该应用 Node 子进程。 */
export function stopJiaorongAppNode(appId: string): Promise<void> {
  /** 子进程。 */
  const child = children.get(appId)
  children.delete(appId)
  allocatedPorts.delete(appId)
  if (!child) return Promise.resolve()
  return new Promise((resolve) => {
    /** 结束等待。 */
    const finish = () => {
      child.removeAllListeners()
      resolve()
    }
    if (child.exitCode !== null) {
      finish()
      return
    }
    /** 定时器。 */
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish()
    }, 2000)
    child.once('exit', () => {
      clearTimeout(timer)
      finish()
    })
    if (!child.killed) child.kill()
  })
}

/** 停掉全部应用 Node。 */
export async function stopAllJiaorongAppNodes(): Promise<void> {
  await Promise.all([...children.keys()].map((appId) => stopJiaorongAppNode(appId)))
}

/** 确保该应用 Node 已启动。 */
export async function ensureJiaorongAppNode(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime
): Promise<void> {
  /** Node 入口。 */
  const node = runtime.node
  /** 应用安装目录。 */
  const appDir = runtime.appDir
  if (!node || !appDir) return
  /** 已有记录。 */
  const existing = children.get(runtime.id)
  if (isAlive(existing)) return

  /** 目录或列表一项。 */
  const entry = path.resolve(appDir, node.entry)
  if (!isPathInsideRoot(path.resolve(appDir), entry) || !fs.existsSync(entry)) {
    console.warn('[jiaorong-app] node entry missing or outside app dir', entry)
    return
  }

  /** guest id。 */
  const guestId = guestIdForAppNode(runtime.id)
  /** 子进程。 */
  const child = spawn(process.execPath, [bootstrapPath(runtime.id)], {
    cwd: appDir,
    env: buildGuestNodeEnv({
      appId: runtime.id,
      entry
    }),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  /** 子进程 listening Promise。 */
  const listening = waitForChildListening(child)

  child.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[jiaorong-app:${runtime.id}] ${chunk.toString().trimEnd()}`)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    console.warn(`[jiaorong-app:${runtime.id}] ${chunk.toString().trimEnd()}`)
  })
  child.on('exit', (code, signal) => {
    if (children.get(runtime.id) === child) {
      children.delete(runtime.id)
      allocatedPorts.delete(runtime.id)
    }
    console.warn('[jiaorong-app] node exited', runtime.id, code, signal)
  })
  child.on('message', (raw: unknown) => {
    /** 消息对象。 */
    const msg = raw as NodeInvokeMessage
    if (!msg || msg.type !== 'invoke' || typeof msg.id !== 'string') return
    /** 当前可见应用。 */
    const visible = currentVisibleRuntime(deps, runtime.id)
    if (!visible) {
      void stopJiaorongAppNode(runtime.id)
      if (typeof child.send === 'function') {
        child.send({
          type: 'invoke:err',
          id: msg.id,
          error: { code: 'FORBIDDEN', message: '当前用户看不到该应用' }
        })
      }
      return
    }
    void handleAppBridgeInvoke(deps, visible, String(msg.method || ''), msg.args, guestId)
      .then((result) => {
        if (typeof child.send !== 'function') return
        child.send({ type: 'invoke:ok', id: msg.id, result })
      })
      .catch((error) => {
        if (typeof child.send !== 'function') return
        /** 事件或请求负载。 */
        const payload = isJiaorongBridgeFailure(error)
          ? error
          : { code: 'GENERATION_FAILED', message: '请求失败' }
        child.send({ type: 'invoke:err', id: msg.id, error: payload })
      })
  })

  children.set(runtime.id, child)
  /** 端口。 */
  const port = await listening
  if (!port) {
    console.warn('[jiaorong-app] node port not ready', runtime.id)
    await stopJiaorongAppNode(runtime.id)
    return
  }
  allocatedPorts.set(runtime.id, port)
}
