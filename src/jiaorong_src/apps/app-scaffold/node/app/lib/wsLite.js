'use strict'

/**
 * 极简 WebSocket 服务（RFC 6455 文本帧）。不引入 ws 依赖。
 */

const crypto = require('node:crypto')

/** RFC 6455 GUID。 */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/**
 * 计算 Sec-WebSocket-Accept。
 * @param {string} key 请求头 Sec-WebSocket-Key
 * @returns {string} Accept 值
 */
function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key) + GUID).digest('base64')
}

/**
 * 编码一帧文本。
 * @param {string} text UTF-8 文本
 * @returns {Buffer} 数据帧
 */
function encodeText(text) {
  const payload = Buffer.from(text, 'utf8')
  const length = payload.length
  if (length < 126) {
    const frame = Buffer.alloc(2 + length)
    frame[0] = 0x81
    frame[1] = length
    payload.copy(frame, 2)
    return frame
  }
  if (length < 65536) {
    const frame = Buffer.alloc(4 + length)
    frame[0] = 0x81
    frame[1] = 126
    frame.writeUInt16BE(length, 2)
    payload.copy(frame, 4)
    return frame
  }
  const frame = Buffer.alloc(10 + length)
  frame[0] = 0x81
  frame[1] = 127
  frame.writeUInt32BE(0, 2)
  frame.writeUInt32BE(length, 6)
  payload.copy(frame, 10)
  return frame
}

/**
 * 编码 Pong。
 * @param {Buffer} payload ping 负载
 * @returns {Buffer} pong 帧
 */
function encodePong(payload) {
  const length = payload.length
  const frame = Buffer.alloc(2 + length)
  frame[0] = 0x8a
  frame[1] = length
  payload.copy(frame, 2)
  return frame
}

/**
 * 解码一帧。数据不够则返回 null。
 * @param {Buffer} buffer 缓存
 * @returns {{ opcode: number, payload: Buffer, rest: Buffer } | null}
 */
function decodeFrame(buffer) {
  if (buffer.length < 2) return null
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  let length = buffer[1] & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < 4) return null
    length = buffer.readUInt16BE(2)
    offset = 4
  } else if (length === 127) {
    if (buffer.length < 10) return null
    length = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }
  const maskOffset = offset
  const dataOffset = masked ? offset + 4 : offset
  if (buffer.length < dataOffset + length) return null
  let payload = buffer.subarray(dataOffset, dataOffset + length)
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4)
    payload = Buffer.from(payload)
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4]
    }
  }
  return {
    opcode,
    payload,
    rest: buffer.subarray(dataOffset + length)
  }
}

/**
 * 把 HTTP server 升成 WebSocket，回调 JSON 对象报文。
 * @param {import('node:http').Server} httpServer HTTP 服务
 * @param {{
 *   onOpen: (ws: { send: Function, close: Function }) => void,
 *   onMessage: (ws: { send: Function, close: Function }, msg: object) => void,
 *   onClose: (ws: { send: Function, close: Function }) => void
 * }} handlers 连接回调
 * @returns {void}
 */
function attachWebSocketServer(httpServer, handlers) {
  httpServer.on('upgrade', (req, socket, head) => {
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.destroy()
      return
    }
    const key = req.headers['sec-websocket-key']
    if (!key) {
      socket.destroy()
      return
    }
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey(key)}`,
        '',
        ''
      ].join('\r\n')
    )
    let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0)
    const ws = {
      send(obj) {
        socket.write(encodeText(JSON.stringify(obj)))
      },
      close() {
        try {
          socket.end()
        } catch {
          // ignore
        }
      }
    }
    handlers.onOpen(ws)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (true) {
        const parsed = decodeFrame(buffer)
        if (!parsed) break
        buffer = parsed.rest
        if (parsed.opcode === 8) {
          handlers.onClose(ws)
          socket.end()
          return
        }
        if (parsed.opcode === 9) {
          socket.write(encodePong(parsed.payload))
          continue
        }
        if (parsed.opcode !== 1) continue
        try {
          const msg = JSON.parse(parsed.payload.toString('utf8'))
          if (msg && typeof msg === 'object') handlers.onMessage(ws, msg)
        } catch {
          // 非 JSON 忽略
        }
      }
    })
    socket.on('close', () => handlers.onClose(ws))
    socket.on('error', () => handlers.onClose(ws))
  })
}

module.exports = { attachWebSocketServer }
