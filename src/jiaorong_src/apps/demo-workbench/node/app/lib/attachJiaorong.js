'use strict'

/**
 * 系统终端 `node server.js` 时没有宿主 IPC。
 * 交融客户端在跑时会写 ~/.jiaorongchat/node-bridge.json，这里连上后注入 globalThis.jiaorong。
 * 侧栏已经拉起的 Node 进程里 globalThis.jiaorong 已存在，本文件直接返回。
 */
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

function bridgeFile() {
  return path.join(os.homedir(), '.jiaorongchat', 'node-bridge.json')
}

function readEndpoint() {
  try {
    const raw = fs.readFileSync(bridgeFile(), 'utf8')
    const parsed = JSON.parse(raw)
    const host = typeof parsed.host === 'string' ? parsed.host.trim() : ''
    const port = Number(parsed.port)
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    if (host !== '127.0.0.1' && host !== 'localhost') return null
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null
    if (!token) return null
    return { host: '127.0.0.1', port, token }
  } catch {
    return null
  }
}

function writeLine(socket, payload) {
  socket.write(`${JSON.stringify(payload)}\n`)
}

function attachJiaorong(appId) {
  if (
    globalThis.jiaorong &&
    typeof globalThis.jiaorong.invoke === 'function' &&
    typeof globalThis.jiaorong.on === 'function'
  ) {
    return Promise.resolve()
  }
  const id = typeof appId === 'string' ? appId.trim() : ''
  const endpoint = readEndpoint()
  if (!id || !endpoint) {
    const error = new Error(
      '交融客户端未在本机开放 Node 调试桥。请先启动并登录交融客户端，应用需已安装。'
    )
    error.code = 'JIAORONG_NOT_RUNNING'
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    const pending = new Map()
    const listeners = new Map()
    let settled = false
    const socket = net.connect({ host: endpoint.host, port: endpoint.port })
    const timer = setTimeout(() => {
      fail({ code: 'JIAORONG_NOT_RUNNING', message: '连接交融客户端超时' })
    }, 3000)

    function fail(payload) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      const error = new Error(payload.message || '交融 Node 服务未启动')
      error.code = payload.code || 'JIAORONG_NOT_RUNNING'
      reject(error)
    }

    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) onLine(line)
        index = buffer.indexOf('\n')
      }
    })
    socket.on('error', () => {
      fail({ code: 'JIAORONG_NOT_RUNNING', message: '无法连接交融客户端' })
    })
    socket.on('close', () => {
      if (!settled) {
        fail({ code: 'JIAORONG_NOT_RUNNING', message: '交融客户端已断开' })
      }
    })
    socket.on('connect', () => {
      writeLine(socket, { type: 'hello', token: endpoint.token, appId: id })
    })

    function onLine(line) {
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'hello:err') {
        fail(msg.error || { code: 'UNAUTHORIZED', message: '本机调试桥校验失败' })
        return
      }
      if (msg.type === 'hello:ok') {
        if (settled) return
        settled = true
        clearTimeout(timer)
        globalThis.jiaorong = Object.freeze({
          invoke(method, args) {
            const invokeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
            return new Promise((ok, no) => {
              pending.set(invokeId, { resolve: ok, reject: no })
              writeLine(socket, { type: 'invoke', id: invokeId, method, args: args ?? {} })
            })
          },
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
            return globalThis.jiaorong.invoke('userinfo.get', {})
          }
        })
        resolve()
        return
      }
      if (msg.type === 'invoke:ok') {
        const waiter = pending.get(msg.id)
        pending.delete(msg.id)
        waiter?.resolve(msg.result)
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
    }
  })
}

module.exports = { attachJiaorong }
