import { describe, expect, it } from 'vitest'
import { mergeJiaorongPrivateApiCorsHeaders } from '../../../src/main/desktop/window/jiaorongPrivateApiCors'

describe('mergeJiaorongPrivateApiCorsHeaders', () => {
  it('injects CORS allow headers and strips existing Access-Control values', () => {
    const merged = mergeJiaorongPrivateApiCorsHeaders({
      'Content-Type': ['application/json'],
      'Access-Control-Allow-Origin': ['https://evil.example'],
      'access-control-allow-headers': ['X-Old']
    })

    expect(merged['Content-Type']).toEqual(['application/json'])
    expect(merged['Access-Control-Allow-Origin']).toEqual(['*'])
    expect(merged['Access-Control-Allow-Headers']?.[0]).toContain('Fusion-Auth')
    expect(merged['Access-Control-Allow-Headers']?.[0]).toContain('Product-Id')
    expect(merged['access-control-allow-headers']).toBeUndefined()
  })
})
