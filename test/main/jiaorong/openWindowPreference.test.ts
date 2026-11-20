import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')
import {
  forgetOpenWindowPreference,
  readOpenWindowPreferences,
  resolveOpensInWindow,
  setOpenWindowPreference
} from '../../../src/jiaorong_src/appHost/main/openWindowPreference'

describe('open window preference', () => {
  const homes: string[] = []

  afterEach(() => {
    for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
    homes.length = 0
  })

  function makeHome(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-open-window-'))
    homes.push(dir)
    return dir
  }

  it('uses app.json until the user chooses, then keeps the user choice', () => {
    const home = makeHome()
    const empty = readOpenWindowPreferences(home)
    expect(resolveOpensInWindow('demo-app', true, empty)).toBe(true)
    expect(resolveOpensInWindow('demo-app', false, empty)).toBe(false)

    expect(setOpenWindowPreference('demo-app', false, home)).toEqual({
      ok: true,
      openInWindow: false
    })
    const chosen = readOpenWindowPreferences(home)
    expect(resolveOpensInWindow('demo-app', true, chosen)).toBe(false)

    setOpenWindowPreference('demo-app', true, home)
    expect(resolveOpensInWindow('demo-app', false, readOpenWindowPreferences(home))).toBe(true)
  })

  it('drops one app without touching the others', () => {
    const home = makeHome()
    setOpenWindowPreference('demo-app', false, home)
    setOpenWindowPreference('other-app', true, home)
    forgetOpenWindowPreference('demo-app', home)

    const prefs = readOpenWindowPreferences(home)
    expect(prefs.has('demo-app')).toBe(false)
    expect(resolveOpensInWindow('demo-app', true, prefs)).toBe(true)
    expect(resolveOpensInWindow('other-app', false, prefs)).toBe(true)
  })

  it('ignores a broken file and an illegal id', () => {
    const home = makeHome()
    const filePath = path.join(home, '.jiaorongchat', 'open-window-apps.json')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '{')

    expect(readOpenWindowPreferences(home).size).toBe(0)
    expect(setOpenWindowPreference('../demo', true, home)).toEqual({
      ok: false,
      openInWindow: false
    })
    expect(fs.readFileSync(filePath, 'utf8')).toBe('{')
  })
})
