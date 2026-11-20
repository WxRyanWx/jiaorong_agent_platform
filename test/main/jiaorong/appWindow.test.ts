import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow, session, webContents } from 'electron'
import { isJiaorongBridgeFailure } from '../../../src/jiaorong_src/appHost/bridgeErrors'
import {
  openAppWindow,
  openInstalledAppWindow,
  resolveAppWindowUrl
} from '../../../src/jiaorong_src/appHost/main/appWindow'
import { getBoundGuestAppId } from '../../../src/jiaorong_src/appHost/main/guest'

type FakeWindow = {
  id: number
  options: unknown
  loadURL: ReturnType<typeof vi.fn>
  webContents: { id: number }
}

describe('resolveAppWindowUrl', () => {
  it('keeps an absolute http(s) url', () => {
    expect(resolveAppWindowUrl('demo', 'https://example.com/path', '')).toEqual({
      url: 'https://example.com/path'
    })
    expect(resolveAppWindowUrl('demo', 'http://127.0.0.1:61937/calc', '')).toEqual({
      url: 'http://127.0.0.1:61937/calc'
    })
  })

  it('resolves a relative url against the caller page', () => {
    expect(resolveAppWindowUrl('demo', '/report', 'http://127.0.0.1:61937/index.html')).toEqual({
      url: 'http://127.0.0.1:61937/report'
    })
    expect(
      resolveAppWindowUrl('demo', 'detail.html', 'jiaorong-app://demo/web-ui/index.html')
    ).toEqual({ url: 'jiaorong-app://demo/web-ui/detail.html' })
  })

  it('treats a relative url as an in-package page when the caller is not a page', () => {
    expect(resolveAppWindowUrl('demo', 'web-ui/detail.html', '')).toEqual({
      url: 'jiaorong-app://demo/web-ui/detail.html'
    })
  })

  it('rejects other apps, file urls, and empty input', () => {
    expect(resolveAppWindowUrl('demo', 'jiaorong-app://other/index.html', '')).toMatchObject({
      code: 'FORBIDDEN'
    })
    expect(resolveAppWindowUrl('demo', 'file:///tmp/secret.html', '')).toMatchObject({
      code: 'VALIDATION_ERROR'
    })
    expect(resolveAppWindowUrl('demo', 'javascript:alert(1)', '')).toMatchObject({
      code: 'VALIDATION_ERROR'
    })
    expect(resolveAppWindowUrl('demo', '   ', '')).toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('openAppWindow', () => {
  const created: FakeWindow[] = []

  beforeEach(() => {
    created.length = 0
    vi.spyOn(webContents, 'fromId').mockReturnValue(null)
    ;(session as unknown as { fromPartition: () => unknown }).fromPartition = () => ({
      protocol: { handle: () => {} }
    })
    vi.mocked(BrowserWindow).mockImplementation((options?: unknown) => {
      const win: FakeWindow = {
        id: created.length + 1,
        options,
        loadURL: vi.fn(async () => {}),
        webContents: { id: 100 + created.length }
      }
      created.push(win)
      return {
        ...win,
        on: vi.fn(),
        once: vi.fn(),
        show: vi.fn(),
        focus: vi.fn(),
        isMinimized: () => false,
        restore: vi.fn(),
        isDestroyed: () => false,
        webContents: {
          ...win.webContents,
          on: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          isDestroyed: () => false
        }
      } as unknown as BrowserWindow
    })
  })

  it('opens an http page in a jiaorong preload window bound to the app', async () => {
    const opened = await openAppWindow({
      appId: 'roadbed',
      appName: '路基',
      rawUrl: 'http://127.0.0.1:61937/',
      callerUrl: '',
      width: 800,
      height: 20,
      title: '计算'
    })
    expect(opened).toMatchObject({ url: 'http://127.0.0.1:61937/' })
    expect(isJiaorongBridgeFailure(opened)).toBe(false)
    const win = created.at(-1)
    expect(win?.options).toMatchObject({
      width: 800,
      height: 360,
      title: '计算',
      webPreferences: expect.objectContaining({
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:jiaorong-app-roadbed',
        preload: expect.stringContaining('jiaorongApp.mjs')
      })
    })
    expect(getBoundGuestAppId(win?.webContents.id ?? 0)).toBe('roadbed')
  })

  it('stops after eight windows for the same app', async () => {
    const input = {
      appId: 'many-windows',
      appName: '多窗',
      rawUrl: 'https://example.com',
      callerUrl: '',
      width: undefined,
      height: undefined,
      title: undefined
    }
    for (let index = 0; index < 8; index += 1) {
      const opened = await openAppWindow(input)
      expect(isJiaorongBridgeFailure(opened)).toBe(false)
    }
    const blocked = await openAppWindow(input)
    expect(blocked).toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('focuses the existing entry window instead of opening another', async () => {
    const input = {
      appId: 'focus-app',
      appName: '焦点',
      rawUrl: 'jiaorong-app://focus-app/web-ui/index.html',
      callerUrl: '',
      width: undefined,
      height: undefined,
      title: undefined
    }
    const first = await openInstalledAppWindow(input)
    const second = await openInstalledAppWindow(input)
    expect(first).toMatchObject({ id: 1, url: 'jiaorong-app://focus-app/web-ui/index.html' })
    expect(second).toEqual(first)
    expect(created).toHaveLength(1)
  })
})
