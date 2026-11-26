import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.unmock('fs')
vi.unmock('node:fs')
vi.unmock('fs/promises')
vi.unmock('node:fs/promises')

import {
  computeFileSha512,
  isInstallerListed,
  tryInstallDownloadedUpdateOnStartup
} from '../../../src/main/upgrade/startupInstall'

describe('tryInstallDownloadedUpdateOnStartup', () => {
  let directory: string
  let markerPath: string
  let installerPath: string
  let launchInstaller: ReturnType<typeof vi.fn>
  let hashFile: ReturnType<typeof vi.fn>
  let notify: ReturnType<typeof vi.fn>
  let exitApp: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'deepchat-startup-install-'))
    markerPath = path.join(directory, 'auto_update_marker.json')
    installerPath = path.join(
      directory,
      'JiaorongAI-updater',
      'pending',
      'JiaorongAI-windows-x64.exe'
    )
    await mkdir(path.dirname(installerPath), { recursive: true })
    launchInstaller = vi.fn(async () => true)
    hashFile = vi.fn(async () => 'sha512-ok')
    notify = vi.fn()
    exitApp = vi.fn()
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  const writeMarker = async (input: {
    version?: string
    phase?: string
    attempts?: number
    downloadedAt?: number
    installerPath?: string
    sha512?: string
  }) => {
    const target = input.installerPath ?? installerPath
    await writeFile(
      markerPath,
      JSON.stringify({
        version: input.version ?? '1.1.0',
        phase: input.phase ?? 'downloaded',
        attempts: input.attempts ?? 0,
        installerPath: target,
        downloadedAt: input.downloadedAt ?? Date.now(),
        sha512: input.sha512 ?? ''
      })
    )
  }

  const run = (overrides: Record<string, unknown> = {}) =>
    tryInstallDownloadedUpdateOnStartup({
      platform: 'win32',
      currentVersion: '1.0.0',
      markerPath,
      cacheRoot: directory,
      resourcesPath: directory,
      now: Date.now(),
      isInstallerRunning: () => false,
      launchInstaller,
      hashFile,
      notify,
      exitApp,
      ...overrides
    })

  const readMarker = async () => JSON.parse(await readFile(markerPath, 'utf8'))

  it('matches the full installer name in CSV process output', () => {
    const csv = '"JiaorongAI-windows-x64.exe","1234","Console","1","12,345 K"\n'
    expect(isInstallerListed(csv, 'JiaorongAI-windows-x64.exe')).toBe(true)
    // 默认 TABLE 输出会截断 26 字符的名字；截断后的行不能算命中
    expect(
      isInstallerListed('JiaorongAI-windows-x64.ex  1234 Console', 'JiaorongAI-windows-x64.exe')
    ).toBe(false)
    expect(
      isInstallerListed(
        'INFO: No tasks are running which match the specified criteria.',
        'JiaorongAI-windows-x64.exe'
      )
    ).toBe(false)
  })

  it('computes the base64 sha512 used by electron-updater', async () => {
    const content = 'update-package'
    await writeFile(installerPath, content)
    const expected = createHash('sha512').update(content).digest('base64')
    await expect(computeFileSha512(installerPath)).resolves.toBe(expected)
  })

  it('installs the cached package on Windows when it is newer than the current version', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({})

    await expect(run()).resolves.toBe('installed')
    expect(launchInstaller).toHaveBeenCalledWith(installerPath, directory)
    expect(notify).toHaveBeenCalledWith('1.1.0')
    expect(exitApp).toHaveBeenCalled()

    expect(await readMarker()).toEqual(
      expect.objectContaining({ phase: 'installing', attempts: 1 })
    )
  })

  it('does nothing on non-Windows platforms', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({})

    await expect(run({ platform: 'darwin' })).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(true)
  })

  it('clears the marker and the cached package when the version is already installed', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ version: '1.0.0' })

    await expect(run()).resolves.toBe('none')
    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(installerPath)).toBe(false)
  })

  it('discards a marker from another release channel', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ version: '1.2.0-beta.1' })

    await expect(run()).resolves.toBe('none')
    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(installerPath)).toBe(false)
  })

  it('discards a cached package older than seven days', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ downloadedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 })

    await expect(run()).resolves.toBe('none')
    expect(existsSync(markerPath)).toBe(false)
    expect(launchInstaller).not.toHaveBeenCalled()
  })

  it('discards the marker when the cached installer is gone', async () => {
    await writeMarker({
      installerPath: path.join(directory, 'JiaorongAI-updater', 'pending', 'missing.exe')
    })

    await expect(run()).resolves.toBe('none')
    expect(existsSync(markerPath)).toBe(false)
    expect(launchInstaller).not.toHaveBeenCalled()
  })

  it('refuses an installer path outside the updater cache directory', async () => {
    const outside = path.join(os.tmpdir(), 'evil-installer.exe')
    await writeFile(outside, 'stub')
    await writeMarker({ installerPath: outside })

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
    // 路径不在缓存目录里：只清标记，不能删用户文件
    expect(existsSync(outside)).toBe(true)
    await rm(outside, { force: true })
  })

  it('uses the installer basename even when an old marker carries another installerFile', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ phase: 'installing', attempts: 1 })
    // 旧标记里可能还有 installerFile，不能拿它当进程名
    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    marker.installerFile = 'explorer.exe'
    await writeFile(markerPath, JSON.stringify(marker))

    const isRunning = vi.fn(() => true)
    await expect(run({ isInstallerRunning: isRunning })).resolves.toBe('skipped')
    expect(isRunning).toHaveBeenCalledWith('JiaorongAI-windows-x64.exe')
  })

  it('does not block startup when the marker points at an untrusted installer while installing', async () => {
    const outside = path.join(os.tmpdir(), 'evil-installer.exe')
    await writeFile(outside, 'stub')
    await writeMarker({ phase: 'installing', attempts: 1, installerPath: outside })

    const isRunning = vi.fn(() => true)
    await expect(run({ isInstallerRunning: isRunning })).resolves.toBe('none')
    expect(exitApp).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
    await rm(outside, { force: true })
  })

  it('refuses an installer outside the updater pending directory', async () => {
    const wrongDir = path.join(directory, 'JiaorongAI-other', 'JiaorongAI-windows-x64.exe')
    await mkdir(path.dirname(wrongDir), { recursive: true })
    await writeFile(wrongDir, 'stub')
    await writeMarker({ installerPath: wrongDir })

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
  })

  it('discards the cached package when the sha512 does not match', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ sha512: 'expected' })
    hashFile.mockResolvedValue('actual')

    await expect(run()).resolves.toBe('none')
    expect(hashFile).toHaveBeenCalledWith(installerPath)
    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(installerPath)).toBe(false)
    expect(launchInstaller).not.toHaveBeenCalled()
  })

  it('discards the cached package when the hash cannot be read', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ sha512: 'expected' })
    hashFile.mockRejectedValue(new Error('EACCES'))

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
  })

  it('keeps the attempt and starts normally when the installer cannot launch', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({})
    launchInstaller.mockResolvedValue(false)

    await expect(run()).resolves.toBe('none')
    expect(exitApp).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()

    const marker = await readMarker()
    expect(marker.phase).toBe('downloaded')
    // 不回落次数：权限/安全软件长期拦截时，3 次后才能收敛到手动下载态
    expect(marker.attempts).toBe(1)
  })

  it('stops after three attempts and leaves the marker for the manual download state', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ attempts: 3 })

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(true)
  })

  it('still cleans up an expired cache even after three failed attempts', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({
      attempts: 3,
      downloadedAt: Date.now() - 8 * 24 * 60 * 60 * 1000
    })

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(installerPath)).toBe(false)
  })

  it('refuses a pending path outside an *-updater directory', async () => {
    const otherAppPending = path.join(
      directory,
      'OtherApp',
      'pending',
      'JiaorongAI-windows-x64.exe'
    )
    await mkdir(path.dirname(otherAppPending), { recursive: true })
    await writeFile(otherAppPending, 'stub')
    await writeMarker({ installerPath: otherAppPending })

    await expect(run()).resolves.toBe('none')
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(otherAppPending)).toBe(true)
  })

  it('exits quietly while the installer is still running', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ phase: 'installing', attempts: 1 })

    await expect(run({ isInstallerRunning: () => true })).resolves.toBe('skipped')
    expect(exitApp).toHaveBeenCalled()
    expect(launchInstaller).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('retries a failed install when the installer is gone and attempts remain', async () => {
    await writeFile(installerPath, 'stub')
    await writeMarker({ phase: 'installing', attempts: 1 })

    await expect(run({ isInstallerRunning: () => false })).resolves.toBe('installed')
    expect(launchInstaller).toHaveBeenCalledWith(installerPath, directory)

    expect(await readMarker()).toEqual(
      expect.objectContaining({ phase: 'installing', attempts: 2 })
    )
  })
})
