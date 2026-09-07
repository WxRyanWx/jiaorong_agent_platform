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

type BridgeClient = {
  socket: net.Socket
  appId: string
}

type ParsedLine = Record<string, unknown>

let server: net.Server | null = null
let endpointFile = ''
const clients = new Set<BridgeClient>()

function writeLine(socket: net.Socket, payload: unknown): void {
  if (socket.destroyed) return
  socket.write(`${JSON.stringify(payload)}\n`)
}

function createLineReader(onMessage: (msg: ParsedLine) => void): (chunk: Buffer) => void {
  let buffer = ''
  return (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let index = buffer.indexOf('\n')
    while (index >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (line) {
        try {
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

function visibleRuntime(deps: JiaorongAppHostDeps, appId: string): JiaorongAppRuntime | null {
  const user = readUserIdentityFromAuthSession(deps.getAuthSession())
  const apps = scanJiaorongApps(user).filter((item) => {
    if (!item.visible) return false
    if (item.source === 'store' && item.installStatus === 'not_installed') return false
    return true
  })
  return findVisibleOpenableApp(apps, appId) ?? null
}

export function sendStandaloneNodeEvent(appId: string, event: string, payload: unknown): void {
  for (const client of clients) {
    if (client.appId !== appId) continue
    writeLine(client.socket, { type: 'event', event, payload })
  }
}

export function startStandaloneNodeBridge(deps: JiaorongAppHostDeps): void {
  if (server) return
  const token = randomBytes(32).toString('hex')
  endpointFile = getNodeBridgeFile()
  server = net.createServer((socket) => {
    let authed: BridgeClient | null = null
    const onMessage = (msg: ParsedLine) => {
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
        const appId = typeof msg.appId === 'string' ? msg.appId.trim() : ''
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
      const runtime = visibleRuntime(deps, authed.appId)
      if (!runtime?.appDir) {
        writeLine(socket, {
          type: 'invoke:err',
          id: msg.id,
          error: { code: 'APP_NOT_FOUND', message: `未找到该应用：${authed.appId}` }
        })
        return
      }
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
    const address = server?.address()
    if (!address || typeof address === 'string') return
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

export function stopStandaloneNodeBridge(): void {
  for (const client of clients) {
    try {
      client.socket.destroy()
    } catch {
      // ignore
    }
  }
  clients.clear()
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
