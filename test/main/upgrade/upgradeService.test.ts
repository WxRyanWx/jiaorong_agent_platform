import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  autoUpdaterState,
  publishEventMock,
  requestUpdateInstallMock,
  appQuitMock,
  appRelaunchMock,
  appExitMock,
  appOnMock,
  appGetPathMock,
  appGetVersionMock
} = vi.hoisted(() => {
  const autoUpdaterState = {
    listeners: new Map<string, (...args: unknown[]) => void>(),
    reset() {
      this.listeners.clear()
    }
  }
  return {
    autoUpdaterState,
    publishEventMock: vi.fn(),
    requestUpdateInstallMock: vi.fn(async (installAction: () => void) => installAction()),
    appQuitMock: vi.fn(),
    appRelaunchMock: vi.fn(),
    appExitMock: vi.fn(),
    appGetPathMock: vi.fn(() => ''),
    appGetVersionMock: vi.fn(() => '1.0.0'),
    appOnMock: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: appGetPathMock,
    getVersion: appGetVersionMock,
    isPackaged: true,
    quit: appQuitMock,
    relaunch: appRelaunchMock,
    exit: appExitMock,
    on: appOnMock
  },
  shell: {
    openExternal: vi.fn()
  },
  Notification: class {
    static isSupported() {
      return false
    }
    show() {}
  }
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      autoDownload: false,
      allowDowngrade: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: false,
      channel: 'latest',
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        autoUpdaterState.listeners.set(event, handler)
      }),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn()
    }
  }
}))

vi.unmock('fs')

import electronUpdater from 'electron-updater'
import { shell } from 'electron'
import { resolveAppDownloadArtifact } from '../../../src/shared/upgrade/downloadLinks'
import { UpgradeService } from '../../../src/main/upgrade'

