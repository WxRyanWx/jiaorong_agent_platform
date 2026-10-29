import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getVersion: vi.fn(() => '0.0.0-test'),
    getLocale: vi.fn(() => 'en-US')
  },
  nativeTheme: {
    shouldUseDarkColors: false
  },
  shell: {
    openPath: vi.fn()
  }
}))

import { ProviderSettings } from '../../../src/main/provider/settings'

const createSettings = (modelStatusHelper: unknown): ProviderSettings =>
  Object.assign(Object.create(ProviderSettings.prototype), {
    modelStatusHelper
  }) as ProviderSettings

describe('ProviderSettings legacy default model migration', () => {
  it('switches the legacy jiaorong default to V4.1 flash', () => {
    const modelStatusHelper = {
      getModelStatus: vi.fn(
        (_providerId: string, modelId: string) => modelId === 'jiaorong-deepseek-v4-pro'
      ),
      setModelStatus: vi.fn()
    }

    ;(createSettings(modelStatusHelper) as any).migrateLegacyJiaorongDefaultModelStatus()

    expect(modelStatusHelper.setModelStatus).toHaveBeenCalledWith(
      'jiaorong',
      'jiaorong-deepseek-v4-pro',
      false
    )
    expect(modelStatusHelper.setModelStatus).toHaveBeenCalledWith(
      'jiaorong',
      'jiaorong-deepseek-V4.1-flash',
      true
    )
  })

  it('keeps statuses unchanged when the new default is already enabled', () => {
    const modelStatusHelper = {
      getModelStatus: vi.fn(() => true),
      setModelStatus: vi.fn()
    }

    ;(createSettings(modelStatusHelper) as any).migrateLegacyJiaorongDefaultModelStatus()

    expect(modelStatusHelper.setModelStatus).not.toHaveBeenCalled()
  })

  it('does nothing when the legacy default is not enabled', () => {
    const modelStatusHelper = {
      getModelStatus: vi.fn(() => false),
      setModelStatus: vi.fn()
    }

    ;(createSettings(modelStatusHelper) as any).migrateLegacyJiaorongDefaultModelStatus()

    expect(modelStatusHelper.setModelStatus).not.toHaveBeenCalled()
  })
})
