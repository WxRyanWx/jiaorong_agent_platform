import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPDATE_EVENTS, WINDOW_EVENTS } from '../../../src/main/events'

const {
  autoUpdaterState,
  sendToMainMock,
  sendToRendererMock,
  floatingButtonDestroyMock,
  destroyFloatingChatWindowMock,
  setApplicationQuittingMock,
  appQuitMock,
  appRelaunchMock,
  appExitMock,
  appGetVersionMock,
  appIsPackaged
} = vi.hoisted(() => {
  const autoUpdaterState = {
    listeners: new Map<string, (...args: unknown[]) => void>(),
    reset() {
      this.listeners.clear()
    }
  }

  return {
    autoUpdaterState,
    sendToMainMock: vi.fn(),
    sendToRendererMock: vi.fn(),
    floatingButtonDestroyMock: vi.fn(),
    destroyFloatingChatWindowMock: vi.fn(),
    setApplicationQuittingMock: vi.fn(),
    appQuitMock: vi.fn(),
    appRelaunchMock: vi.fn(),
    appExitMock: vi.fn(),
    appGetVersionMock: vi.fn(() => '1.0.0'),
    appIsPackaged: { value: false }
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/deepchat-test'),
    getVersion: appGetVersionMock,
    get isPackaged() {
      return appIsPackaged.value
    },
    quit: appQuitMock,
    relaunch: appRelaunchMock,
    exit: appExitMock
  },
  shell: {
    openExternal: vi.fn()
  }
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: {
      autoDownload: false,
      allowDowngrade: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: false,
      forceDevUpdateConfig: false,
      updateConfigPath: undefined as string | undefined,
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

vi.mock('@/eventbus', () => ({
  eventBus: {
    on: vi.fn(),
    sendToMain: sendToMainMock,
    sendToRenderer: sendToRendererMock
  },
  SendTarget: {
    ALL_WINDOWS: 'all_windows'
  }
}))

vi.mock('@/presenter', () => ({
  presenter: {
    windowPresenter: {
      setApplicationQuitting: setApplicationQuittingMock,
      destroyFloatingChatWindow: destroyFloatingChatWindowMock
    },
    floatingButtonPresenter: {
      destroy: floatingButtonDestroyMock
    }
  }
}))

import electronUpdater from 'electron-updater'
import { UpgradePresenter } from '../../../src/main/presenter/upgradePresenter'

describe('UpgradePresenter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    autoUpdaterState.reset()
    sendToMainMock.mockReset()
    sendToRendererMock.mockReset()
    floatingButtonDestroyMock.mockReset()
    destroyFloatingChatWindowMock.mockReset()
    setApplicationQuittingMock.mockReset()
    appQuitMock.mockReset()
    appRelaunchMock.mockReset()
    appExitMock.mockReset()
    appGetVersionMock.mockReset()
    appGetVersionMock.mockReturnValue('1.0.0')
    appIsPackaged.value = false
    electronUpdater.autoUpdater.forceDevUpdateConfig = false
    electronUpdater.autoUpdater.updateConfigPath = undefined
    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockReset()
  })

  afterEach(async () => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('destroys floating UI before quitAndInstall during update restart', async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable')
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    ;(presenter as any)._status = 'downloaded'

    expect(presenter.restartToUpdate()).toBe(true)
    expect(setApplicationQuittingMock).toHaveBeenCalledWith(true)
    expect(destroyFloatingChatWindowMock).toHaveBeenCalledTimes(1)
    expect(floatingButtonDestroyMock).toHaveBeenCalledTimes(1)
    expect(sendToMainMock).toHaveBeenCalledWith(WINDOW_EVENTS.SET_APPLICATION_QUITTING, {
      isQuitting: true
    })
    expect(sendToRendererMock).toHaveBeenCalledWith(UPDATE_EVENTS.WILL_RESTART, 'all_windows')

    await vi.advanceTimersByTimeAsync(500)

    expect(electronUpdater.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(appQuitMock).not.toHaveBeenCalled()
  })

  it('relaunches the app for mock downloaded updates without calling quitAndInstall', async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable')
    } as any

    const presenter = new UpgradePresenter(configPresenter)

    expect(presenter.mockDownloadedUpdate()).toBe(true)
    expect(presenter.restartToUpdate()).toBe(true)

    expect(setApplicationQuittingMock).toHaveBeenCalledWith(true)
    expect(destroyFloatingChatWindowMock).toHaveBeenCalledTimes(1)
    expect(floatingButtonDestroyMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)

    expect(appRelaunchMock).toHaveBeenCalledTimes(1)
    expect(appExitMock).toHaveBeenCalledTimes(1)
    expect(electronUpdater.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('skips app-focus auto check when privacy mode is enabled', () => {
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => true)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    const checkSpy = vi.spyOn(presenter, 'checkUpdate').mockResolvedValue(undefined)

    ;(presenter as any).handleAppFocus()

    expect(checkSpy).not.toHaveBeenCalled()
    expect(electronUpdater.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('keeps manual update checks available while privacy mode is enabled', async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => true)
    } as any

    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockResolvedValue(undefined as never)

    const presenter = new UpgradePresenter(configPresenter)

    await presenter.checkUpdate()

    expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('ignores cross-channel downgrades when current install is a prerelease', () => {
    appGetVersionMock.mockReturnValue('1.0.5-beta.5')
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    // 模拟 electron-updater 在 channel 错配下推送的旧正式版
    handler!({ version: '1.0.4', releaseDate: '2026-05-01', releaseNotes: '' })

    expect((presenter as any)._status).toBe('not-available')
    expect((presenter as any)._versionInfo).toBeNull()
    // 不应触发自动下载
    expect(electronUpdater.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('accepts in-channel upgrades from one beta to a newer beta', () => {
    appGetVersionMock.mockReturnValue('1.0.5-beta.2')
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'beta'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.5-beta.5', releaseDate: '2026-05-15', releaseNotes: '' })

    expect((presenter as any)._status).toBe('available')
    expect((presenter as any)._versionInfo?.version).toBe('1.0.5-beta.5')
  })

  it('accepts beta to same-version stable release as a legitimate channel convergence', () => {
    // beta 测试完成，1.0.5 正式版发布；用户从 1.0.5-beta.5 升级到 1.0.5 应被允许
    appGetVersionMock.mockReturnValue('1.0.5-beta.5')
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.5', releaseDate: '2026-06-01', releaseNotes: '' })

    expect((presenter as any)._status).toBe('available')
    expect((presenter as any)._versionInfo?.version).toBe('1.0.5')
  })

  it('enables forceDevUpdateConfig when the app is not packaged', () => {
    appIsPackaged.value = false
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable')
    } as any

    new UpgradePresenter(configPresenter)

    expect(electronUpdater.autoUpdater.forceDevUpdateConfig).toBe(true)
    expect(electronUpdater.autoUpdater.updateConfigPath).toMatch(/dev-app-update\.yml$/)
  })

  it('does not force dev update config when the app is packaged', () => {
    appIsPackaged.value = true
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable')
    } as any

    new UpgradePresenter(configPresenter)

    expect(electronUpdater.autoUpdater.forceDevUpdateConfig).toBe(false)
    expect(electronUpdater.autoUpdater.updateConfigPath).toBeUndefined()
  })

  it('falls back to not-available when checkForUpdates returns null without events', async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    vi.mocked(electronUpdater.autoUpdater.checkForUpdates).mockResolvedValue(null as never)

    const presenter = new UpgradePresenter(configPresenter)
    await presenter.checkUpdate()

    expect((presenter as any)._status).toBe('not-available')
    expect(sendToRendererMock).toHaveBeenCalledWith(
      UPDATE_EVENTS.STATUS_CHANGED,
      'all_windows',
      expect.objectContaining({ status: 'not-available' })
    )
  })

  it('does not auto-download on autoCheck when the app is not packaged', () => {
    appIsPackaged.value = false
    appGetVersionMock.mockReturnValue('1.0.0')
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockResolvedValue([] as never)

    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    ;(presenter as any)._lastCheckType = 'autoCheck'
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.1', releaseDate: '2026-06-01', releaseNotes: '' })

    expect((presenter as any)._status).toBe('available')
    expect(electronUpdater.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('auto-downloads on autoCheck when the app is packaged', () => {
    appIsPackaged.value = true
    appGetVersionMock.mockReturnValue('1.0.0')
    vi.mocked(electronUpdater.autoUpdater.downloadUpdate).mockResolvedValue([] as never)

    const configPresenter = {
      getUpdateChannel: vi.fn(() => 'stable'),
      getPrivacyModeEnabled: vi.fn(() => false)
    } as any

    const presenter = new UpgradePresenter(configPresenter)
    ;(presenter as any)._lastCheckType = 'autoCheck'
    const handler = autoUpdaterState.listeners.get('update-available')
    expect(handler).toBeDefined()

    handler!({ version: '1.0.1', releaseDate: '2026-06-01', releaseNotes: '' })

    expect((presenter as any)._status).toBe('downloading')
    expect(electronUpdater.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })
})
