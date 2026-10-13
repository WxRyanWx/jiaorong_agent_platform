import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')

const debugLinkState = vi.hoisted(() => ({ appId: '', dir: '' }))

vi.mock('../../../src/jiaorong_src/appHost/main/appManagerInstance', () => ({
  sharedAppsManager: () => ({
    isExternalAppLink: (appId: string) => appId === debugLinkState.appId,
    getAppDir: (appId: string) => (appId === debugLinkState.appId ? debugLinkState.dir : null)
  })
}))

import {
  compareAppVersion,
  ensureJiaorongAppInstalled,
  findVisibleOpenableApp,
  isJiaorongSidebarMenuApp,
  pickRuntimeSlot
} from '../../../src/jiaorong_src/appHost/main/scan'
import type { JiaorongAppRuntime } from '../../../src/jiaorong_src/appHost/types'

describe('scan compareAppVersion', () => {
  it('only newer catalog version counts as update available', () => {
    // 已装比目录新：不算有更新（修复前版本不等即误报）
    expect(compareAppVersion('0.0.46-dev', '0.0.29-dev')).toBe(false)
    // 目录比已装新：有更新
    expect(compareAppVersion('0.0.29-dev', '0.0.46-dev')).toBe(true)
    // 同级无更新
    expect(compareAppVersion('1.0.0', '1.0.0')).toBe(false)
    // 正式版比同号预发布新
    expect(compareAppVersion('1.0.0-dev', '1.0.0')).toBe(true)
    expect(compareAppVersion('1.0.0', '1.0.0-dev')).toBe(false)
    // 没装过不算有更新
    expect(compareAppVersion(null, '1.0.0')).toBe(false)
    expect(compareAppVersion(undefined, '1.0.0')).toBe(false)
    // 非三段式版本不判为有更新，避免每次启动都去下 zip
    expect(compareAppVersion('1.0.0', '1.0')).toBe(false)
    expect(compareAppVersion('1.0', '1.0.1')).toBe(false)
  })
})

describe('ensureJiaorongAppInstalled', () => {
  let tempRoot = ''

  afterEach(async () => {
    debugLinkState.appId = ''
    debugLinkState.dir = ''
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
  })

  it('keeps an active debug link ahead of the builtin production directory', async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jiaorong-scan-'))
    const debugDir = path.join(tempRoot, 'debug')
    await mkdir(path.join(debugDir, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(debugDir, 'app.json'),
      JSON.stringify({
        id: 'collaboration-platform',
        name: '协同平台调试版',
        version: '0.0.1',
        entry: 'web-ui/debug.html'
      }),
      'utf8'
    )
    debugLinkState.appId = 'collaboration-platform'
    debugLinkState.dir = debugDir

    const runtime = {
      id: 'collaboration-platform',
      name: '协同平台',
      version: '1.0.0',
      slot: 'menu',
      source: 'builtin',
      enabled: true,
      package: { kind: 'zip', downloadUrl: 'https://example.com/app.zip' },
      visible: true,
      installStatus: 'installed',
      installedVersion: '1.0.0',
      appDir: null,
      entry: null
    } satisfies JiaorongAppRuntime

    const ensured = ensureJiaorongAppInstalled(runtime)
    expect(ensured.appDir).toBe(debugDir)
    expect(ensured.entry).toBe('web-ui/debug.html')
    expect(ensured.installedVersion).toBe('0.0.1')
  })
})

describe('sidebar menu placement', () => {
  it('keeps the system app and menu store apps, hides app-center store apps', () => {
    expect(
      isJiaorongSidebarMenuApp({
        id: 'collaboration-platform',
        source: 'builtin',
        slot: 'menu'
      })
    ).toBe(true)
    expect(
      isJiaorongSidebarMenuApp({
        id: 'collaboration-platform',
        source: 'builtin',
        slot: 'app-center'
      })
    ).toBe(false)
    expect(isJiaorongSidebarMenuApp({ id: 'demo-app', source: 'store', slot: 'menu' })).toBe(true)
    expect(isJiaorongSidebarMenuApp({ id: 'demo-app', source: 'store', slot: 'app-center' })).toBe(
      false
    )
    expect(isJiaorongSidebarMenuApp({ id: 'local-app', source: 'local-debug', slot: 'menu' })).toBe(
      true
    )
    expect(
      isJiaorongSidebarMenuApp({ id: 'local-app', source: 'local-debug', slot: 'app-center' })
    ).toBe(false)
  })

  it('does not open zip apps that are missing or still installing', () => {
    const missing = {
      id: 'collaboration-platform',
      name: '协同平台',
      version: '1.0.0',
      slot: 'menu',
      source: 'builtin',
      enabled: true,
      package: { kind: 'zip', downloadUrl: 'https://example.com/a.zip' },
      visible: true,
      installStatus: 'not_installed',
      installedVersion: null,
      appDir: null,
      entry: null
    } satisfies JiaorongAppRuntime
    expect(findVisibleOpenableApp([missing], 'collaboration-platform')).toBeNull()
    expect(
      findVisibleOpenableApp(
        [{ ...missing, installStatus: 'installing' }],
        'collaboration-platform'
      )
    ).toBeNull()
    expect(
      findVisibleOpenableApp(
        [
          {
            ...missing,
            installStatus: 'installing',
            installedVersion: '1.0.0',
            appDir: '/tmp/collab',
            entry: 'web-ui/index.html'
          }
        ],
        'collaboration-platform'
      )?.id
    ).toBe('collaboration-platform')
    expect(
      findVisibleOpenableApp(
        [
          {
            ...missing,
            installStatus: 'installed',
            installedVersion: '1.0.0',
            appDir: '/tmp/collab',
            entry: 'web-ui/index.html'
          }
        ],
        'collaboration-platform'
      )?.id
    ).toBe('collaboration-platform')
  })

  it('prefers installed app.json slot over catalog slot', () => {
    expect(pickRuntimeSlot('menu', 'app-center')).toBe('app-center')
    expect(pickRuntimeSlot('app-center', 'menu')).toBe('menu')
    expect(pickRuntimeSlot('menu', undefined)).toBe('menu')
    expect(pickRuntimeSlot('app-center', null)).toBe('app-center')
  })
})
