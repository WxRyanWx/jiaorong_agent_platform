import { describe, expect, it } from 'vitest'
import { resolveInAppChatLoginNavigation } from '@/deeplink/navigation'

describe('resolveInAppChatLoginNavigation', () => {
  it('accepts jiaorongchat and deepchat login callbacks', () => {
    expect(resolveInAppChatLoginNavigation('jiaorongchat://chat?token=abc')).toBe(
      'jiaorongchat://chat?token=abc'
    )
    expect(resolveInAppChatLoginNavigation('  DEEPCHAT://chat?token=abc  ')).toBe(
      'DEEPCHAT://chat?token=abc'
    )
  })

  it('ignores https SSO redirects and non-login app protocols', () => {
    expect(
      resolveInAppChatLoginNavigation(
        'https://c4ai.ccccltd.cn/api/auth/login/jjt?code=1&state=jrDCClientV1'
      )
    ).toBeNull()
    expect(resolveInAppChatLoginNavigation('https://jjt.ccccltd.cn/wwopen/sso/qrConnect')).toBeNull()
    expect(resolveInAppChatLoginNavigation('jiaorongchat://mcp/install?json=abc')).toBeNull()
    expect(resolveInAppChatLoginNavigation('jiaorongchat://start?msg=hi')).toBeNull()
    expect(resolveInAppChatLoginNavigation('jiaorongchat://chat')).toBeNull()
  })
})
