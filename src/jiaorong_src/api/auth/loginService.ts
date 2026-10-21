import { pwdEncrypt } from './utils/pwd'
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

export const FeatchLogin = async (phone: string, password: string, captchaKey?: string) => {
  const params = {
    phone: phone || '',
    password: (await pwdEncrypt(password || '')) || '',
    captchaKey
  }
  return postLogin(params) as unknown as Promise<AuthApiResponse<LoginSuccessData>>
}

export const sendCaptcha = async (phone: string) => {
  return getCaptcha(phone) as unknown as Promise<AuthApiResponse<string>>
}

export const checkCode = async (phone: string, captchaKey: string, captchaValue: string) => {
  const paramas = {
    phone: phone || '',
    captchaCode: captchaValue || '',
    captchaKey: captchaKey || ''
  }
  return postCode(paramas) as unknown as Promise<AuthApiResponse<CaptchaCheckData>>
}

export const FeatchExit = async () => {
  return oauthExitRes()
}

export const FeatchUserInfo = async (
  _userName?: string,
  options?: { silent?: boolean; timeout?: number }
) => {
  return getUserInfo(options) as unknown as Promise<AuthApiResponse<UserInfoData>>
}

export const FeatchUpdatePwd = async (newPwd: string, key: string) => {
  const paramas = {
    newPwd: (await pwdEncrypt(newPwd || '')) || '',
    key
  }
  return updatePwd(paramas) as unknown as Promise<AuthApiResponse<unknown>>
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
    pwd: (await pwdEncrypt(newPwd || '')) || ''
  }
  return retrievePwd(paramas) as unknown as Promise<AuthApiResponse<unknown>>
}

export const FeatchUsageRecord = async (paramas: object, featureName: string, userId: string) => {
  return addUserUsageRecord(paramas, featureName, userId)
}
