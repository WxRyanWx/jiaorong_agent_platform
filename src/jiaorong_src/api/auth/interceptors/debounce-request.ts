import type { InternalAxiosRequestConfig } from 'axios'
import { resolveAuthProductId } from '../config'

const debounceRequest = (config: InternalAxiosRequestConfig) => {
  // FormData 须由浏览器自动设置 multipart boundary，不能沿用默认 application/json
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type')
  }

  config.headers.set('Fusion-Auth', localStorage.getItem('xkaitoken') || '')
  config.headers.set('Product-Id', resolveAuthProductId())
  return config
}

export default debounceRequest
