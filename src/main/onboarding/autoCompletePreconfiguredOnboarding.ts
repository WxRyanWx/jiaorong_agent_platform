import type { LLM_PROVIDER } from '@shared/types/provider'
import type { SettingsStore } from '@/config/settingsStore'
import { completeGuidedOnboarding, readGuidedOnboardingState } from './state'

type OnboardingSettingsStore = Pick<SettingsStore, 'get' | 'set'>

const LOCAL_PROVIDER_API_TYPES = new Set(['ollama'])

export function isProviderReadyWithoutOnboarding(provider: LLM_PROVIDER): boolean {
  if (!provider.enable) {
    return false
  }

  if (LOCAL_PROVIDER_API_TYPES.has(provider.apiType)) {
    return true
  }

  return Boolean(provider.apiKey?.trim())
}

export function hasPreconfiguredProvider(providers: LLM_PROVIDER[]): boolean {
  return providers.some(isProviderReadyWithoutOnboarding)
}

export function autoCompleteGuidedOnboardingIfPreconfigured(
  settings: OnboardingSettingsStore,
  providers: LLM_PROVIDER[],
  now = Date.now()
): boolean {
  const initComplete = Boolean(settings.get('init_complete'))
  const state = readGuidedOnboardingState(settings, now)

  if (initComplete || state.status === 'completed') {
    return false
  }

  if (!hasPreconfiguredProvider(providers)) {
    return false
  }

  completeGuidedOnboarding(settings, now, { force: true })
  console.info('[Onboarding] Auto-completed guided onboarding for preconfigured provider')
  return true
}
