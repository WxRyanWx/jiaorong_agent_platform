/**
 * 自有后端 API 根地址（含 /deepchat-ext，不含 /api）。
 * 全自动：按 Vite mode 选择，日常无需任何 .env 配置。
 *   development（pnpm dev）/ test（build:test）→ 测试服
 *   production（pnpm build / 正式包）→ 正式服
 * 最终 baseURL = origin + '/api'
 */
const AUTH_API_TEST_ORIGIN = 'http://106.63.7.106:10001'
const AUTH_API_PROD_ORIGIN = 'https://c4ai.ccccltd.cn'

const AUTH_API_ORIGIN_BY_MODE: Record<string, string> = {
  development: AUTH_API_TEST_ORIGIN,
  test: AUTH_API_TEST_ORIGIN,
  production: AUTH_API_PROD_ORIGIN
}

/** 未匹配 mode 时的回退（正式服） */
export const DEFAULT_AUTH_API_ORIGIN = AUTH_API_PROD_ORIGIN

export function resolveAuthApiOrigin(): string {
  const mode = import.meta.env.MODE || 'production'
  return (AUTH_API_ORIGIN_BY_MODE[mode] || DEFAULT_AUTH_API_ORIGIN).replace(/\/$/, '')
}

export function resolveAuthApiBaseUrl(): string {
  return `${resolveAuthApiOrigin()}/api`
}
