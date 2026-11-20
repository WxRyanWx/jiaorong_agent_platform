import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'

vi.unmock('fs')
vi.unmock('node:fs')

import {
  clientSupportsPlatformList,
  currentClientPlatform,
  normalizePlatformToken,
  parsePlatformField,
  resolveSupportedOnClient
} from '../../../src/jiaorong_src/appHost/platforms'
import {
  readPlatformDeclaration,
  zipReaderFromBytes
} from '../../../src/jiaorong_src/appHost/zipPlatforms'
import {
  readPlatformSupportCache,
  rememberPlatformSupport
} from '../../../src/jiaorong_src/appHost/main/platformSupportCache'

describe('app platforms', () => {
  it('accepts the six clients and the windows x64 spelling', () => {
    expect(normalizePlatformToken('windows x64')).toBe('windows-x64')
    expect(normalizePlatformToken('Windows_X64')).toBe('windows-x64')
    expect(normalizePlatformToken('win-arm64')).toBe('windows-arm64')
    expect(normalizePlatformToken('macos-arm64')).toBe('mac-arm64')
    expect(normalizePlatformToken('darwin-x64')).toBe('mac-x64')
    expect(normalizePlatformToken('linux-amd64')).toBe('linux-x64')
    expect(normalizePlatformToken('osx-arm64')).toBe('mac-arm64')
    expect(normalizePlatformToken('windows')).toBeNull()
    expect(normalizePlatformToken('android-arm64')).toBeNull()
    expect(currentClientPlatform('win32', 'x64')).toBe('windows-x64')
    expect(currentClientPlatform('darwin', 'arm64')).toBe('mac-arm64')
    expect(currentClientPlatform('linux', 'ia32')).toBeNull()
  })

  it('allows every client when the field is absent and only the listed ones when set', () => {
    expect(clientSupportsPlatformList(undefined, 'mac-arm64')).toBe(true)
    expect(clientSupportsPlatformList(undefined, null)).toBe(true)
    expect(clientSupportsPlatformList(['windows x64'], 'windows-x64')).toBe(true)
    expect(clientSupportsPlatformList(['windows x64'], 'mac-arm64')).toBe(false)
    expect(clientSupportsPlatformList(['windows x64'], null)).toBe(false)
    expect(parsePlatformField([])).toEqual([])
    expect(clientSupportsPlatformList([], 'windows-x64')).toBe(false)
    expect(clientSupportsPlatformList(['nope'], 'linux-x64')).toBe(false)
    expect(parsePlatformField('windows-x64')).toEqual([])
  })

  it('hides the card when any known declaration excludes this client', () => {
    expect(
      resolveSupportedOnClient({
        manifestKnown: false,
        catalogKnown: false,
        cachedKnown: false,
        client: 'mac-arm64'
      })
    ).toBe(true)
    expect(
      resolveSupportedOnClient({
        manifestKnown: true,
        manifestPlatforms: ['windows-x64'],
        catalogKnown: false,
        cachedKnown: false,
        client: 'mac-arm64'
      })
    ).toBe(false)
    expect(
      resolveSupportedOnClient({
        manifestKnown: true,
        catalogKnown: true,
        catalogPlatforms: ['mac-arm64'],
        cachedKnown: true,
        cachedPlatforms: null,
        client: 'mac-arm64'
      })
    ).toBe(true)
    expect(
      resolveSupportedOnClient({
        manifestKnown: true,
        catalogKnown: false,
        cachedKnown: true,
        cachedPlatforms: ['windows-x64'],
        client: 'mac-arm64'
      })
    ).toBe(false)
  })
})

describe('zip app.json platforms', () => {
  function zip(entries: Record<string, string>): Uint8Array {
    const files: Record<string, Uint8Array> = {}
    for (const [name, text] of Object.entries(entries)) files[name] = strToU8(text)
    return zipSync(files)
  }

  it('reads platforms from the zip tail without treating a missing field as a restriction', async () => {
    const declared = await readPlatformDeclaration(
      zipReaderFromBytes(
        zip({
          'app.json': JSON.stringify({
            id: 'demo',
            platforms: ['Windows x64', 'windows-x64', 'mac arm64']
          }),
          'web-ui/index.html': 'ok'
        })
      )
    )
    expect(declared).toEqual({ known: true, platforms: ['windows-x64', 'mac-arm64'] })

    const open = await readPlatformDeclaration(
      zipReaderFromBytes(zip({ 'pkg/app.json': JSON.stringify({ id: 'demo' }) }))
    )
    expect(open).toEqual({ known: true })

    const empty = await readPlatformDeclaration(
      zipReaderFromBytes(zip({ 'app.json': JSON.stringify({ platforms: [] }) }))
    )
    expect(empty).toEqual({ known: true, platforms: [] })

    const missing = await readPlatformDeclaration(
      zipReaderFromBytes(zip({ 'readme.txt': 'no manifest' }))
    )
    expect(missing).toEqual({ known: false })
  })
})

describe('platform support cache', () => {
  const homes: string[] = []

  afterEach(() => {
    for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
    homes.length = 0
  })

  it('remembers a package declaration and ignores a broken file', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jiaorong-platforms-'))
    homes.push(home)
    const sha = 'a'.repeat(64)
    rememberPlatformSupport(sha, { platforms: ['windows-x64'] }, home)
    expect(readPlatformSupportCache(home).get(sha)?.platforms).toEqual(['windows-x64'])
    rememberPlatformSupport('not-a-sha', { platforms: null }, home)
    expect(readPlatformSupportCache(home).has('not-a-sha')).toBe(false)

    const file = path.join(home, '.jiaorongchat', 'app-platform-support.json')
    fs.writeFileSync(file, '{', 'utf8')
    expect(readPlatformSupportCache(home).size).toBe(0)
  })
})
