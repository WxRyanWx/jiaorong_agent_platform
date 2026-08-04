import axios, { type AxiosError, type AxiosResponse } from 'axios'
import { clearAuthStorage } from '../utils/local'
import { isStandardUrl } from './rules'
import debounceRequest from './debounce-request'
import { resolveAuthApiBaseUrl } from '../config'

let isTokenExpired = false

const api = axios.create({
  baseURL: resolveAuthApiBaseUrl(),
  timeout: 150000,
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use(
  (config) => debounceRequest(config),
  (error) => Promise.reject(error)
)

export type AuthResponseCallback = (code: number) => void

/** 登录体系 8000000；技能市场等业务接口常用 200 */
const API_SUCCESS_CODES = new Set([200, 8000000])

/** 需跳转登录但不强制清 token 的业务码（账号禁用等） */
const AUTH_REDIRECT_CODES = new Set([-8000150])

export const responseFn = (response: AxiosResponse, callback: () => void) => {
  if (response.config?.headers?.dontShowMessage) {
    return response.data
  }
  if (!response.data.status && isStandardUrl.includes(response.config?.url ?? '')) {
    callback()
  }
  const code = response?.data?.code
  if (code != null && code !== '' && !API_SUCCESS_CODES.has(Number(code))) {
    callback()
  }
  return response.data
}

export const responseErrorFn = (error: AxiosError, callback: AuthResponseCallback) => {
  if (error.response?.status === 401) {
    if (!isTokenExpired) {
      isTokenExpired = true
      callback(5)
      setTimeout(() => {
        isTokenExpired = false
      }, 3000)
    }
    callback(2)
    clearAuthStorage()
    return Promise.reject(error)
  }
  const responseData = error.response?.data as
    | { code?: number | string; message?: string }
    | undefined
  const bizCode = responseData?.code
  if (
    error.response &&
    bizCode != null &&
    bizCode !== '' &&
    !API_SUCCESS_CODES.has(Number(bizCode))
  ) {
    if (AUTH_REDIRECT_CODES.has(Number(bizCode))) {
      // 账号类业务码：跳登录，不清本地 token（与历史 -8000150 行为一致）
      callback(1)
    }
    // 其它业务/HTTP 错误：仅提示，避免误清登录态
    callback(3)
  } else {
    callback(4)
  }
  return Promise.reject(error)
}

export default api
export { api }
