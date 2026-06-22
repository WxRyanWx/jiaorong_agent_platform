import { describe, expect, it } from 'vitest'
import {
  autoCompleteGuidedOnboardingIfPreconfigured,
  isProviderReadyWithoutOnboarding
} from '@/routes/onboarding/autoCompletePreconfiguredOnboarding'
import {
  GUIDED_ONBOARDING_STATE_KEY,
  readGuidedOnboardingState,
  startGuidedOnboarding
} from '@/routes/onboarding/onboardingRouteSupport'
import type { LLM_PROVIDER } from '@shared/presenter'

const createStore = () => {
  const values = new Map<string, unknown>()

  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => {
      values.set(key, value)
    },
    values
  }
}

const createProvider = (overrides: Partial<LLM_PROVIDER> = {}): LLM_PROVIDER =>
  ({
    id: 'jiaorong',
    name: 'Jiaorong',
    apiType: 'openai-completions',
    apiKey: 'sk-test',
    baseUrl: 'https://example.com/v1',
    enable: true,
    websites: {},
    models: [],
    customModels: [],
    enabledModels: [],
    disabledModels: [],
    ...overrides
  }) as LLM_PROVIDER

describe('autoCompletePreconfiguredOnboarding', () => {
  it('detects enabled providers with credentials', () => {
    expect(
      isProviderReadyWithoutOnboarding(createProvider({ enable: true, apiKey: 'sk-test' }))
    ).toBe(true)
    expect(
      isProviderReadyWithoutOnboarding(createProvider({ enable: false, apiKey: 'sk-test' }))
    ).toBe(false)
    expect(isProviderReadyWithoutOnboarding(createProvider({ enable: true, apiKey: '' }))).toBe(
      false
    )
    expect(
      isProviderReadyWithoutOnboarding(
        createProvider({ enable: true, apiKey: '', apiType: 'ollama' })
      )
    ).toBe(true)
  })

  it('auto-completes onboarding when a preconfigured provider exists', () => {
    const store = createStore()
    const presenter = {
      getSetting: <T>(key: string) => store.get(key) as T | undefined,
      setSetting: (key: string, value: unknown) => {
        store.set(key, value)
      }
    }

    startGuidedOnboarding(presenter, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      presenter,
      [createProvider({ enable: true, apiKey: 'sk-test' })],
      200
    )

    expect(completed).toBe(true)
    expect(store.get('init_complete')).toBe(true)
    expect(readGuidedOnboardingState(presenter, 201).status).toBe('completed')
  })

  it('does nothing when onboarding is already complete', () => {
    const store = createStore()
    store.set('init_complete', true)
    const presenter = {
      getSetting: <T>(key: string) => store.get(key) as T | undefined,
      setSetting: (key: string, value: unknown) => {
        store.set(key, value)
      }
    }

    startGuidedOnboarding(presenter, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      presenter,
      [createProvider({ enable: true, apiKey: 'sk-test' })],
      200
    )

    expect(completed).toBe(false)
    expect(readGuidedOnboardingState(presenter, 201).status).toBe('active')
  })

  it('does nothing when no provider is ready', () => {
    const store = createStore()
    const presenter = {
      getSetting: <T>(key: string) => store.get(key) as T | undefined,
      setSetting: (key: string, value: unknown) => {
        store.set(key, value)
      }
    }

    startGuidedOnboarding(presenter, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      presenter,
      [createProvider({ enable: true, apiKey: '' })],
      200
    )

    expect(completed).toBe(false)
    expect(store.get('init_complete')).toBeUndefined()
    expect(store.get(GUIDED_ONBOARDING_STATE_KEY)).toBeDefined()
    expect(readGuidedOnboardingState(presenter, 201).status).toBe('active')
  })
})
