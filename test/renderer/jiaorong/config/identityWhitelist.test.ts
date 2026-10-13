import { describe, expect, it } from 'vitest'
import { resolveJiaorongIdentityValue } from '@jiaorong/config/identityWhitelist'

describe('jiaorong identity value', () => {
  it('prefers the stable userName over phone', () => {
    expect(resolveJiaorongIdentityValue({ userName: 'L20184974', phone: '13000000000' })).toBe(
      'L20184974'
    )
    expect(resolveJiaorongIdentityValue({ userName: 'L20184974', phone: '15500000000' })).toBe(
      'L20184974'
    )
  })

  it('falls back to phone and then anonymous', () => {
    expect(resolveJiaorongIdentityValue({ userName: null, phone: '13000000000' })).toBe(
      '13000000000'
    )
    expect(resolveJiaorongIdentityValue({ userName: null, phone: null })).toBe('anonymous')
  })
})
