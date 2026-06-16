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

export const responseFn = (response: AxiosResponse, callback: () => void) => {
  if (response.config?.headers?.dontShowMessage) {
    return response.data
  }
  if (!response.data.status && isStandardUrl.includes(response.config?.url ?? '')) {
    callback()
  }
  if (response?.data?.code && response.data.code !== 8000000) {
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
  const responseData = error.response?.data as { code?: number; message?: string } | undefined
  if (error.response && responseData?.code && responseData.code !== 800000) {
    if (responseData.code === -8000150) {
      callback(1)
    } else {
      callback(2)
      clearAuthStorage()
    }
    callback(3)
  } else {
    callback(4)
  }
  return Promise.reject(error)
}

export default api
export { api }
