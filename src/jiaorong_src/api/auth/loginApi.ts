import request from './interceptors'

export const postLogin = (params: { phone: string; password: string; captchaKey?: string }) => {
  return request.post('/auth/login/phone', params)
}

export const postCode = (params: { phone: string; captchaCode: string; captchaKey: string }) => {
  return request.post('/auth/login/sms_captcha/check', params)
}

export const getCaptcha = (phone: string) => {
  return request.get('/auth/login/sms_captcha', { params: { phone } })
}

export const getPasswordCaptcha = (query: string) => {
  return request.get(`/sys-user/user/sms_captcha/pwd?${query}`)
}

export function oauthExitRes() {
  return request.post(`/auth/logout`)
}

export function getUserInfo(options?: { silent?: boolean; timeout?: number }) {
  return request({
    url: '/sys-user/userInfo',
    method: 'GET',
    ...(typeof options?.timeout === 'number' ? { timeout: options.timeout } : {}),
    headers: options?.silent ? { dontShowMessage: true } : undefined
  })
}

export function updatePwd(params: { newPwd: string; key: string }) {
  return request.post('/auth/login/init', params)
}

export function retrievePwd(params: { captcha: string; key: string; phone: string; pwd: string }) {
  return request.post('/auth/login/credentials/reset', params)
}

export function addUserUsageRecord(paramas: object, featureName: string, userId: string) {
  return request({
    url: `/fusion-ai/achievement/userUsageRecord`,
    method: 'POST',
    data: {
      additionalRequirements: [paramas],
      featureName,
      userId
    }
  })
}
