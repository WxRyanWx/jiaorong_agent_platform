import { afterEach, describe, expect, it } from 'vitest'
import {
  applyAppCenterAccess,
  isJiaorongAppCenterVisible,
  isJiaorongDeveloper,
  resetAppCenterAccessForTests
} from '@jiaorong/config/appCenterAccess'

/** 写入 localStorage 登录态。 */
function setStoredUserInfo(userInfo: unknown): void {
  localStorage.setItem('userInfo', JSON.stringify(userInfo))
}

describe('app center access', () => {
  afterEach(() => {
    resetAppCenterAccessForTests()
    localStorage.clear()
  })

  it('stays hidden without whitelists', () => {
    setStoredUserInfo({ userName: 'L20184974', phone: '13039619789' })

    expect(isJiaorongAppCenterVisible()).toBe(false)
    expect(isJiaorongDeveloper()).toBe(false)
  })

  it('matches visible list by phone or userName', () => {
    applyAppCenterAccess(['15557190927'], [])

    setStoredUserInfo({ userName: 'someone', phone: '15557190927' })
    expect(isJiaorongAppCenterVisible()).toBe(true)

    applyAppCenterAccess(['L20184974'], [])
    setStoredUserInfo({ userName: 'L20184974', phone: '13000000000' })
    expect(isJiaorongAppCenterVisible()).toBe(true)

    setStoredUserInfo({ userName: 'other', phone: '13000000000' })
    expect(isJiaorongAppCenterVisible()).toBe(false)
  })

  it('matches visible list by phoneNumber the same as phone', () => {
    applyAppCenterAccess(['15557190927'], [])
    setStoredUserInfo({ userName: 'someone', phoneNumber: '15557190927' })
    expect(isJiaorongAppCenterVisible()).toBe(true)
  })

  it('shows everyone when the visible list is not configured', () => {
    applyAppCenterAccess(null, ['13039619789'])
    setStoredUserInfo({ userName: 'anyone', phone: '13900000000' })

    expect(isJiaorongDeveloper()).toBe(false)
    expect(isJiaorongAppCenterVisible()).toBe(true)
  })

  it('does not let developers in unless they are on the visible list', () => {
    applyAppCenterAccess(['15557190927'], ['13039619789'])
    setStoredUserInfo({ userName: 'dev', phone: '13039619789' })

    expect(isJiaorongDeveloper()).toBe(true)
    expect(isJiaorongAppCenterVisible()).toBe(false)

    setStoredUserInfo({ userName: 'listed', phone: '15557190927' })
    expect(isJiaorongDeveloper()).toBe(false)
    expect(isJiaorongAppCenterVisible()).toBe(true)
  })

  it('hides everyone when the visible list is configured empty', () => {
    applyAppCenterAccess([], ['13039619789'])
    setStoredUserInfo({ userName: 'dev', phone: '13039619789' })

    expect(isJiaorongDeveloper()).toBe(true)
    expect(isJiaorongAppCenterVisible()).toBe(false)
  })
})
