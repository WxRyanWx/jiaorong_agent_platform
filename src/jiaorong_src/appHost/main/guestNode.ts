import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
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

type NodeInvokeMessage = {
  type: 'invoke'
  id: string
  method: string
  args?: unknown
}

const NODE_GUEST_ID_BASE = 2_000_000
const children = new Map<string, ChildProcess>()
const guestIds = new Map<string, number>()
let nextGuestId = NODE_GUEST_ID_BASE

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

export function buildGuestNodeEnv(input: {
  appId: string
  entry: string
  port?: number
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of GUEST_NODE_ENV_ALLOW) {
    const value = process.env[key]
    if (value) env[key] = value
  }
  env.ELECTRON_RUN_AS_NODE = '1'
  env.EGG_SERVER_ENV = 'prod'
  env.JIAORONG_NODE_ENTRY = input.entry
  env.JIAORONG_APP_ID = input.appId
  env.JIAORONG_NODE_HOST = '127.0.0.1'
  if (typeof input.port === 'number' && Number.isFinite(input.port) && input.port > 0) {
    env.JIAORONG_NODE_PORT = String(Math.floor(input.port))
  }
  return env
}

/**
 * 必须用动态 import()。静态 `import ... from` 会被 electron-vite esmShim
 * 当成主进程 import，把 __dirname shim 插进这段字符串里，启动直接崩。
 */
export const guestNodeBootstrapSource = `const { pathToFileURL } = await import('node:url')
const path = await import('node:path')

const pending = new Map()
const listeners = new Map()

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

function currentVisibleRuntime(
  deps: JiaorongAppHostDeps,
  appId: string
): JiaorongAppRuntime | null {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  const apps = scanJiaorongApps(user).filter((item) => {
    if (!item.visible) return false
    if (item.source === 'store' && item.installStatus === 'not_installed') return false
    return true
  })
  return findVisibleOpenableApp(apps, appId)
}

function waitForLocalPort(port: number, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now()
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - started >= timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(tryOnce, 150)
      })
    }
    tryOnce()
  })
}

function nodeGuestId(appId: string): number {
  const existing = guestIds.get(appId)
  if (existing) return existing
  const id = nextGuestId++
  guestIds.set(appId, id)
  bindGuestAppId(id, appId)
  return id
}

function bootstrapPath(appId: string): string {
  const dir = path.join(os.tmpdir(), 'jiaorong-app-node')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${appId}.mjs`)
  fs.writeFileSync(file, guestNodeBootstrapSource)
  return file
}

function isAlive(child: ChildProcess | undefined): child is ChildProcess {
  return Boolean(child && !child.killed && child.exitCode === null)
}

export function sendJiaorongAppNodeEvent(appId: string, event: string, payload: unknown): void {
  const child = children.get(appId)
  if (!isAlive(child) || typeof child.send !== 'function') return
  child.send({ type: 'event', event, payload })
}

export function stopJiaorongAppNode(appId: string): Promise<void> {
  const child = children.get(appId)
  children.delete(appId)
  if (!child) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      child.removeAllListeners()
      resolve()
    }
    if (child.exitCode !== null) {
      finish()
      return
    }
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

export async function stopAllJiaorongAppNodes(): Promise<void> {
  await Promise.all([...children.keys()].map((appId) => stopJiaorongAppNode(appId)))
}

export async function ensureJiaorongAppNode(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime
): Promise<void> {
  const node = runtime.node
  const appDir = runtime.appDir
  if (!node || !appDir) return
  const existing = children.get(runtime.id)
  if (isAlive(existing)) return

  const entry = path.resolve(appDir, node.entry)
  if (!isPathInsideRoot(path.resolve(appDir), entry) || !fs.existsSync(entry)) {
    console.warn('[jiaorong-app] node entry missing or outside app dir', entry)
    return
  }

  const guestId = nodeGuestId(runtime.id)
  const child = spawn(process.execPath, [bootstrapPath(runtime.id)], {
    cwd: appDir,
    env: buildGuestNodeEnv({
      appId: runtime.id,
      entry,
      port: node.port
    }),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })

  child.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[jiaorong-app:${runtime.id}] ${chunk.toString().trimEnd()}`)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    console.warn(`[jiaorong-app:${runtime.id}] ${chunk.toString().trimEnd()}`)
  })
  child.on('exit', (code, signal) => {
    if (children.get(runtime.id) === child) children.delete(runtime.id)
    console.warn('[jiaorong-app] node exited', runtime.id, code, signal)
  })
  child.on('message', (raw: unknown) => {
    const msg = raw as NodeInvokeMessage
    if (!msg || msg.type !== 'invoke' || typeof msg.id !== 'string') return
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
        const payload = isJiaorongBridgeFailure(error)
          ? error
          : { code: 'GENERATION_FAILED', message: '请求失败' }
        child.send({ type: 'invoke:err', id: msg.id, error: payload })
      })
  })

  children.set(runtime.id, child)
  if (typeof node.port === 'number' && node.port > 0) {
    const ready = await waitForLocalPort(node.port)
    if (!ready) {
      console.warn('[jiaorong-app] node port not ready', runtime.id, node.port)
    }
  }
}
