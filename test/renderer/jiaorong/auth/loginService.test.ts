import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('../../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: requestMock
}))

vi.mock('../../../../src/jiaorong_src/api/auth/utils/pwd', () => ({
  pwdEncrypt: vi.fn(async (value: string) => `encrypted:${value}`)
}))

import {
  FeatchLogin,
  checkCode,
  sendCaptcha
} from '../../../../src/jiaorong_src/api/auth/loginService'

describe('login service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestMock.get.mockResolvedValue({})
    requestMock.post.mockResolvedValue({})
  })

  it('logs in by phone with the captcha key from captcha check', async () => {
    await FeatchLogin('13039619788', 'Aa123456', 'captcha-key')

    expect(requestMock.post).toHaveBeenCalledWith('/auth/login/phone', {
      phone: '13039619788',
      password: 'encrypted:Aa123456',
      captchaKey: 'captcha-key'
    })
  })

  it('checks sms captcha without frontend signing params', async () => {
    await checkCode('13039619788', 'captcha-key', '123456')

    expect(requestMock.post).toHaveBeenCalledWith('/auth/login/sms_captcha/check', {
      phone: '13039619788',
      captchaCode: '123456',
      captchaKey: 'captcha-key'
    })
  })

  it('requests sms captcha with only the phone parameter', async () => {
    await sendCaptcha('13039619788')

    expect(requestMock.get).toHaveBeenCalledWith('/auth/login/sms_captcha', {
      params: { phone: '13039619788' }
    })
  })
})