describe('UpgradeService', () => {
  let userDataDirectory: string

  beforeEach(async () => {
    vi.useFakeTimers()
    autoUpdaterState.reset()
    publishEventMock.mockReset()
    requestUpdateInstallMock.mockReset()
    requestUpdateInstallMock.mockImplementation(async (installAction: () => void) =>
      installAction()
    )
    appQuitMock.mockReset()
    appRelaunchMock.mockReset()
    appExitMock.mockReset()
    appOnMock.mockReset()
    appGetPathMock.mockReset()
    userDataDirectory = await mkdtemp(path.join(os.tmpdir(), 'deepchat-upgrade-service-'))
    process.env.JIAORONG_UPDATE_CACHE_ROOT = userDataDirectory
    appGetPathMock.mockReturnValue(userDataDirectory)
    appGetVersionMock.mockReset()
    appGetVersionMock.mockReturnValue('1.0.0')
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockReset()
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockReset()
  })

  afterEach(async () => {
    delete process.env.JIAORONG_UPDATE_CACHE_ROOT
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
    await rm(userDataDirectory, { recursive: true, force: true })
  })

  it('asks App to stop before quitAndInstall during update restart', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    ;(service as any)._status = 'downloaded'

    expect(service.restartToUpdate()).toBe(true)
    expect(requestUpdateInstallMock).toHaveBeenCalledTimes(1)
    expect(publishEventMock).toHaveBeenCalledWith(
      'upgrade.willRestart',
      expect.objectContaining({ version: expect.any(Number) })
    )

    await Promise.resolve()

    expect(electronUpdater.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(appQuitMock).not.toHaveBeenCalled()
  })

  it('relaunches the app for mock downloaded updates without calling quitAndInstall', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )

    expect(service.mockDownloadedUpdate()).toBe(true)
    expect(service.restartToUpdate()).toBe(true)

    expect(requestUpdateInstallMock).toHaveBeenCalledTimes(1)
    await Promise.resolve()

    expect(appRelaunchMock).toHaveBeenCalledTimes(1)
    expect(appExitMock).toHaveBeenCalledTimes(1)
    expect(electronUpdater.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('skips app-focus auto check when privacy mode is enabled', () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    const service = new UpgradeService(
      settings,
      () => true,
      requestUpdateInstallMock,
      publishEventMock
    )
    const checkSpy = vi.spyOn(service, 'checkUpdate').mockResolvedValue(undefined)

    service.handleAppFocus()

    expect(checkSpy).not.toHaveBeenCalled()
    expect(electronUpdater.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('keeps manual update checks available while privacy mode is enabled', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockResolvedValue(undefined as never)

    const service = new UpgradeService(
      settings,
      () => true,
      requestUpdateInstallMock,
      publishEventMock
    )

    await service.checkUpdate()

    expect(electronUpdater.autoUpdater.channel).toBe('jrsi')
    expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('reports update-check failures without exposing the source error', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn(() => {
      throw new Error('diagnostic sink failed')
    })
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockRejectedValue(
      new Error('SECRET_UPDATE_RESPONSE')
    )
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    await expect(service.checkUpdate()).resolves.toBeUndefined()

    expect(service.getUpdateStatus()).toMatchObject({
      status: 'error',
      error: 'SECRET_UPDATE_RESPONSE'
    })
    expect(publishEventMock).toHaveBeenCalledWith(
      'upgrade.status.changed',
      expect.objectContaining({ status: 'error', error: 'SECRET_UPDATE_RESPONSE' })
    )
    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'check',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_UPDATE_RESPONSE')
  })

  it('reports one diagnostic episode for concurrent and repeated automatic check failures', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockRejectedValue(
      new Error('automatic check failed')
    )
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    await Promise.all([service.checkUpdate('autoCheck'), service.checkUpdate('autoCheck')])
    await service.checkUpdate('autoCheck')

    expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3)
    expect(observeFailure).toHaveBeenCalledOnce()
    expect(service.getUpdateStatus().status).toBe('error')
  })

  it('deduplicates one check failure reported by updater event and promise rejection', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    const errorHandler = autoUpdaterState.listeners.get('error')
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockImplementation(async () => {
      errorHandler!(new Error('SECRET_EVENT_UPDATE_ERROR'))
      throw new Error('SECRET_REJECTED_UPDATE_ERROR')
    })

    await service.checkUpdate('autoCheck')

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'check',
      errorCategory: 'provider'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_')
  })

  it('reports a native updater error outside an active operation as a runtime failure', () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    autoUpdaterState.listeners.get('error')!(new Error('SECRET_NATIVE_RUNTIME_ERROR'))

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'runtime',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_NATIVE_RUNTIME_ERROR')
  })

  it('does not guess one operation for a native error during overlapping phases', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    let resolveCheck!: () => void
    let resolveDownload!: () => void
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockImplementation(
      () => new Promise((resolve) => (resolveCheck = () => resolve(undefined as never)))
    )
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockImplementation(
      () => new Promise((resolve) => (resolveDownload = () => resolve([])))
    )
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    const checking = service.checkUpdate()
    autoUpdaterState.listeners.get('update-available')!({
      version: '1.1.0',
      releaseDate: '2026-08-01',
      releaseNotes: ''
    })
    expect(service.startDownloadUpdate()).toBe(true)
    autoUpdaterState.listeners.get('error')!(new Error('SECRET_AMBIGUOUS_UPDATE_ERROR'))

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'runtime',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_AMBIGUOUS_UPDATE_ERROR')

    resolveCheck()
    resolveDownload()
    await checking
    await Promise.resolve()
  })

  it('starts a new automatic check failure episode after a successful check', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates)
      .mockRejectedValueOnce(new Error('first outage'))
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('second outage'))
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    await service.checkUpdate('autoCheck')
    await service.checkUpdate('autoCheck')
    await service.checkUpdate('autoCheck')

    expect(observeFailure).toHaveBeenCalledTimes(2)
  })

  it('reports asynchronous update-download failures without exposing the source error', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockRejectedValue(
      new Error('SECRET_DOWNLOAD_RESPONSE')
    )
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    const available = autoUpdaterState.listeners.get('update-available')
    available!({ version: '1.1.0', releaseDate: '2026-08-01', releaseNotes: '' })

    expect(service.startDownloadUpdate()).toBe(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'download',
      errorCategory: 'provider'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_DOWNLOAD_RESPONSE')
  })

  it('deduplicates one download failure reported by updater event and promise rejection', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    const errorHandler = autoUpdaterState.listeners.get('error')
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockImplementation(async () => {
      autoUpdaterState.listeners.get('update-downloaded')!({
        version: '1.1.0',
        releaseDate: '2026-08-01',
        releaseNotes: ''
      })
      errorHandler!(new Error('SECRET_EVENT_DOWNLOAD_ERROR'))
      throw new Error('SECRET_REJECTED_DOWNLOAD_ERROR')
    })
    autoUpdaterState.listeners.get('update-available')!({
      version: '1.1.0',
      releaseDate: '2026-08-01',
      releaseNotes: ''
    })

    expect(service.startDownloadUpdate()).toBe(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'download',
      errorCategory: 'provider'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_')
  })

  it('reports install handoff failures and restores the updating flag', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    requestUpdateInstallMock.mockRejectedValue(new Error('SECRET_INSTALL_ERROR'))
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    ;(service as any)._status = 'downloaded'

    expect(service.restartToUpdate()).toBe(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(service.isUpdatingInProgress()).toBe(false)
    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'install',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_INSTALL_ERROR')
  })

  it('reports an event-only native updater failure during install', async () => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    ;(service as any)._status = 'downloaded'

    expect(service.restartToUpdate()).toBe(true)
    await Promise.resolve()
    autoUpdaterState.listeners.get('error')!(new Error('SECRET_NATIVE_INSTALL_ERROR'))

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'install',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_NATIVE_INSTALL_ERROR')
  })

  it.each([
    ['relaunch', appRelaunchMock],
    ['exit', appExitMock]
  ])('contains delayed app %s failures during a normal restart', async (_phase, fail) => {
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    fail.mockImplementationOnce(() => {
      throw new Error('SECRET_DELAYED_RESTART_ERROR')
    })
    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    service.restartApp()
    await vi.advanceTimersByTimeAsync(1000)

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'runtime',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_DELAYED_RESTART_ERROR')
    expect(publishEventMock).toHaveBeenCalledWith(
      'upgrade.error',
      expect.objectContaining({ error: 'SECRET_DELAYED_RESTART_ERROR' })
    )
  })

  it('ignores cross-channel downgrades when current install is a prerelease', () => {
    appGetVersionMock.mockReturnValue('1.0.5-beta.5')
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    // 模拟 electron-updater 在 channel 错配下推送的旧正式版
    handler!({ version: '1.0.4', releaseDate: '2026-05-01', releaseNotes: '' })

    expect((service as any)._status).toBe('not-available')
    expect((service as any)._versionInfo).toBeNull()
    // 不应触发自动下载
    expect(electronUpdater.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('accepts in-channel upgrades from one beta to a newer beta', () => {
    appGetVersionMock.mockReturnValue('1.0.5-beta.2')
    const settings = {
      getChannel: vi.fn(() => 'beta')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.5-beta.5', releaseDate: '2026-05-15', releaseNotes: '' })

    expect((service as any)._status).toBe('available')
    expect((service as any)._versionInfo?.version).toBe('1.0.5-beta.5')
  })

  it('accepts beta to same-version stable release as a legitimate channel convergence', () => {
    // beta 测试完成，1.0.5 正式版发布；用户从 1.0.5-beta.5 升级到 1.0.5 应被允许
    appGetVersionMock.mockReturnValue('1.0.5-beta.5')
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.5', releaseDate: '2026-06-01', releaseNotes: '' })

    expect((service as any)._status).toBe('available')
    expect((service as any)._versionInfo?.version).toBe('1.0.5')
  })

  it('reports malformed update-marker reconciliation and still removes the marker', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(markerPath, '{SECRET_MALFORMED_MARKER')
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn(() => {
      throw new Error('diagnostic sink failed')
    })

    new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'marker_reconcile',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_MALFORMED_MARKER')
    expect(existsSync(markerPath)).toBe(false)
  })

  it('reports marker-write failure but still publishes downloaded status', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn()
    new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )
    await mkdir(markerPath)
    const downloaded = autoUpdaterState.listeners.get('update-downloaded')

    downloaded!({ version: '1.1.0', releaseDate: '2026-08-01', releaseNotes: 'SECRET_NOTES' })

    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'marker_write',
      errorCategory: 'persistence'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('SECRET_NOTES')
    expect(publishEventMock).toHaveBeenCalledWith(
      'upgrade.status.changed',
      expect.objectContaining({ status: 'downloaded' })
    )
  })

  it('coerces a Date releaseDate from electron-updater into an ISO string for the IPC contract', () => {
    // electron-updater parses latest*.yml via js-yaml, which turns an unquoted
    // ISO releaseDate into a Date object. The service must normalize it before
    // emitting so the typed-IPC zod contract never receives a Date.
    appGetVersionMock.mockReturnValue('1.0.0')
    const settings = {
      getChannel: vi.fn(() => 'beta')
    } as any

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    const date = new Date('2026-07-25T11:28:19.451Z')
    handler!({ version: '1.1.0-beta.6', releaseDate: date, releaseNotes: '' })

    expect((service as any)._status).toBe('available')
    const availableCall = publishEventMock.mock.calls.find(
      (call) => call[0] === 'upgrade.status.changed' && call[1]?.status === 'available'
    )
    expect(availableCall).toBeDefined()
    const info = availableCall![1].info
    expect(typeof info.releaseDate).toBe('string')
    expect(info.releaseDate).toBe('2026-07-25T11:28:19.451Z')
  })

  it('restores a persisted marker for manual download once install attempts are exhausted', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        releaseDate: '2026-07-25T11:28:19.451Z',
        releaseNotes: 'Release notes',
        githubUrl: 'https://github.com/ThinkInAIXYZ/deepchat/releases/tag/v1.1.0',
        downloadUrl: 'https://deepchatai.cn/#/download',
        phase: 'installing',
        attempts: 3,
        timestamp: Date.now()
      })
    )

    const settings = {
      getChannel: vi.fn(() => 'stable')
    } as any
    const observeFailure = vi.fn(() => {
      throw new Error('diagnostic sink failed')
    })

    const service = new UpgradeService(
      settings,
      () => false,
      requestUpdateInstallMock,
      publishEventMock,
      observeFailure
    )

    expect((service as any)._status).toBe('error')
    expect((service as any)._previousUpdateFailed).toBe(true)
    expect(observeFailure).toHaveBeenCalledOnce()
    expect(observeFailure).toHaveBeenCalledWith({
      operation: 'install_verification',
      errorCategory: 'unknown'
    })
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('Release notes')
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain('deepchatai.cn')
    expect(publishEventMock).toHaveBeenCalledWith(
      'upgrade.status.changed',
      expect.objectContaining({
        status: 'error',
        info: expect.objectContaining({
          version: '1.1.0',
          releaseDate: '2026-07-25T11:28:19.451Z'
        })
      })
    )
    // 次数已用尽：标记留着，用户手动检查时再重置
    expect(existsSync(markerPath)).toBe(true)
  })

  const createService = () =>
    new UpgradeService(
      { getChannel: vi.fn(() => 'stable') } as any,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )

  it('rewrites an interrupted install back to downloaded so this startup can retry', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'installing',
        attempts: 1,
        timestamp: Date.now()
      })
    )

    const service = createService()

    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.phase).toBe('downloaded')
    expect(marker.attempts).toBe(1)
    expect(service.getUpdateStatus().status).toBe('not-available')

    const handler = autoUpdaterState.listeners.get('update-available')
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockResolvedValue(undefined as never)
    handler!({ version: '1.1.0', releaseDate: '2026-08-01', releaseNotes: '' })

    expect(service.getUpdateStatus().status).toBe('available')
  })

  it('lets a manual check reset the retry budget but keep the downloaded marker', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'installing',
        attempts: 3,
        timestamp: Date.now()
      })
    )

    const service = createService()
    expect(service.getUpdateStatus().status).toBe('error')

    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockResolvedValue(undefined as never)
    await service.checkUpdate('manualCheck')

    expect(existsSync(markerPath)).toBe(true)
    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.version).toBe('1.1.0')
    expect(marker.attempts).toBe(0)
    expect(marker.phase).toBe('downloaded')
  })

  it('resets the retry budget when the target version changes', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'installing',
        attempts: 3,
        timestamp: Date.now()
      })
    )

    const service = createService()
    expect(service.getUpdateStatus().status).toBe('error')

    const handler = autoUpdaterState.listeners.get('update-available')
    handler!({ version: '1.2.0', releaseDate: '2026-09-01', releaseNotes: '' })

    expect(service.getUpdateStatus().status).toBe('available')
  })

  it('records one attempt on quit for non-Windows platforms', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const installerPath = path.join(userDataDirectory, 'JiaorongAI-mac-arm64.zip')
    await writeFile(installerPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath,
        downloadedAt: Date.now()
      })
    )

    createService()
    // 本次进程真的下载过，才会在退出时补记
    autoUpdaterState.listeners.get('update-downloaded')!({
      version: '1.1.0',
      releaseDate: '2026-09-01',
      releaseNotes: '',
      downloadedFile: installerPath
    })

    const quitHandler = appOnMock.mock.calls.filter(([event]) => event === 'quit').at(-1)?.[1] as
      | ((event: unknown, exitCode: number) => void)
      | undefined
    expect(quitHandler).toBeTypeOf('function')
    quitHandler!({}, 0)

    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.phase).toBe('installing')
    expect(marker.attempts).toBe(1)
  })

  it('does not count an attempt when quitting without downloading in this session', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const installerPath = path.join(userDataDirectory, 'JiaorongAI-mac-arm64.zip')
    await writeFile(installerPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath,
        downloadedAt: Date.now()
      })
    )

    createService()
    const quitHandler = appOnMock.mock.calls.filter(([event]) => event === 'quit').at(-1)?.[1] as
      | ((event: unknown, exitCode: number) => void)
      | undefined
    quitHandler!({}, 0)

    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.phase).toBe('downloaded')
    expect(marker.attempts).toBe(0)
  })

  it('does not count an attempt when the app exits abnormally', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const installerPath = path.join(userDataDirectory, 'JiaorongAI-mac-arm64.zip')
    await writeFile(installerPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath,
        downloadedAt: Date.now()
      })
    )

    createService()
    autoUpdaterState.listeners.get('update-downloaded')!({
      version: '1.1.0',
      releaseDate: '2026-09-01',
      releaseNotes: '',
      downloadedFile: installerPath
    })

    const quitHandler = appOnMock.mock.calls.filter(([event]) => event === 'quit').at(-1)?.[1] as
      | ((event: unknown, exitCode: number) => void)
      | undefined
    quitHandler!({}, 1)

    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.phase).toBe('downloaded')
    expect(marker.attempts).toBe(0)
  })

  it('uses the per-file sha512 of the downloaded artifact', async () => {
    const downloadedFile = path.join(userDataDirectory, 'JiaorongAI-windows-arm64.exe')
    createService()

    autoUpdaterState.listeners.get('update-downloaded')!({
      version: '1.1.0',
      releaseDate: '2026-09-01',
      releaseNotes: '',
      downloadedFile,
      sha512: 'top-level-x64',
      files: [
        { url: 'JiaorongAI-windows-x64.exe', sha512: 'x64-hash' },
        { url: 'JiaorongAI-windows-arm64.exe', sha512: 'arm64-hash' }
      ]
    })

    const marker = JSON.parse(
      await readFile(path.join(userDataDirectory, 'auto_update_marker.json'), 'utf8')
    )
    expect(marker.sha512).toBe('arm64-hash')
  })

  it('clears stale installer fields when the target version changes', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const installerPath = path.join(userDataDirectory, 'JiaorongAI-windows-x64.exe')
    await writeFile(installerPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath,
        downloadedAt: Date.now(),
        sha512: 'old-hash'
      })
    )

    const service = createService()
    autoUpdaterState.listeners.get('update-available')!({
      version: '1.2.0',
      releaseDate: '2026-10-01',
      releaseNotes: ''
    })

    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockResolvedValue(undefined as never)
    service.startDownloadUpdate()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const marker = JSON.parse(await readFile(markerPath, 'utf8'))
    expect(marker.version).toBe('1.2.0')
    expect(marker.installerPath).toBe('')
    expect(marker.sha512).toBe('')
  })

  it('cleans non-exe cached packages on non-Windows platforms', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const zipPath = path.join(
      userDataDirectory,
      'JiaorongAI-updater',
      'pending',
      'JiaorongAI-mac-arm64.zip'
    )
    await mkdir(path.dirname(zipPath), { recursive: true })
    await writeFile(zipPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.0.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath: zipPath,
        downloadedAt: Date.now()
      })
    )

    createService()

    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(zipPath)).toBe(false)
  })

  it('resets the retry budget when a newer version appears after a no-update check', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'installing',
        attempts: 3,
        timestamp: Date.now()
      })
    )

    const service = createService()
    expect(service.getUpdateStatus().status).toBe('error')

    autoUpdaterState.listeners.get('update-not-available')!({ version: '1.1.0' })
    autoUpdaterState.listeners.get('update-available')!({
      version: '1.2.0',
      releaseDate: '2026-09-01',
      releaseNotes: ''
    })

    expect(service.getUpdateStatus().status).toBe('available')
  })

  it('drops the cached package when the remote no longer offers that version', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const installerPath = path.join(
      userDataDirectory,
      'JiaorongAI-updater',
      'pending',
      'JiaorongAI-windows-x64.exe'
    )
    await mkdir(path.dirname(installerPath), { recursive: true })
    await writeFile(installerPath, 'stub')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.1.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath,
        downloadedAt: Date.now()
      })
    )

    createService()
    autoUpdaterState.listeners.get('update-not-available')!({ version: '1.0.0' })

    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(installerPath)).toBe(false)
  })

  it('does not delete files outside the updater cache when clearing a marker', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const untrusted = path.join(userDataDirectory, 'important.docx')
    await writeFile(untrusted, 'user data')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: '1.0.0',
        phase: 'downloaded',
        attempts: 0,
        installerPath: untrusted,
        downloadedAt: Date.now()
      })
    )

    createService()

    expect(existsSync(markerPath)).toBe(false)
    expect(existsSync(untrusted)).toBe(true)
  })

  it('clears a stale marker on quit when the cached package is gone', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    const missingInstaller = path.join(userDataDirectory, 'missing.dmg')

    createService()
    // 本次进程下载完成（写 marker、置 session 标记），随后缓存包被安全软件清掉
    autoUpdaterState.listeners.get('update-downloaded')!({
      version: '1.1.0',
      releaseDate: '2026-09-01',
      releaseNotes: '',
      downloadedFile: missingInstaller
    })

    const quitHandler = appOnMock.mock.calls.filter(([event]) => event === 'quit').at(-1)?.[1] as
      | ((event: unknown, exitCode: number) => void)
      | undefined
    quitHandler!({}, 0)

    expect(existsSync(markerPath)).toBe(false)
  })

  it('marks the marker as installing with an incremented attempt before handing off to the installer', async () => {
    const service = new UpgradeService(
      { getChannel: vi.fn(() => 'stable') } as any,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    ;(service as any)._status = 'downloaded'
    ;(service as any)._versionInfo = {
      version: '1.1.0',
      releaseDate: '2026-08-01',
      releaseNotes: '',
      githubUrl: '',
      downloadUrl: ''
    }

    expect(service.restartToUpdate()).toBe(true)
    await Promise.resolve()

    const marker = JSON.parse(
      await readFile(path.join(userDataDirectory, 'auto_update_marker.json'), 'utf8')
    )
    expect(marker).toEqual(
      expect.objectContaining({ version: '1.1.0', phase: 'installing', attempts: 1 })
    )
  })

  const writeDownloadedMarker = async (input: {
    version?: string
    attempts?: number
    installerPath?: string
    downloadedAt?: number
  }) => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({
        version: input.version ?? '1.1.0',
        phase: 'downloaded',
        attempts: input.attempts ?? 0,
        installerPath: input.installerPath ?? '',
        downloadedAt: input.downloadedAt ?? Date.now()
      })
    )
    return markerPath
  }

  it('does not throw on a marker with an invalid version and clears it', async () => {
    const markerPath = path.join(userDataDirectory, 'auto_update_marker.json')
    await writeFile(
      markerPath,
      JSON.stringify({ version: 'not-a-version', phase: 'downloaded', attempts: 0 })
    )

    expect(() => createService()).not.toThrow()
    expect(existsSync(markerPath)).toBe(false)
  })

  it('clears the marker once the installed version caught up', async () => {
    const installerPath = path.join(userDataDirectory, 'JiaorongAI-windows-x64.exe')
    await writeFile(installerPath, 'stub')
    const markerPath = await writeDownloadedMarker({ version: '1.0.0', installerPath })

    createService()

    expect(existsSync(markerPath)).toBe(false)
  })

  it('always exposes the current platform download link for manual downloads', async () => {
    const expected = resolveAppDownloadArtifact({
      platform: process.platform,
      arch: process.arch
    }).url
    const service = new UpgradeService(
      { getChannel: vi.fn(() => 'stable') } as any,
      () => false,
      requestUpdateInstallMock,
      publishEventMock
    )
    ;(service as any)._versionInfo = {
      version: '1.1.0',
      releaseDate: '2026-08-01',
      releaseNotes: '',
      githubUrl: '',
      downloadUrl: 'https://deepchatai.cn/#/download'
    }

    expect(service.getUpdateStatus().updateInfo?.downloadUrl).toBe(expected)
    await service.goDownloadUpgrade('official')
    expect(shell.openExternal).toHaveBeenCalledWith(expected)
  })
})
