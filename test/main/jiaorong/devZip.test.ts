import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')

import {
  patchZipManifest,
  peekZipManifest
} from '../../../src/jiaorong_src/appHost/devCenter/main/devZip'

/** 本用例写出的临时 zip。 */
let zipPath = ''
/** patch 产出的临时 zip。 */
let patchedPath = ''

afterEach(() => {
  if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
  if (patchedPath && fs.existsSync(patchedPath)) fs.unlinkSync(patchedPath)
  zipPath = ''
  patchedPath = ''
})

/**
 * 写一个含 app.json 的 zip。
 * @param entries zip 条目
 */
function writeZip(entries: Record<string, string>): string {
  /** 条目二进制。 */
  const files: Record<string, Uint8Array> = {}
  for (const [key, value] of Object.entries(entries)) files[key] = strToU8(value)
  zipPath = path.join(os.tmpdir(), `jiaorong-devzip-${Date.now()}.zip`)
  fs.writeFileSync(zipPath, Buffer.from(zipSync(files)))
  return zipPath
}

describe('dev zip manifest peek and patch', () => {
  it('reads app.json from a zip into form fields', () => {
    writeZip({
      'app.json': JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu',
        extra: 'keep-me'
      }),
      'web-ui/index.html': '<html></html>'
    })
    /** 回填结果。 */
    const peeked = peekZipManifest(zipPath)
    expect(peeked.ok).toBe(true)
    expect(peeked.fields).toMatchObject({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      entry: 'web-ui/index.html',
      slot: 'menu'
    })
  })

  it('writes confirmed fields into a temp zip without changing the original', () => {
    writeZip({
      'app.json': JSON.stringify({
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'web-ui/index.html',
        slot: 'menu',
        extra: 'keep-me'
      })
    })
    /** 原包字节。 */
    const original = fs.readFileSync(zipPath)
    /** 写回结果。 */
    const patched = patchZipManifest(zipPath, {
      id: 'demo-2',
      name: 'Demo Two',
      version: '1.0.1',
      entry: 'web-ui/index.html',
      slot: 'menu',
      icon: 'icon.png',
      description: 'hello',
      spawn: ''
    })
    expect(patched.ok).toBe(true)
    patchedPath = patched.zipPath ?? ''
    expect(patchedPath).not.toBe(zipPath)
    expect(fs.readFileSync(zipPath).equals(original)).toBe(true)
    /** 临时包内 app.json。 */
    const entries = unzipSync(new Uint8Array(fs.readFileSync(patchedPath)))
    expect(JSON.parse(strFromU8(entries['app.json']))).toEqual({
      id: 'demo-2',
      name: 'Demo Two',
      version: '1.0.1',
      entry: 'web-ui/index.html',
      slot: 'menu',
      extra: 'keep-me',
      icon: 'icon.png',
      description: 'hello'
    })
  })

  it('rejects a zip that has no app.json', () => {
    writeZip({ 'readme.txt': 'no manifest' })
    expect(peekZipManifest(zipPath)).toEqual({
      ok: false,
      message: 'zip 包里没有 app.json'
    })
  })
})
