import { clearAuthStorage } from '../../api/auth/utils/local'
import { schedulePersistAuthSession, TOKEN_ISSUED_AT_STORAGE_KEY } from './persist'

export const getToken = () => {
  return localStorage.getItem('xkaitoken')
}

export const setToken = (token: string) => {
  localStorage.setItem('xkaitoken', token)
  // 记录签发时间，供非 JWT「签发超过 2 天」主动换新判断
  localStorage.setItem(TOKEN_ISSUED_AT_STORAGE_KEY, String(Date.now()))
  schedulePersistAuthSession()
}

/** token 签发时间戳（毫秒）；0 表示未记录（老版本升级） */
export const getTokenIssuedAt = () => {
  return Number(localStorage.getItem(TOKEN_ISSUED_AT_STORAGE_KEY)) || 0
}

export const setUserInfoRecords = (data: unknown) => {
  const json = JSON.stringify(data)
  localStorage.setItem('userFullInfo', json)
  localStorage.setItem('userInfo', json)
  schedulePersistAuthSession()
}

export const getUserInfo = () => {
  return (
    (localStorage.getItem('userFullInfo') && JSON.parse(localStorage.getItem('userFullInfo')!)) || {
      orgList: [{}]
    }
  )
}

/** 与 clearAuthStorage 同一套：token + userInfo + userFullInfo */
export const clearOutLocal = clearAuthStorage
