import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RendererBridge } from '../../../src/jiaorong_src/appHost/main/bir'

class FakeWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.OPEN
  sent: unknown[] = []
  onopen: ((ev?: unknown) => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null

  constructor() {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }
}

describe('RendererBridge jiaorong.on', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    FakeWebSocket.instances = []
    ;(globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket
  })

  afterEach(() => {
    ;(globalThis as { WebSocket: unknown }).WebSocket = originalWebSocket
  })

  it('subscribes with a real function and forwards events to Node', async () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    const create = vi.fn(async (args: unknown) => ({ ok: true, args }))
    const jiaorong = {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler)
        return () => handlers.delete(event)
      }),
      agent: { create }
    }
    const bridge = new RendererBridge({ sa: { jiaorong }, port: 8787 })
    await bridge.start()
    const ws = FakeWebSocket.instances[0]
    expect(ws).toBeTruthy()

    await ws.onmessage?.({
      data: JSON.stringify({
        msgType: 'request',
        reqId: '1',
        method: 'jiaorong.on',
        payload: ['chat.stream.updated', null]
      })
    })

    expect(jiaorong.on).toHaveBeenCalledTimes(1)
    expect(jiaorong.on.mock.calls[0][0]).toBe('chat.stream.updated')
    expect(typeof jiaorong.on.mock.calls[0][1]).toBe('function')
    expect(ws.sent).toContainEqual({
      msgType: 'response',
      reqId: '1',
      data: { ok: true, event: 'chat.stream.updated' }
    })

    handlers.get('chat.stream.updated')?.({ sessionId: 's-1' })
    expect(ws.sent).toContainEqual({
      msgType: 'event',
      event: 'chat.stream.updated',
      payload: { sessionId: 's-1' }
    })

    await ws.onmessage?.({
      data: JSON.stringify({
        msgType: 'request',
        reqId: '2',
        method: 'jiaorong.on',
        payload: 'chat.stream.updated'
      })
    })
    expect(jiaorong.on).toHaveBeenCalledTimes(1)

    await ws.onmessage?.({
      data: JSON.stringify({
        msgType: 'request',
        reqId: '3',
        method: 'jiaorong.agent.create',
        payload: [{ key: 'workbench' }]
      })
    })
    expect(create).toHaveBeenCalledWith({ key: 'workbench' })

    await ws.onmessage?.({
      data: JSON.stringify({
        msgType: 'request',
        reqId: '4',
        method: 'jiaorong.off',
        payload: ['chat.stream.updated']
      })
    })
    expect(handlers.has('chat.stream.updated')).toBe(false)

    bridge.stop()
  })
})
