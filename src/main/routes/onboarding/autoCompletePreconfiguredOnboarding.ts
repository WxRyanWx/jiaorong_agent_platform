import type { IConfigPresenter, LLM_PROVIDER } from '@shared/presenter'
import { completeGuidedOnboarding, readGuidedOnboardingState } from './onboardingRouteSupport'

type ConfigPresenterPort = Pick<IConfigPresenter, 'getSetting' | 'setSetting'>

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
  configPresenter: ConfigPresenterPort,
  providers: LLM_PROVIDER[],
  now = Date.now()
): boolean {
  const initComplete = Boolean(configPresenter.getSetting<boolean>('init_complete'))
  const state = readGuidedOnboardingState(configPresenter, now)

  if (initComplete || state.status === 'completed') {
    return false
  }

  if (!hasPreconfiguredProvider(providers)) {
    return false
  }

  completeGuidedOnboarding(configPresenter, now, { force: true })
  console.info('[Onboarding] Auto-completed guided onboarding for preconfigured provider')
  return true
}
