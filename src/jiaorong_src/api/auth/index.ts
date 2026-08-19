export { api, responseFn, responseErrorFn, isAuthApiSuccessCode } from './interceptors'
export type { AuthResponseCallback } from './interceptors'
export {
  DEFAULT_AUTH_API_ORIGIN,
  DEFAULT_AUTH_API_PRODUCT_ID,
  listJiaorongPrivateApiCorsUrls,
  resolveAuthApiBaseUrl,
  resolveAuthApiOrigin,
  resolveAuthProductId
} from './config'
export * from './loginService'
