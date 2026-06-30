import { describe, expect, it } from 'vitest'
import {
  buildFixedIframeUrl,
  mergeFixedIframeQueryParams,
  resolveFixedIframeBaseUrl
} from '@shared/fixedIframeAgents'

describe('fixedIframeAgents', () => {
  it('appends dynamic query params to a fixed iframe base url', () => {
    expect(buildFixedIframeUrl('https://example.com/app', { id: 'session-42' })).toBe(
      'https://example.com/app?id=session-42'
    )
  })

  it('preserves existing query params on the base url', () => {
    expect(
      buildFixedIframeUrl('https://example.com/app?source=deepchat', { id: 'session-42' })
    ).toBe('https://example.com/app?source=deepchat&id=session-42')
  })

  it('merges auth token into iframe query params', () => {
    expect(mergeFixedIframeQueryParams({ id: 'session-42' }, { authToken: 'jwt-token' })).toEqual({
      id: 'session-42',
      token: 'jwt-token'
    })
  })

  it('appends token to iframe urls built from merged params', () => {
    const params = mergeFixedIframeQueryParams({ id: 'session-42' }, { authToken: 'jwt-token' })
    expect(buildFixedIframeUrl('https://example.com/app', params)).toBe(
      'https://example.com/app?id=session-42&token=jwt-token'
    )
  })

  it('resolves secondary nav urls for intelligence center and headlines agent', () => {
    expect(resolveFixedIframeBaseUrl('intelligence-center', 'knowledge-base')).toBe(
      'https://c4ai.ccccltd.cn/login'
    )
    expect(resolveFixedIframeBaseUrl('headlines-agent', 'ai-trends')).toBe(
      'https://c4ai.ccccltd.cn/tutorial/xindongxiang/'
    )
    expect(resolveFixedIframeBaseUrl('headlines-agent', 'learn-ai')).toBe(
      'https://c4ai.ccccltd.cn/tutorial/'
    )
    expect(resolveFixedIframeBaseUrl('headlines-agent', 'cccc-headlines')).toBe(
      'https://c4ai.ccccltd.cn/learnai/index'
    )
    expect(resolveFixedIframeBaseUrl('ppt-agent')).toBe('https://www.baidu.com')
  })
})
