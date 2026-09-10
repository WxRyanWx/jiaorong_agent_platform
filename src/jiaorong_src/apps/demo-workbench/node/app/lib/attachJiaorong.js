'use strict'

/**
 * 本机调试桥：给系统终端 `node server.js` 注入 globalThis.jiaorong。
 *
 * 系统终端没有宿主 IPC。交融客户端在跑时会写 ~/.jiaorongchat/node-bridge.json，
 * 这里连上后注入 globalThis.jiaorong。
 * 侧栏已经拉起的 Node 进程里 globalThis.jiaorong 已存在，本文件直接返回。
 */
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

/**
 * 本机调试桥清单路径。
 * 无参数。
 * 返回：`~/.jiaorongchat/node-bridge.json`。
 */
function bridgeFile() {
  return path.join(os.homedir(), '.jiaorongchat', 'node-bridge.json')
}

/**
 * 读桥地址。只接受本机回环、合法端口、非空 token。
 * 无参数。
 * 返回：{ host, port, token }；文件缺失或字段不合法时返回 null。
 */
function readEndpoint() {
  try {
    const raw = fs.readFileSync(bridgeFile(), 'utf8')
    const parsed = JSON.parse(raw)
    const host = typeof parsed.host === 'string' ? parsed.host.trim() : ''
    const port = Number(parsed.port)
    const token = typeof parsed.token === 'string' ? parsed.token : ''
    if (host !== '127.0.0.1' && host !== 'localhost') return null // 拒绝连到非本机，避免误连外网。
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null // 端口非法则当桥不可用。
    if (!token) return null // 没有 token 无法通过 hello 校验。
    return { host: '127.0.0.1', port, token }
  } catch {
    return null // 文件不存在或 JSON 坏了：调用方按桥未启动处理。
  }
}

/**
 * 按行协议写一条 JSON（末尾补 \n）。
 * @param {import('node:net').Socket} socket TCP 连接
 * @param {object} payload 要发送的对象
 * @returns {void}
 */
function writeLine(socket, payload) {
  socket.write(`${JSON.stringify(payload)}\n`)
}

/**
 * 确保 globalThis.jiaorong 可用：已注入则跳过，否则连本机调试桥再注入。
 * @param {string} appId 应用 id，hello 时带给宿主
 * @returns {Promise<void>} 注入完成 resolve；桥不可用则 reject，code 为 JIAORONG_NOT_RUNNING 等
 */
function attachJiaorong(appId) {
  if (
    globalThis.jiaorong &&
    typeof globalThis.jiaorong.invoke === 'function' &&
    typeof globalThis.jiaorong.on === 'function'
  ) {
    // 侧栏拉起的进程宿主已经注入，不再二次连接。
    return Promise.resolve()
  }
  const id = typeof appId === 'string' ? appId.trim() : ''
  const endpoint = readEndpoint()
  if (!id || !endpoint) {
    // 没有 appId 或桥清单不可用：明确告诉调用方先开交融客户端。
    const error = new Error(
      '交融客户端未在本机开放 Node 调试桥。请先启动并登录交融客户端，应用需已安装。'
    )
    error.code = 'JIAORONG_NOT_RUNNING'
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    // pending：invokeId → { resolve, reject }，等 invoke:ok / invoke:err。
    const pending = new Map()
    // listeners：事件名 → handler 集合，对应 jiaorong.on。
    const listeners = new Map()
    // settled：hello 已成功或已 fail，防止重复 settle。
    let settled = false
    const socket = net.connect({ host: endpoint.host, port: endpoint.port })
    const timer = setTimeout(() => {
      fail({ code: 'JIAORONG_NOT_RUNNING', message: '连接交融客户端超时' })
    }, 3000)

    /**
     * 连接失败：关 socket、清超时、reject。已 settled 则忽略。
     * @param {{ code?: string, message?: string }} payload 错误码和文案
     * @returns {void}
     */
    function fail(payload) {
      if (settled) return // 已经成功或已经失败过，避免二次 reject。
      settled = true
      clearTimeout(timer)
      try {
        socket.destroy()
      } catch {
        // destroy 在已关闭的 socket 上可能抛，忽略。
      }
      const error = new Error(payload.message || '交融 Node 服务未启动')
      error.code = payload.code || 'JIAORONG_NOT_RUNNING'
      reject(error)
    }

    // buffer：按 \n 拆行协议时的半包缓存。
    let buffer = ''
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) onLine(line) // 空行是心跳 / 分隔，不解析。
        index = buffer.indexOf('\n')
      }
    })
    socket.on('error', () => {
      fail({ code: 'JIAORONG_NOT_RUNNING', message: '无法连接交融客户端' })
    })
    socket.on('close', () => {
      if (!settled) {
        // hello 还没完成就断了：按桥不可用失败，不要一直挂起。
        fail({ code: 'JIAORONG_NOT_RUNNING', message: '交融客户端已断开' })
      }
    })
    socket.on('connect', () => {
      writeLine(socket, { type: 'hello', token: endpoint.token, appId: id })
    })

    /**
     * 处理桥发来的一行 JSON。
     * @param {string} line 已 trim 的一行
     * @returns {void}
     */
    function onLine(line) {
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        return // 非 JSON 行忽略，避免一包脏数据拆掉整条连接。
      }
      if (!msg || typeof msg !== 'object') return // 只接受对象报文。
      if (msg.type === 'hello:err') {
        fail(msg.error || { code: 'UNAUTHORIZED', message: '本机调试桥校验失败' })
        return
      }
      if (msg.type === 'hello:ok') {
        if (settled) return // 重复 hello:ok 忽略，避免覆盖已注入的对象。
        settled = true
        clearTimeout(timer)
        globalThis.jiaorong = Object.freeze({
          /**
           * 经 TCP 桥转发一次 SDK invoke。
           * @param {string} method 宿主方法名
           * @param {object} [args] 入参
           * @returns {Promise<*>} invoke:ok 的 result
           */
          invoke(method, args) {
            const invokeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
            return new Promise((ok, no) => {
              pending.set(invokeId, { resolve: ok, reject: no })
              writeLine(socket, { type: 'invoke', id: invokeId, method, args: args ?? {} })
            })
          },
          /**
           * 订阅桥推过来的事件。
           * @param {string} event 事件名
           * @param {Function} handler 收到 payload 时调用
           * @returns {Function} 取消订阅
           */
          on(event, handler) {
            const set = listeners.get(event) ?? new Set()
            set.add(handler)
            listeners.set(event, set)
            return () => {
              set.delete(handler)
              if (set.size === 0) listeners.delete(event) // 没人听了就删 key，避免空 Set 堆积。
            }
          },
          /**
           * 读当前登录用户。内部走 invoke('userinfo.get')。
           * 无参数。
           * 返回：Promise，resolve 为用户信息。
           */
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
        if (!handlers) return // 没人订这个事件，丢弃。
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
