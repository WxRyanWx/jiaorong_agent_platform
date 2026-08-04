import type { InternalAxiosRequestConfig } from 'axios'
import { isTrue } from './rules'

const debounceRequest = (config: InternalAxiosRequestConfig) => {
  // FormData 须由浏览器自动设置 multipart boundary，不能沿用默认 application/json
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type')
  }

  config.headers.set('Fusion-Auth', localStorage.getItem('xkaitoken') || '')
  config.headers.set(
    'Product-Id',
    isTrue() ? '9e59fc68bbe539556206d9d3f6b973c1' : 'f5831af6faf190db5f9818a1ab71d68c'
  )
  return config
}

export default debounceRequest
