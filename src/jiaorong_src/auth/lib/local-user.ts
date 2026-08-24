import { clearAuthStorage } from '../../api/auth/utils/local'
import { schedulePersistAuthSession } from './persist'

export const getToken = () => {
  return localStorage.getItem('xkaitoken')
}

export const setToken = (token: string) => {
  localStorage.setItem('xkaitoken', token)
  schedulePersistAuthSession()
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
