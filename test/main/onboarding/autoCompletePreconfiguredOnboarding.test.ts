import { describe, expect, it } from 'vitest'
import {
  autoCompleteGuidedOnboardingIfPreconfigured,
  isProviderReadyWithoutOnboarding
} from '@/onboarding/autoCompletePreconfiguredOnboarding'
import {
  GUIDED_ONBOARDING_STATE_KEY,
  readGuidedOnboardingState,
  startGuidedOnboarding
} from '@/onboarding/state'
import type { LLM_PROVIDER } from '@shared/types/provider'

const createStore = () => {
  const values = new Map<string, unknown>()

  return {
    get: <T = unknown>(key: string) => values.get(key) as T | undefined,
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
    websites: {
      official: '',
      apiKey: ''
    },
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
    startGuidedOnboarding(store, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      store,
      [createProvider({ enable: true, apiKey: 'sk-test' })],
      200
    )

    expect(completed).toBe(true)
    expect(store.get('init_complete')).toBe(true)
    expect(readGuidedOnboardingState(store, 201).status).toBe('completed')
  })

  it('does nothing when onboarding is already complete', () => {
    const store = createStore()
    store.set('init_complete', true)
    startGuidedOnboarding(store, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      store,
      [createProvider({ enable: true, apiKey: 'sk-test' })],
      200
    )

    expect(completed).toBe(false)
    expect(readGuidedOnboardingState(store, 201).status).toBe('active')
  })

  it('does nothing when no provider is ready', () => {
    const store = createStore()
    startGuidedOnboarding(store, {}, 100)

    const completed = autoCompleteGuidedOnboardingIfPreconfigured(
      store,
      [createProvider({ enable: true, apiKey: '' })],
      200
    )

    expect(completed).toBe(false)
    expect(store.get('init_complete')).toBeUndefined()
    expect(store.get(GUIDED_ONBOARDING_STATE_KEY)).toBeDefined()
    expect(readGuidedOnboardingState(store, 201).status).toBe('active')
  })
})
