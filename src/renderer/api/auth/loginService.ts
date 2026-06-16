import { pwdEncrypt, initParams, getDecParams } from './utils/pwd'
import {
  postCode,
  postLogin,
  getCaptcha,
  oauthExitRes,
  getUserInfo,
  updatePwd,
  retrievePwd,
  addUserUsageRecord
} from './loginApi'
import type { AuthApiResponse, CaptchaCheckData, LoginSuccessData, UserInfoData } from './types'

export const FeatchLogin = async (username: string, password: string) => {
  const formData = new FormData()
  formData.append('grant_type', 'password')
  formData.append('scope', 'all')
  formData.append('username', username || '')
  formData.append('password', pwdEncrypt(password || '') || '')
  const flatObj = getDecParams({})
  return postLogin(
    initParams(flatObj.signParams as Record<string, string | number>),
    formData
  ) as unknown as Promise<AuthApiResponse<LoginSuccessData> & LoginSuccessData>
}

export const sendCaptcha = async (phone: string) => {
  const flatObj = getDecParams({ phone })
  return getCaptcha(
    initParams(flatObj.signParams as Record<string, string | number>)
  ) as unknown as Promise<AuthApiResponse<string>>
}

export const checkCode = async (phone: string, captchaKey: string, captchaValue: string) => {
  const paramas = {
    phone: phone || '',
    captchaCode: captchaValue || '',
    captchaKey: captchaKey || ''
  }
  const flatObj = getDecParams({})
  return postCode(
    initParams(flatObj.signParams as Record<string, string | number>),
    paramas
  ) as unknown as Promise<AuthApiResponse<CaptchaCheckData>>
}

export const FeatchExit = async () => {
  return oauthExitRes()
}

export const FeatchUserInfo = async (_userName?: string, options?: { silent?: boolean }) => {
  return getUserInfo(options) as unknown as Promise<AuthApiResponse<UserInfoData>>
}

export const FeatchUpdatePwd = async (newPwd: string, key: string) => {
  const paramas = {
    newPwd: pwdEncrypt(newPwd || '') || '',
    key
  }
  const flatObj = getDecParams({})
  return updatePwd(
    initParams(flatObj.signParams as Record<string, string | number>),
    paramas
  ) as unknown as Promise<AuthApiResponse<unknown>>
}

export const FeatchRetrievePwd = async (
  captcha: string,
  key: string,
  phone: string,
  newPwd: string
) => {
  const paramas = {
    captcha,
    key,
    phone,
    pwd: pwdEncrypt(newPwd || '') || ''
  }
  const flatObj = getDecParams({})
  return retrievePwd(
    initParams(flatObj.signParams as Record<string, string | number>),
    paramas
  ) as unknown as Promise<AuthApiResponse<unknown>>
}

export const FeatchUsageRecord = async (paramas: object, featureName: string, userId: string) => {
  return addUserUsageRecord(paramas, featureName, userId)
}
