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

const LEGACY_MODEL_ID = 'jiaorong-deepseek-v4-pro'
const DEFAULT_MODEL_ID = 'jiaorong-deepseek-V4.1-flash'
const legacyStatusKey = `model_status_jiaorong_${LEGACY_MODEL_ID}`
const defaultStatusKey = `model_status_jiaorong_${DEFAULT_MODEL_ID}`

const createSettings = (
  enabledModelIds: string[],
  rawStore: Record<string, unknown> = {}
): { settings: ProviderSettings; setModelStatus: ReturnType<typeof vi.fn> } => {
  const setModelStatus = vi.fn()
  const settings = Object.assign(Object.create(ProviderSettings.prototype), {
    modelStatusHelper: {
      getModelStatus: vi.fn((_providerId: string, modelId: string) =>
        enabledModelIds.includes(modelId)
      ),
      setModelStatus
    },
    store: { store: rawStore }
  }) as ProviderSettings

  return { settings, setModelStatus }
}

const runMigration = (settings: ProviderSettings): void => {
  ;(settings as any).migrateLegacyJiaorongDefaultModelStatus()
}

describe('ProviderSettings legacy default model migration', () => {
  // 场景 1：旧启用 + 新未启用 → 停旧 + 启新
  it('scenario 1: disables the legacy default and enables V4.1 flash', () => {
    const { settings, setModelStatus } = createSettings([LEGACY_MODEL_ID])

    runMigration(settings)

    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', LEGACY_MODEL_ID, false)
    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', DEFAULT_MODEL_ID, true)
  })

  // 场景 2：旧启用 + 新已启用 → 只停旧（本次事故的那批用户）
  it('scenario 2: disables the legacy default even when the new default is enabled', () => {
    const { settings, setModelStatus } = createSettings([LEGACY_MODEL_ID, DEFAULT_MODEL_ID])

    runMigration(settings)

    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', LEGACY_MODEL_ID, false)
    // 新默认已启用，不再重复写，避免多余的状态变更事件。
    expect(setModelStatus).not.toHaveBeenCalledWith('jiaorong', DEFAULT_MODEL_ID, true)
  })

  // 场景 3：旧未启用 + 新未启用 → 什么都不做（尊重用户主动关闭）
  it('scenario 3: does nothing when neither default is enabled', () => {
    const { settings, setModelStatus } = createSettings([], { [defaultStatusKey]: false })

    runMigration(settings)

    expect(setModelStatus).not.toHaveBeenCalled()
  })

  // 场景 4：旧未启用 + 新已启用 → 什么都不做
  it('scenario 4: does nothing when only the new default is enabled', () => {
    const { settings, setModelStatus } = createSettings([DEFAULT_MODEL_ID], {
      [defaultStatusKey]: true
    })

    runMigration(settings)

    expect(setModelStatus).not.toHaveBeenCalled()
  })

  it('still cleans up legacy status rows stored with a different model id casing', () => {
    const { settings, setModelStatus } = createSettings([DEFAULT_MODEL_ID], {
      'model_status_jiaorong_jiaorong-deepseek-V4-pro': true,
      [defaultStatusKey]: true
    })

    runMigration(settings)

    // 历史残留的变体条目也要清理，但不应重新打开用户已有的新默认模型选择。
    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', 'jiaorong-deepseek-V4-pro', false)
    expect(setModelStatus).not.toHaveBeenCalledWith('jiaorong', DEFAULT_MODEL_ID, true)
  })

  it('disables both the exact and differently-cased legacy entries', () => {
    const { settings, setModelStatus } = createSettings([LEGACY_MODEL_ID, DEFAULT_MODEL_ID], {
      [legacyStatusKey]: true,
      'model_status_jiaorong_jiaorong-deepseek-V4-pro': true,
      [defaultStatusKey]: true
    })

    runMigration(settings)

    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', LEGACY_MODEL_ID, false)
    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', 'jiaorong-deepseek-V4-pro', false)
    expect(setModelStatus).not.toHaveBeenCalledWith('jiaorong', DEFAULT_MODEL_ID, true)
  })

  it('keeps working when scanning the status store throws', () => {
    const setModelStatus = vi.fn()
    const settings = Object.assign(Object.create(ProviderSettings.prototype), {
      modelStatusHelper: {
        getModelStatus: vi.fn(
          (_providerId: string, modelId: string) => modelId === LEGACY_MODEL_ID
        ),
        setModelStatus
      },
      store: {
        get store(): Record<string, unknown> {
          throw new Error('database unavailable')
        }
      }
    }) as ProviderSettings

    expect(() => runMigration(settings)).not.toThrow()
    expect(setModelStatus).toHaveBeenCalledWith('jiaorong', LEGACY_MODEL_ID, false)
  })
})
