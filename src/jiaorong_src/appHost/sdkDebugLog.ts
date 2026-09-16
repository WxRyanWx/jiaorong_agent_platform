/** 把桥调用打到 guest 控制台时的脱敏与截断。 */

/** 控制台前缀，方便 Filter。 */
export const JIAORONG_SDK_DEBUG_PREFIX = '[jiaorong-app]'

/** 不当原文打出的字段名。 */
const SENSITIVE_KEY =
  /^(token|password|authorization|xkaitoken|secret|apiKey|api_key|fusion-auth|access_token|accessToken)$/i

/** 单段字符串最长，避免流式块撑爆 DevTools。 */
const MAX_STRING = 2000
/** 数组最多打印几项。 */
const MAX_ARRAY = 40
/** 对象展开深度。 */
const MAX_DEPTH = 8

/**
 * 脱敏并截断，供 `console.log` 使用。
 * @param value invoke 入参、出参或事件 payload
 * @param seen 循环引用
 * @param depth 当前深度
 */
export function redactJiaorongSdkDebugValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    if (value.length <= MAX_STRING) return value
    return `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})`
  }
  if (typeof value !== 'object') return value
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    }
  }
  if (seen.has(value)) return '[Circular]'
  if (depth >= MAX_DEPTH) return '[…]'
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      /** 截断后的数组。 */
      const items = value
        .slice(0, MAX_ARRAY)
        .map((item) => redactJiaorongSdkDebugValue(item, seen, depth + 1))
      if (value.length > MAX_ARRAY) items.push(`…(+${value.length - MAX_ARRAY})`)
      return items
    }
    /** 脱敏后的对象。 */
    const record: Record<string, unknown> = {}
    /** 一对字段。 */
    for (const key of Object.keys(value as object)) {
      try {
        /** 当前字段值。 */
        const nested = (value as Record<string, unknown>)[key]
        record[key] = SENSITIVE_KEY.test(key)
          ? '[redacted]'
          : redactJiaorongSdkDebugValue(nested, seen, depth + 1)
      } catch {
        record[key] = '[unreadable]'
      }
    }
    return record
  } catch {
    return '[unserializable]'
  }
}

/**
 * 打一条桥调试日志。
 * @param kind `invoke` / `invoke:ok` / `invoke:err` / `event`
 * @param label 方法名或事件名
 * @param payload 入参、出参或事件体
 */
export function logJiaorongSdkDebug(kind: string, label: string, payload?: unknown): void {
  try {
    if (payload === undefined) {
      console.log(JIAORONG_SDK_DEBUG_PREFIX, kind, label)
      return
    }
    console.log(JIAORONG_SDK_DEBUG_PREFIX, kind, label, redactJiaorongSdkDebugValue(payload))
  } catch {
    // 调试日志不能让 invoke / 事件回调失败
  }
}
