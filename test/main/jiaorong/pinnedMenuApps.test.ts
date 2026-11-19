import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')
import {
  forgetPinnedMenuApp,
  listPinnedMenuAppIds,
  setPinnedMenuApp
} from '../../../src/jiaorong_src/appHost/main/pinnedMenuApps'
import { showsJiaorongSidebarApp } from '../../../src/jiaorong_src/appHost/main/scan'

describe('pinned menu apps', () => {
  const homes: string[] = []

  afterEach(() => {
    for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
    homes.length = 0
  })

  function makeHome(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-pin-'))
    homes.push(dir)
    return dir
  }

  it('keeps the pin when the installed app.json is replaced', () => {
    const home = makeHome()
    expect(setPinnedMenuApp('demo-app', true, home)).toEqual({ ok: true, pinned: true })
    const manifestPath = path.join(home, 'apps', 'demo-app', 'app.json')
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ id: 'demo-app', slot: 'app-center', version: '1.0.0' })
    )
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ id: 'demo-app', slot: 'app-center', version: '2.0.0' })
    )

    const ids = listPinnedMenuAppIds(home)
    expect(ids).toEqual(['demo-app'])
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).slot).toBe('app-center')
    expect(
      showsJiaorongSidebarApp({ id: 'demo-app', source: 'store', slot: 'app-center' }, new Set(ids))
    ).toBe(true)
  })

  it('drops the pin when the app is forgotten', () => {
    const home = makeHome()
    setPinnedMenuApp('demo-app', true, home)
    setPinnedMenuApp('other-app', true, home)
    forgetPinnedMenuApp('demo-app', home)

    expect(listPinnedMenuAppIds(home)).toEqual(['other-app'])
    expect(
      showsJiaorongSidebarApp(
        { id: 'demo-app', source: 'store', slot: 'app-center' },
        new Set(listPinnedMenuAppIds(home))
      )
    ).toBe(false)
  })

  it('ignores a broken file and an illegal id', () => {
    const home = makeHome()
    const filePath = path.join(home, '.jiaorongchat', 'pinned-menu-apps.json')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '{')

    expect(listPinnedMenuAppIds(home)).toEqual([])
    expect(setPinnedMenuApp('../demo', true, home)).toEqual({ ok: false, pinned: false })
    expect(fs.readFileSync(filePath, 'utf8')).toBe('{')
  })
})
