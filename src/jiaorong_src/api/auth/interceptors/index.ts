import axios, { type AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
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

/** 鉴权请求配置扩展：重试守卫与静默续期标记 */
export type AuthAwareRequestConfig = InternalAxiosRequestConfig & {
  authRetried?: boolean
  authRefreshRequest?: boolean
}

/** 静默续期处理器：由 auth setup 注入，避免拦截器与续期模块循环依赖 */
let renewHandler: (() => Promise<unknown>) | null = null

/**
 * 注入静默续期处理器，传 null 解除。
 * @param handler 续期函数，resolve 表示新 token 已落盘
 */
export function setAuthRenewHandler(handler: (() => Promise<unknown>) | null) {
  renewHandler = handler
}

/** 登录体系 8000000；技能市场等业务接口常用 200 */
const API_SUCCESS_CODES = new Set([200, 8000000])

export function isAuthApiSuccessCode(code: unknown): boolean {
  return code != null && code !== '' && API_SUCCESS_CODES.has(Number(code))
}

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
  if (code != null && code !== '' && !isAuthApiSuccessCode(code)) {
    callback()
  }
  return response.data
}

/**
 * 确认过期：闸门内 callback 跳登录一次，并清本地登录态。
 * @param error 原始 401 错误
 * @param callback 鉴权响应回调
 */
function rejectAsExpired(error: AxiosError, callback: AuthResponseCallback) {
  if (!isTokenExpired) {
    isTokenExpired = true
    // 5 = 过期：提示 + 跳登录；闸门期内不再重复 callback
    callback(5)
    setTimeout(() => {
      isTokenExpired = false
    }, 3000)
  }
  clearAuthStorage()
  return Promise.reject(error)
}

export const responseErrorFn = (error: AxiosError, callback: AuthResponseCallback) => {
  /** 带鉴权标记的请求配置 */
  const config = error.config as AuthAwareRequestConfig | undefined
  // 静默续期请求自身的非 401 失败（网络抖动等）：不打扰用户
  if (config?.authRefreshRequest && error.response?.status !== 401) {
    return Promise.reject(error)
  }
  if (error.response?.status === 401) {
    // 可续期且未重试过：换一次 token 并用新 token 重放原请求
    if (renewHandler && config && !config.authRetried && !config.authRefreshRequest) {
      config.authRetried = true
      return renewHandler().then(
        () => api.request(config),
        (renewError: unknown) => {
          // 续期本身被服务端 401 拒绝才算真过期；网络等瞬时失败原样返回原错误
          if ((renewError as AxiosError)?.response?.status === 401) {
            return rejectAsExpired(error, callback)
          }
          return Promise.reject(error)
        }
      )
    }
    return rejectAsExpired(error, callback)
  }
  const responseData = error.response?.data as
    | { code?: number | string; message?: string }
    | undefined
  const bizCode = responseData?.code
  if (error.response && bizCode != null && bizCode !== '' && !isAuthApiSuccessCode(bizCode)) {
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
