/**
 * 错误文案（不带官方 UI 组件的精简版）。
 * 官方组件那份带完整的宿主错误码中文映射，需要时从示例应用 `app-scaffold/web/src/lib/errorText.ts` 拷回。
 */

/** 网络失败的英文原文，浏览器 fetch 失败时就是这几种。 */
const NETWORK_RE = /failed to fetch|load failed|fetch failed|networkerror/i

/**
 * 把任意失败收成用户可见的中文文案。
 * @param error 抛出的值
 * @returns 短文案
 */
export function formatError(error: unknown): string {
  /** 原始文案。 */
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: string })?.message || '请求失败')
  if (NETWORK_RE.test(message)) return '无法连接本机服务'
  return message.trim() || '请求失败'
}
