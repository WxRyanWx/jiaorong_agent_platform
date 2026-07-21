import request from './interceptors'

export const postLogin = (query: string, params: FormData) => {
  return request.post(`/sys-auth/oauth/token?${query}`, params)
}

export const postCode = (query: string, params: Record<string, string>) => {
  return request.post(`/auth/login/sms_captcha/check?${query}`, params)
}

export const getCaptcha = (query: string) => {
  return request.get(`/auth/login/sms_captcha?${query}`)
}

export const getPasswordCaptcha = (query: string) => {
  return request.get(`/sys-user/user/sms_captcha/pwd?${query}`)
}

export function oauthExitRes() {
  return request.post(`/auth/logout`)
}

export function getUserInfo(options?: { silent?: boolean }) {
  return request({
    url: '/sys-user/userInfo',
    method: 'GET',
    headers: options?.silent ? { dontShowMessage: true } : undefined
  })
}

export function updatePwd(query: string, params: { newPwd: string; key: string }) {
  return request.post(`/auth/login/init?${query}`, params)
}

export function retrievePwd(
  query: string,
  params: { captcha: string; key: string; phone: string; pwd: string }
) {
  return request.post(`/auth/login/credentials/reset?${query}`, params)
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
