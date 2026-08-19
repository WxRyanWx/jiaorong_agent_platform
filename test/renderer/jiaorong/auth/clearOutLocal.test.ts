import { afterEach, describe, expect, it } from 'vitest'
import { clearAuthStorage } from '../../../../src/jiaorong_src/api/auth/utils/local'
import { clearOutLocal } from '../../../../src/jiaorong_src/auth/lib/local-user'

describe('clearOutLocal', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('clears the same auth keys as clearAuthStorage and keeps other storage', () => {
    localStorage.setItem('xkaitoken', 't')
    localStorage.setItem('userInfo', '{"id":1}')
    localStorage.setItem('userFullInfo', '{"id":1}')
    localStorage.setItem('keep-me', 'yes')

    clearOutLocal()

    expect(localStorage.getItem('xkaitoken')).toBeNull()
    expect(localStorage.getItem('userInfo')).toBeNull()
    expect(localStorage.getItem('userFullInfo')).toBeNull()
    expect(localStorage.getItem('keep-me')).toBe('yes')
    expect(clearOutLocal).toBe(clearAuthStorage)
  })
})
