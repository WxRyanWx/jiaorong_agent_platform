import { clearAuthStorage } from '../../api/auth/utils/local'

export const getToken = () => {
  return localStorage.getItem('xkaitoken')
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
