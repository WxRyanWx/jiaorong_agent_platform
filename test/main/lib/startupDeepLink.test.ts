import { beforeEach, describe, expect, it } from 'vitest'
import {
  consumeStartupDeepLink,
  findDeepLinkArg,
  findStartupDeepLink,
  storeStartupDeepLink
} from '@/lib/startupDeepLink'
import { DEEPLINK_SCHEME } from '@shared/appIdentity'

const deeplink = (path: string) => `${DEEPLINK_SCHEME}://${path}`

describe('startupDeepLink utilities', () => {
  beforeEach(() => {
    consumeStartupDeepLink()
  })

  it('prefers stored startup deeplink over argv and secondary env keys', () => {
    const env = {
      STARTUP_DEEPLINK: deeplink('start?msg=stored'),
      DEEPLINK_URL: deeplink('start?msg=env')
    } as NodeJS.ProcessEnv

    expect(findStartupDeepLink([`electron`, deeplink('start?msg=argv')], env)).toBe(
      deeplink('start?msg=stored')
    )
  })

  it('falls back to argv before secondary env deeplinks', () => {
    const env = {
      DEEPLINK_URL: deeplink('start?msg=env')
    } as NodeJS.ProcessEnv

    expect(findStartupDeepLink([`electron`, deeplink('start?msg=argv')], env)).toBe(
      deeplink('start?msg=argv')
    )
  })

  it('stores and consumes startup deeplink exactly once', () => {
    const env = {} as NodeJS.ProcessEnv

    expect(storeStartupDeepLink(deeplink('start?msg=hello'), env)).toBe(deeplink('start?msg=hello'))
    expect(env.STARTUP_DEEPLINK).toBeUndefined()
    expect(findStartupDeepLink(['electron'], env)).toBe(deeplink('start?msg=hello'))
    expect(consumeStartupDeepLink(env)).toBe(deeplink('start?msg=hello'))
    expect(consumeStartupDeepLink(env)).toBeNull()
  })

  it('finds deeplink arguments from a command line', () => {
    expect(findDeepLinkArg(['electron', '--flag', deeplink('provider/install?v=1')])).toBe(
      deeplink('provider/install?v=1')
    )
  })

  it('ignores strings that only contain a deeplink later in the value', () => {
    expect(
      findDeepLinkArg(['electron', `https://example.com/?next=${deeplink('start?msg=1')}`])
    ).toBe(null)
    expect(findDeepLinkArg(['electron', `prefix ${deeplink('start?msg=1')}`])).toBeNull()
  })

  it('normalizes legacy deepchat deeplinks to jiaorongchat', () => {
    const env = {} as NodeJS.ProcessEnv

    expect(storeStartupDeepLink('deepchat://chat?token=legacy', env)).toBe(
      deeplink('chat?token=legacy')
    )
  })
})
