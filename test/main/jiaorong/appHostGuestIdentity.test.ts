import { describe, expect, it } from 'vitest'
import {
  buildJiaorongAppEntryUrl,
  matchGuestInvokeAppId,
  readJiaorongAppHostname
} from '../../../src/jiaorong_src/appHost/main/guestAppId'
import {
  bindGuestAppId,
  forgetSessionOwner,
  getBoundGuestAppId,
  getSessionOwner,
  isGuestPathAllowed,
  rememberPickedDirectory,
  rememberSessionOwner,
  unbindGuest
} from '../../../src/jiaorong_src/appHost/main/guestBind'
import {
  filterOfficialDeepchatPayload,
  sendJiaorongAppBridgeEvent
} from '../../../src/jiaorong_src/appHost/main/events'
import { findPendingQuestion } from '../../../src/jiaorong_src/app-sdk/src/helpers'

describe('jiaorong app guest identity', () => {
  it('reads app id from jiaorong-app hostname and ignores query params', () => {
    expect(readJiaorongAppHostname('jiaorong-app://demo-workbench/web-ui/index.html')).toBe(
      'demo-workbench'
    )
    expect(readJiaorongAppHostname('file:///tmp/index.html?jiaorongAppId=other-app')).toBeNull()
    expect(readJiaorongAppHostname('https://evil.test/?jiaorongAppId=demo-workbench')).toBeNull()
  })

  it('builds protocol entry urls without file or query identity', () => {
    expect(buildJiaorongAppEntryUrl('demo-workbench', 'web-ui/index.html')).toBe(
      'jiaorong-app://demo-workbench/web-ui/index.html'
    )
  })

  it('locks the first bound app id for a webContents', () => {
    bindGuestAppId(42, 'demo-workbench')
    bindGuestAppId(42, 'other-app')
    expect(getBoundGuestAppId(42)).toBe('demo-workbench')
    unbindGuest(42)
    expect(getBoundGuestAppId(42)).toBeNull()
  })

  it('does not broadcast bridge events without a target app id', () => {
    expect(() =>
      sendJiaorongAppBridgeEvent('chat.stream.updated', { sessionId: 's1' })
    ).not.toThrow()
  })

  it('matches Windows guest paths case-insensitively after pick', () => {
    rememberPickedDirectory(7, 'C:\\tmp\\work')
    expect(isGuestPathAllowed(7, 'C:\\tmp\\work\\file.txt')).toBe(true)
    expect(isGuestPathAllowed(7, 'c:\\tmp\\work\\file.txt')).toBe(true)
    expect(isGuestPathAllowed(7, 'D:\\other\\file.txt')).toBe(false)
    unbindGuest(7)
  })

  it('rejects guest file paths that escape the picked directory with ..', () => {
    rememberPickedDirectory(8, '/tmp/work')
    expect(isGuestPathAllowed(8, '/tmp/work/file.txt')).toBe(true)
    expect(isGuestPathAllowed(8, '/tmp/work/../../../etc/passwd')).toBe(false)
    unbindGuest(8)
    rememberPickedDirectory(9, 'C:\\tmp\\work')
    expect(isGuestPathAllowed(9, 'C:\\tmp\\work\\..\\..\\Users\\me\\.ssh\\id_rsa')).toBe(false)
    unbindGuest(9)
  })

  it('rejects guest invoke without a senderFrame', () => {
    expect(
      matchGuestInvokeAppId({
        hasSenderFrame: false,
        isMainFrame: true,
        frameUrl: 'jiaorong-app://demo-workbench/web-ui/index.html',
        boundAppId: 'demo-workbench',
        senderUrl: 'jiaorong-app://demo-workbench/web-ui/index.html'
      })
    ).toBeNull()
  })

  it('requires tool_call.id for pending questions', () => {
    expect(
      findPendingQuestion([
        {
          type: 'action',
          action_type: 'question_request',
          extra: { needsUserAction: true },
          status: 'pending',
          timestamp: 1
        }
      ])
    ).toBeUndefined()
    expect(
      findPendingQuestion([
        {
          type: 'action',
          action_type: 'question_request',
          extra: { needsUserAction: true },
          status: 'pending',
          timestamp: 1,
          tool_call: { id: 'q-1' }
        }
      ])?.tool_call?.id
    ).toBe('q-1')
  })

  it('forgets session owners independently of guest webContents', () => {
    rememberSessionOwner('s-1', 'demo-workbench')
    expect(getSessionOwner('s-1')).toBe('demo-workbench')
    forgetSessionOwner('s-1')
    expect(getSessionOwner('s-1')).toBeNull()
  })

  it('keeps official deepchat events off the app session fan-out path', () => {
    rememberSessionOwner('app-s1', 'demo-workbench')
    expect(
      filterOfficialDeepchatPayload('chat.stream.updated', { sessionId: 'app-s1', blocks: [] })
    ).toBeNull()
    expect(
      filterOfficialDeepchatPayload('sessions.updated', {
        sessionIds: ['app-s1', 'official-s1'],
        reason: 'updated'
      })
    ).toEqual({ sessionIds: ['official-s1'], reason: 'updated' })
    expect(
      filterOfficialDeepchatPayload('chat.stream.updated', { sessionId: 'official-s1', blocks: [] })
    ).toEqual({ sessionId: 'official-s1', blocks: [] })
    forgetSessionOwner('app-s1')
  })
})
