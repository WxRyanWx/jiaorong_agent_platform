/**
 * 自有后端 API 根地址（含 /deepchat-ext，不含 /api）。
 * 全自动：按 Vite mode 选择，日常无需任何 .env 配置。
 *   development（pnpm dev）/ test（build:test）→ 测试服
 *   production（pnpm build / 正式包）→ 正式服
 * 最终 baseURL = origin + '/api'
 */
export const AUTH_API_TEST_ORIGIN = 'http://106.63.7.106:10001'
export const AUTH_API_PROD_ORIGIN = 'https://c4ai.ccccltd.cn'

/** 旧 Web `/xk` 环境 Product-Id；与测试服 origin 成对 */
export const AUTH_API_TEST_PRODUCT_ID = '9e59fc68bbe539556206d9d3f6b973c1'
/** 正式服 Product-Id */
export const AUTH_API_PROD_PRODUCT_ID = 'f5831af6faf190db5f9818a1ab71d68c'

const AUTH_API_ORIGIN_BY_MODE: Record<string, string> = {
  development: AUTH_API_TEST_ORIGIN,
  test: AUTH_API_TEST_ORIGIN,
  production: AUTH_API_PROD_ORIGIN
}

/** 未匹配 mode 时的回退（正式服） */
export const DEFAULT_AUTH_API_ORIGIN = AUTH_API_PROD_ORIGIN
export const DEFAULT_AUTH_API_PRODUCT_ID = AUTH_API_PROD_PRODUCT_ID

export function resolveAuthMode(mode = import.meta.env.MODE || 'production'): string {
  return mode || 'production'
}

export function resolveAuthApiOrigin(mode = import.meta.env.MODE || 'production'): string {
  const resolved = resolveAuthMode(mode)
  return (AUTH_API_ORIGIN_BY_MODE[resolved] || DEFAULT_AUTH_API_ORIGIN).replace(/\/$/, '')
}

export function resolveAuthApiBaseUrl(mode = import.meta.env.MODE || 'production'): string {
  return `${resolveAuthApiOrigin(mode)}/api`
}

/** Product-Id 跟 origin 走，避免只改接口地址却仍带测试服 id */
export function resolveAuthProductId(mode = import.meta.env.MODE || 'production'): string {
  return resolveAuthApiOrigin(mode) === AUTH_API_TEST_ORIGIN
    ? AUTH_API_TEST_PRODUCT_ID
    : AUTH_API_PROD_PRODUCT_ID
}

/** 主进程 webRequest CORS filter，仅当前 mode 的私有 API origin */
export function listJiaorongPrivateApiCorsUrls(
  mode = import.meta.env.MODE || 'production'
): string[] {
  return [`${resolveAuthApiOrigin(mode)}/*`]
}
