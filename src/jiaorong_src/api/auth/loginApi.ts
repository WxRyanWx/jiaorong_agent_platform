import type { AxiosRequestConfig } from 'axios'
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

/** 旧 token 换新 token：无入参，后端读请求头 Fusion-Auth 返回新 token */
export function refreshAuthToken() {
  /** 静默续期标记：失败不打 toast，401 也不再走续期重试 */
  const config: AxiosRequestConfig & { authRefreshRequest?: boolean } = {
    headers: { dontShowMessage: true },
    authRefreshRequest: true,
    // 静默续期单独限 15s，避免 hang 住拖慢 401 重试链
    timeout: 15000
  }
  return request.post('/auth/token/refresh', null, config)
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
