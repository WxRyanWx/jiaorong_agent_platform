import { describe, expect, it } from 'vitest'
import {
  createDevToolsChordTracker,
  type DevToolsChordInput
} from '../../../src/jiaorong_src/appHost/main/devtoolsChord'

function keyDown(
  key: string,
  mods: Partial<DevToolsChordInput> = {}
): DevToolsChordInput {
  return {
    type: 'keyDown',
    key,
    control: false,
    alt: false,
    shift: false,
    meta: false,
    ...mods
  }
}

describe('devtools hidden chord', () => {
  it('opens DevTools on Windows after Ctrl+I then S then N', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'win32',
      blockDefaultShortcuts: true
    })
    const ctrl = { control: true as const }
    expect(tracker.consume(keyDown('i', ctrl))).toEqual({
      preventDefault: false,
      openDevTools: false
    })
    expect(tracker.consume(keyDown('s', ctrl))).toEqual({
      preventDefault: true,
      openDevTools: false
    })
    expect(tracker.consume(keyDown('n', ctrl))).toEqual({
      preventDefault: true,
      openDevTools: true
    })
  })

  it('opens DevTools on macOS after Cmd+I then S then N', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'darwin',
      blockDefaultShortcuts: true
    })
    const cmd = { meta: true as const }
    tracker.consume(keyDown('I', cmd))
    tracker.consume(keyDown('S', cmd))
    expect(tracker.consume(keyDown('N', cmd))).toEqual({
      preventDefault: true,
      openDevTools: true
    })
  })

  it('does not treat Ctrl as the macOS trigger', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'darwin',
      blockDefaultShortcuts: true
    })
    tracker.consume(keyDown('i', { control: true }))
    tracker.consume(keyDown('s', { control: true }))
    expect(tracker.consume(keyDown('n', { control: true }))).toEqual({
      preventDefault: false,
      openDevTools: false
    })
  })

  it('resets when the modifier is released mid-sequence', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'linux',
      blockDefaultShortcuts: true
    })
    tracker.consume(keyDown('i', { control: true }))
    tracker.consume({
      type: 'keyUp',
      key: 'Control',
      control: false,
      alt: false,
      shift: false,
      meta: false
    })
    tracker.consume(keyDown('s', { control: true }))
    expect(tracker.consume(keyDown('n', { control: true }))).toEqual({
      preventDefault: false,
      openDevTools: false
    })
  })

  it('blocks packaged F12 without opening DevTools', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'win32',
      blockDefaultShortcuts: true
    })
    expect(tracker.consume(keyDown('F12'))).toEqual({
      preventDefault: true,
      openDevTools: false
    })
  })

  it('leaves F12 alone in development', () => {
    const tracker = createDevToolsChordTracker({
      platform: 'darwin',
      blockDefaultShortcuts: false
    })
    expect(tracker.consume(keyDown('F12'))).toEqual({
      preventDefault: false,
      openDevTools: false
    })
  })
})
