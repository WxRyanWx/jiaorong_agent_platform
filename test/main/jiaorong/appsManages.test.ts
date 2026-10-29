import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')

import appsManages, {
  buildSpawnPath,
  resolveBundledNodeBin,
  resolveBundledUvBin
} from '../../../src/jiaorong_src/appHost/main/appsManages'

describe('appsManages', () => {
  it('puts bundled node and uv bins first so spawn can stay app-relative', () => {
    const nodeBin = resolveBundledNodeBin()
    const uvBin = resolveBundledUvBin()
    expect(nodeBin).toBeTruthy()
    const current = ['/usr/bin', '/bin'].join(path.delimiter)
    const next = buildSpawnPath(current).split(path.delimiter)
    expect(next[0]).toBe(nodeBin)
    if (uvBin) expect(next).toContain(uvBin)
  })

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

    const started = await manager.startApp('hello-app')
    expect(started.success).toBe(true)
    expect(started.data?.pid).toBeGreaterThan(0)
    expect(manager.isRunning('hello-app')).toBe(true)

    const reused = await manager.startApp('hello-app')
    expect(reused.success).toBe(true)
    expect(reused.data?.pid).toBe(started.data?.pid)

    const skipped = await manager.startApp('missing')
    expect(skipped.success).toBe(false)

    manager.stopApp('hello-app')
    expect(manager.isRunning('hello-app')).toBe(false)
  })

  it('restarts spawn when the opened directory changes', async () => {
    const appsRoot = await makeRoot()
    /** 建一份带 spawn 的应用源目录。 */
    const makeSource = async (dirName: string) => {
      const source = path.join(appsRoot, dirName)
      await mkdir(path.join(source, 'web-ui'), { recursive: true })
      await writeFile(
        path.join(source, 'app.json'),
        JSON.stringify({
          id: 'cwd-app',
          name: 'Cwd',
          version: '1.0.0',
          entry: 'web-ui/index.html',
          slot: 'menu',
          spawn: 'node -e "setTimeout(()=>{}, 30000)"'
        }),
        'utf8'
      )
      await writeFile(path.join(source, 'web-ui', 'index.html'), '<html></html>', 'utf8')
      return source
    }
    const dirA = await makeSource('src-a')
    const dirB = await makeSource('src-b')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    const startedA = await manager.startApp('cwd-app', { cwd: dirA })
    expect(startedA.success, startedA.message).toBe(true)
    const pidA = startedA.data?.pid
    expect(pidA).toBeGreaterThan(0)

    // 同目录重复打开：复用在跑进程
    const reused = await manager.startApp('cwd-app', { cwd: dirA })
    expect(reused.success).toBe(true)
    expect(reused.data?.pid).toBe(pidA)

    // 换关联目录：旧进程服务的是旧代码，必须杀掉按新目录重拉
    const startedB = await manager.startApp('cwd-app', { cwd: dirB })
    expect(startedB.success, startedB.message).toBe(true)
    expect(startedB.data?.cwd).toBe(dirB)
    expect(startedB.data?.pid).not.toBe(pidA)

    manager.stopApp('cwd-app')
    expect(manager.isRunning('cwd-app')).toBe(false)
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
    const started = await manager.startApp('ref-app', { cwd: source })
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
    const started = await manager.startApp('app-scaffold123', { cwd: appDir })
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

  it('uses a debug link only while it exists and restores the installed directory after cleanup', async () => {
    const appsRoot = await makeRoot()
    const installRoot = path.join(appsRoot, 'apps')
    const sourceRoot = path.join(appsRoot, 'sources')
    const manifest = {
      id: 'same-app',
      name: 'Same App',
      version: '1.0.0',
      entry: 'web-ui/index.html',
      slot: 'menu',
      customField: 'keep-me'
    }

    for (const source of [path.join(sourceRoot, 'installed'), path.join(sourceRoot, 'debug')]) {
      await mkdir(path.join(source, 'web-ui'), { recursive: true })
      await writeFile(path.join(source, 'app.json'), JSON.stringify(manifest), 'utf8')
      await writeFile(path.join(source, 'web-ui', 'index.html'), source, 'utf8')
    }

    const manager = new appsManages(installRoot)
    expect(
      manager.installAppFromPath(path.join(sourceRoot, 'installed'), {
        mode: 'copy',
        folderName: 'installed',
        overwrite: true
      }).success
    ).toBe(true)
    expect(manager.getAppDir('same-app')).toBe(path.join(installRoot, 'installed'))

    expect(
      manager.installAppFromPath(path.join(sourceRoot, 'debug'), {
        mode: 'link',
        overwrite: true
      }).success
    ).toBe(true)
    expect(manager.getAppDir('same-app')).toBe(path.join(sourceRoot, 'debug'))

    const rescanned = new appsManages(installRoot)
    expect(rescanned.getAppDir('same-app')).toBe(path.join(sourceRoot, 'debug'))
    expect(rescanned.isExternalAppLink('same-app')).toBe(true)

    rescanned.removeExternalAppLinks()
    expect(rescanned.getAppDir('same-app')).toBe(path.join(installRoot, 'installed'))
    expect(rescanned.isExternalAppLink('same-app')).toBe(false)
    expect(
      JSON.parse(await readFile(path.join(sourceRoot, 'debug', 'app.json'), 'utf8')).customField
    ).toBe('keep-me')
  })

  it('disables an installed copy even when its source folder is kept', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'source-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: 'kept-app',
        name: 'Kept',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      }),
      'utf8'
    )

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'copy' }).success).toBe(true)
    const installedDir = manager.getAppDir('kept-app')
    expect(manager.uninstallApp('kept-app', true).success).toBe(true)
    expect(installedDir && existsSync(installedDir)).toBe(true)

    const rescanned = new appsManages(path.join(appsRoot, 'apps'))
    expect(rescanned.listApps({ enabled: true }).some((app) => app.id === 'kept-app')).toBe(false)
  })

  it('rejects link ids that could escape the apps root', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'escape-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    await writeFile(
      path.join(source, 'app.json'),
      JSON.stringify({
        id: '../escape',
        name: 'Escape',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu'
      }),
      'utf8'
    )

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    const linked = manager.installAppFromPath(source, { mode: 'link', overwrite: true })
    expect(linked.success).toBe(false)
    expect(existsSync(path.join(appsRoot, 'escape.app-link.json'))).toBe(false)
  })

  it('removes a debug link by registry id after the source manifest id changes', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'source-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    const writeManifest = (id: string) =>
      writeFile(
        path.join(source, 'app.json'),
        JSON.stringify({
          id,
          name: 'Same App',
          version: '1.0.0',
          entry: 'web-ui/index.html',
          slot: 'menu'
        }),
        'utf8'
      )
    await writeManifest('same-app')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'link', overwrite: true }).success).toBe(true)
    await writeManifest('changed-app')
    manager.refresh()
    expect(manager.getAppDir('changed-app')).toBeNull()

    expect(manager.removeExternalAppLink('same-app')).toBe(true)
    expect(existsSync(path.join(appsRoot, 'apps', 'same-app.app-link.json'))).toBe(false)
    expect(manager.getAppDir('changed-app')).toBeNull()
  })

  it('stops a process by working directory after the manifest id changes', async () => {
    const appsRoot = await makeRoot()
    const source = path.join(appsRoot, 'source-app')
    await mkdir(path.join(source, 'web-ui'), { recursive: true })
    const writeManifest = (id: string) =>
      writeFile(
        path.join(source, 'app.json'),
        JSON.stringify({
          id,
          name: 'Runtime App',
          version: '1.0.0',
          entry: 'web-ui/index.html',
          slot: 'menu',
          spawn: 'node -e "setTimeout(()=>{}, 30000)"'
        }),
        'utf8'
      )
    await writeManifest('runtime-app')

    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'link', overwrite: true }).success).toBe(true)
    const started = await manager.startApp('runtime-app', { cwd: source })
    expect(started.success, started.message).toBe(true)

    await writeManifest('changed-runtime-app')
    manager.refresh()
    manager.stopAppsInDir(source)
    expect(manager.isRunning('runtime-app')).toBe(false)
    expect(manager.isRunning('changed-runtime-app')).toBe(false)
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
    const started = await manager.startApp('plain-app')
    expect(started.success).toBe(true)
    expect(started.data?.pid).toBe(0)
    expect(manager.isRunning('plain-app')).toBe(false)
  })
})
