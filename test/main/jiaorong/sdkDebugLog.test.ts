import { describe, expect, it } from 'vitest'
import {
  logJiaorongSdkDebug,
  redactJiaorongSdkDebugValue
} from '../../../src/jiaorong_src/appHost/sdkDebugLog'

describe('redactJiaorongSdkDebugValue', () => {
  it('redacts token fields and keeps the method payload shape', () => {
    expect(
      redactJiaorongSdkDebugValue({
        appId: 'demo-workbench',
        token: 'secret-token',
        'Fusion-Auth': 'hdr'
      })
    ).toEqual({
      appId: 'demo-workbench',
      token: '[redacted]',
      'Fusion-Auth': '[redacted]'
    })
  })

  it('truncates long strings from stream blocks', () => {
    const long = 'a'.repeat(2500)
    expect(redactJiaorongSdkDebugValue(long)).toBe(`${'a'.repeat(2000)}…(+500)`)
  })

  it('keeps other fields when a getter throws', () => {
    const value: Record<string, unknown> = { appId: 'demo' }
    Object.defineProperty(value, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope')
      }
    })
    expect(redactJiaorongSdkDebugValue(value)).toEqual({
      appId: 'demo',
      boom: '[unreadable]'
    })
  })
})

describe('logJiaorongSdkDebug', () => {
  it('does not throw if console.log fails', () => {
    const original = console.log
    console.log = () => {
      throw new Error('console down')
    }
    try {
      expect(() => logJiaorongSdkDebug('invoke', 'session.send', { appId: 'x' })).not.toThrow()
    } finally {
      console.log = original
    }
  })
})
