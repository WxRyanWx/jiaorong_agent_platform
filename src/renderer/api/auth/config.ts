/** 桥接登录 API 生产环境地址（暂无测试环境，开发与打包统一使用） */
export const DEFAULT_AUTH_API_ORIGIN = 'https://c4ai.ccccltd.cn'

export function resolveAuthApiBaseUrl(): string {
  const origin = (import.meta.env.VITE_AUTH_API_ORIGIN || DEFAULT_AUTH_API_ORIGIN).replace(
    /\/$/,
    ''
  )
  return `${origin}/api`
}
