import { describe, expect, it, vi } from 'vitest'
import type { JiaorongAppRuntime } from '../../../src/jiaorong_src/appHost/types'

const managerMocks = vi.hoisted(() => ({ installSystemAppFromPackage: vi.fn() }))

vi.mock('../../../src/jiaorong_src/appHost/devCenter/main/devAppWindow', () => ({
  isDevAppWindowOpen: vi.fn(() => true)
}))

vi.mock('../../../src/jiaorong_src/appHost/main/appManagerInstance', () => ({
  sharedAppsManager: vi.fn(() => managerMocks)
}))

vi.mock('../../../src/jiaorong_src/appHost/main/downloadAppZip', () => ({
  downloadAppZip: vi.fn(async () => ({ zipPath: '/tmp/app.zip', sha256: 'abc' }))
}))

vi.mock('../../../src/jiaorong_src/appHost/config/remoteRuntimeConfig', () => ({
  peekJiaorongRemoteRuntimeConfig: vi.fn(() => true),
  refreshJiaorongRemoteRuntimeConfig: vi.fn(async () => {})
}))

vi.mock('../../../src/jiaorong_src/appHost/main/manifest', () => ({
  readAppManifest: vi.fn(() => ({ version: '1.0.0' }))
}))

vi.mock('../../../src/jiaorong_src/appHost/main/scan', () => ({
  compareAppVersion: vi.fn(() => true),
  scanJiaorongApps: vi.fn(() => [
    {
      id: 'collaboration-platform',
      name: '协同平台',
      version: '1.1.0',
      slot: 'menu',
      source: 'builtin',
      enabled: true,
      auth: null,
      provider: '',
      package: { kind: 'zip', downloadUrl: 'https://example.com/app.zip', sha256: 'abc' },
      visible: true,
      installStatus: 'update_available',
      installedVersion: '1.0.0',
      appDir: null,
      entry: null
    } satisfies JiaorongAppRuntime
  ])
}))

vi.mock('../../../src/jiaorong_src/appHost/main/userIdentity', () => ({
  readUserIdentityFromAuthSession: vi.fn(() => ({ mobile: '13000000000' }))
}))

import { syncCollaborationPlatform } from '../../../src/jiaorong_src/appHost/main/systemAppUpdate'
import { sharedAppsManager } from '../../../src/jiaorong_src/appHost/main/appManagerInstance'

describe('system app update', () => {
  it('skips update while the same app debug window is open', async () => {
    const deps = {
      getAuthSession: () => null
    } as Parameters<typeof syncCollaborationPlatform>[0]
    const result = await syncCollaborationPlatform(deps)

    expect(result).toBe(false)
    expect(managerMocks.installSystemAppFromPackage).not.toHaveBeenCalled()
  })
})
