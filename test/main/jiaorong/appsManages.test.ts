import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

    const skipped = manager.startApp('missing')
    expect(skipped.success).toBe(false)

    manager.stopApp('hello-app')
    expect(manager.isRunning('hello-app')).toBe(false)
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
        entry: 'web-ui/index.html',
        slot: 'menu'
      }),
      'utf8'
    )
    const manager = new appsManages(path.join(appsRoot, 'apps'))
    expect(manager.installAppFromPath(source, { mode: 'copy' }).success).toBe(true)
    const started = manager.startApp('plain-app')
    expect(started.success).toBe(true)
    expect(started.data?.pid).toBe(0)
    expect(manager.isRunning('plain-app')).toBe(false)
  })
})
