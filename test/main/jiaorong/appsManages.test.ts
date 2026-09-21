import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')

import appsManages from '../../../src/jiaorong_src/appHost/main/appsManages'

describe('appsManages', () => {
  let root = ''

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function makeRoot() {
    root = await mkdtemp(path.join(os.tmpdir(), 'jiaorong-apps-manages-'))
    return root
  }

  it('installs from path and starts spawn once', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'src-app')
    await mkdir(source, { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: 'hello-app',
        name: 'Hello',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu',
        spawn: 'node -e "setTimeout(()=>{}, 30000)"'
      }),
      'utf8'
    )
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(path.join(source, 'web-ui', 'index.html'), '<html></html>', 'utf8')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    const installed = manager.installAppFromPath(source, { mode: 'copy', overwrite: true })
    expect(installed.success, installed.message).toBe(true)

    const started = manager.startApp('hello-app')
    expect(started.success).toBe(true)
    expect(started.data?.pid).toBeGreaterThan(0)
    expect(manager.isRunning('hello-app')).toBe(true)

    const reused = manager.startApp('hello-app')
    expect(reused.success).toBe(true)
    expect(reused.data?.pid).toBe(started.data?.pid)

    const skipped = manager.startApp('missing')
    expect(skipped.success).toBe(false)

    manager.stopApp('hello-app')
    expect(manager.isRunning('hello-app')).toBe(false)
  })

  it('does not register hidden extract directories as apps', async () => {
    const appsRoot = await makeRoot()
    const installRoot = path.join(appsRoot, 'apps')
    const hidden = path.join(installRoot, '.temp_extract_1')
    await mkdir(path.join(hidden, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(hidden, 'app.json'),
      JSON.stringify({
        id: 'ghost-extract',
        name: 'Ghost',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      }),
      'utf8'
    )
    const manager = new appsManages(installRoot)
    expect(manager.getApp('ghost-extract')).toBeNull()
  })

  it('stops spawn after refresh drops an in-memory registration', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'src-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: 'ref-app',
        name: 'Ref',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu',
        spawn: 'node -e "setTimeout(()=>{}, 30000)"'
      }),
      'utf8'
    )
    await writeFile(path.join(source, 'web-ui', 'index.html'), '<html></html>', 'utf8')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'reference' }).success).toBe(true)
    const started = manager.startApp('ref-app', { cwd: source })
    expect(started.success, started.message).toBe(true)
    expect(manager.isRunning('ref-app')).toBe(true)

    manager.refresh()
    expect(manager.getApp('ref-app')).toBeNull()
    expect(manager.isRunning('ref-app')).toBe(true)

    const stopped = manager.stopApp('ref-app')
    expect(stopped.success, stopped.message).toBe(true)
    expect(manager.isRunning('ref-app')).toBe(false)
  })

  it('does not register collaboration-platform from the user apps root', async () => {
    const appsRoot = await makeRoot()
    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.getAppDir('collaboration-platform')).toBeNull()
  })

  it('starts spawn by app.json id even when the folder name is different', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'src-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: 'app-scaffold123',
        name: '应用脚手架123',
        version: '0.0.1',
        entry: 'web-ui/index.html',
        slot: 'menu',
        spawn: 'node -e "setTimeout(()=>{}, 30000)"'
      }),
      'utf8'
    )
    await writeFile(path.join(source, 'web-ui', 'index.html'), '<html></html>', 'utf8')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    const folderName = 'any-install-folder'
    const installed = manager.installAppFromPath(source, {
      mode: 'copy',
      folderName,
      overwrite: true
    })
    expect(installed.success, installed.message).toBe(true)
    expect(manager.getApp(folderName)).toBeNull()
    expect(manager.getApp('app-scaffold123')?.id).toBe('app-scaffold123')

    const appDir = path.join(appsRoot, 'apps', folderName)
    const started = manager.startApp('app-scaffold123', { cwd: appDir })
    expect(started.success, started.message).toBe(true)
    expect(started.data?.cwd).toBe(appDir)
    expect(started.data?.pid).toBeGreaterThan(0)
    expect(manager.isRunning('app-scaffold123')).toBe(true)

    manager.stopApp('app-scaffold123')
    expect(manager.isRunning('app-scaffold123')).toBe(false)

    const uninstalled = manager.uninstallApp('app-scaffold123')
    expect(uninstalled.success, uninstalled.message).toBe(true)
    expect(existsSync(appDir)).toBe(false)
    expect(manager.getApp('app-scaffold123')).toBeNull()
  })

  it('skips start when spawn is absent', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'plain')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: 'plain-app',
        name: 'Plain',
        version: '1.0.0',
        entry: 'web-ui/plain.html',
        slot: 'menu'
      }),
      'utf8'
    )
    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'copy', overwrite: true }).success).toBe(true)
    const started = manager.startApp('plain-app')
    expect(started.success).toBe(true)
    expect(started.data?.pid).toBe(0)
    expect(manager.isRunning('plain-app')).toBe(false)
  })
})
