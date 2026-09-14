/** 独立 node server.js：node-bridge.json JSON 行协议。 */

import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { isJiaorongBridgeFailure } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'
import { handleAppBridgeInvoke } from './bridge'
import type { JiaorongAppHostDeps } from './deps'
import { guestIdForAppNode } from './guestNode'
import { ensureDir, getNodeBridgeFile } from './paths'
import { findVisibleOpenableApp, scanJiaorongApps } from './scan'
import { readUserIdentityFromAuthSession } from './userIdentity'

/** 独立 Node TCP 客户端。 */
type BridgeClient = {
  /** TCP socket。 */
  socket: net.Socket
  /** 当前应用 id。 */
  appId: string
}

/** 一行 JSON 消息。 */
type ParsedLine = Record<string, unknown>

/** TCP 服务器。 */
let server: net.Server | null = null
/** 独立 Node 桥地址文件。 */
let endpointFile = ''
/** 已连接的独立 Node 客户端。 */
const clients = new Set<BridgeClient>()

/** 往 socket 写一行 JSON。 */
function writeLine(socket: net.Socket, payload: unknown): void {
  if (socket.destroyed) return
  socket.write(`${JSON.stringify(payload)}\n`)
}

/** 按行拆 TCP 缓冲并回调。 */
function createLineReader(onMessage: (msg: ParsedLine) => void): (chunk: Buffer) => void {
  /** 未拆完的行缓冲。 */
  let buffer = ''
  return (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    /** 下标。 */
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      /** 一行文本。 */
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) {
        try {
          /** 解析结果。 */
          const parsed = JSON.parse(line) as unknown
          if (parsed && typeof parsed === 'object') onMessage(parsed as ParsedLine)
        } catch {
          // ignore malformed lines
        }
      }
      index = buffer.indexOf('\n')
    }
  }
}

/** 当前可见的该应用运行时。 */
function visibleRuntime(deps: JiaorongAppHostDeps, appId: string): JiaorongAppRuntime | null {
  /** 当前用户身份。 */
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  /** 应用列表。 */
  const apps = scanJiaorongApps(user).filter((item) => {
    if (!item.visible) return false
    if (item.source === 'store' && item.installStatus === 'not_installed') return false
    return true
  })
  return findVisibleOpenableApp(apps, appId) ?? null
}

/** 向独立 Node 客户端推事件。 */
export function sendStandaloneNodeEvent(appId: string, event: string, payload: unknown): void {
  /** 一个 TCP 客户端。 */
  for (const client of clients) {
    if (client.appId !== appId) continue
    writeLine(client.socket, { type: 'event', event, payload })
  }
}

/** 启动本机独立 Node TCP 桥。 */
export function startStandaloneNodeBridge(deps: JiaorongAppHostDeps): void {
  if (server) return
  /** 登录 token。 */
  const token = randomBytes(32).toString('hex')
  endpointFile = getNodeBridgeFile()
  server = net.createServer((socket) => {
    /** 已鉴权的客户端。 */
    let authed: BridgeClient | null = null
    /** 收到一行消息时的回调。 */
    const onMessage = (msg: ParsedLine) => {
      /** 类型。 */
      const type = typeof msg.type === 'string' ? msg.type : ''
      if (!authed) {
        if (type !== 'hello') {
          writeLine(socket, {
            type: 'hello:err',
            error: { code: 'UNAUTHORIZED', message: '未握手' }
          })
          socket.end()
          return
        }
        if (msg.token !== token) {
          writeLine(socket, {
            type: 'hello:err',
            error: { code: 'UNAUTHORIZED', message: '本机调试桥校验失败' }
          })
          socket.end()
          return
        }
        /** 当前应用 id。 */
        const appId = typeof msg.appId === 'string' ? msg.appId.trim() : ''
        /** 当前应用运行时。 */
        const runtime = appId ? visibleRuntime(deps, appId) : null
        if (!runtime?.appDir) {
          writeLine(socket, {
            type: 'hello:err',
            error: { code: 'APP_NOT_FOUND', message: `未找到该应用：${appId}` }
          })
          socket.end()
          return
        }
        authed = { socket, appId: runtime.id }
        clients.add(authed)
        writeLine(socket, { type: 'hello:ok' })
        return
      }
      if (type !== 'invoke' || typeof msg.id !== 'string') return
      /** 当前应用运行时。 */
      const runtime = visibleRuntime(deps, authed.appId)
      if (!runtime?.appDir) {
        writeLine(socket, {
          type: 'invoke:err',
          id: msg.id,
          error: { code: 'APP_NOT_FOUND', message: `未找到该应用：${authed.appId}` }
        })
        return
      }
      /** 桥方法名。 */
      const method = typeof msg.method === 'string' ? msg.method : ''
      void handleAppBridgeInvoke(
        deps,
        runtime,
        method,
        msg.args,
        guestIdForAppNode(authed.appId)
      )
        .then((result) => {
          if (isJiaorongBridgeFailure(result)) {
            writeLine(socket, { type: 'invoke:err', id: msg.id, error: result })
            return
          }
          writeLine(socket, { type: 'invoke:ok', id: msg.id, result })
        })
        .catch((error) => {
          /** 事件或请求负载。 */
          const payload = isJiaorongBridgeFailure(error)
            ? error
            : { code: 'GENERATION_FAILED', message: '请求失败' }
          writeLine(socket, { type: 'invoke:err', id: msg.id, error: payload })
        })
    }
    socket.on('data', createLineReader(onMessage))
    socket.on('close', () => {
      if (authed) clients.delete(authed)
    })
    socket.on('error', () => {
      if (authed) clients.delete(authed)
    })
  })
  server.listen(0, '127.0.0.1', () => {
    /** 地址。 */
    const address = server?.address()
    if (!address || typeof address === 'string') return
    /** 目录。 */
    const dir = path.dirname(endpointFile)
    ensureDir(dir)
    fs.writeFileSync(
      endpointFile,
      `${JSON.stringify({ host: '127.0.0.1', port: address.port, token })}\n`,
      { encoding: 'utf8', mode: 0o600 }
    )
    try {
      fs.chmodSync(endpointFile, 0o600)
    } catch {
      // ignore if chmod is unsupported
    }
  })
  server.on('error', (error) => {
    console.warn('[jiaorong-app] standalone node bridge failed', error)
  })
}

/** 关掉独立 Node TCP 桥。 */
export function stopStandaloneNodeBridge(): void {
  /** 一个 TCP 客户端。 */
  for (const client of clients) {
    try {
      client.socket.destroy()
    } catch {
      // ignore
    }
  }
  clients.clear()
  /** 当前值。 */
  const current = server
  server = null
  if (endpointFile) {
    try {
      fs.unlinkSync(endpointFile)
    } catch {
      // ignore
    }
    endpointFile = ''
  }
  if (!current) return
  current.close()
}
