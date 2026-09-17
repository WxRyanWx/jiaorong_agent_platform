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
  // null / undefined 原样返回
  if (value == null) return value
  // 字符串：超长则截断并标注被截掉的长度
  if (typeof value === 'string') {
    // 未超长，直接返回
    if (value.length <= MAX_STRING) return value
    return `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})`
  }
  // 数字 / 布尔 / 函数等非对象，原样返回
  if (typeof value !== 'object') return value
  // Error 只留 name / message，不把堆栈打进控制台
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    }
  }
  // 循环引用
  if (seen.has(value)) return '[Circular]'
  // 超出展开深度
  if (depth >= MAX_DEPTH) return '[…]'
  seen.add(value)
  try {
    // 数组：截断到 MAX_ARRAY 项，并逐项递归脱敏
    if (Array.isArray(value)) {
      /** 截断后的数组。 */
      const items = value
        .slice(0, MAX_ARRAY)
        .map((item) => redactJiaorongSdkDebugValue(item, seen, depth + 1))
      // 被截掉的项数补一条提示
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
        // 敏感字段打码，其余递归脱敏
        record[key] = SENSITIVE_KEY.test(key)
          ? '[redacted]'
          : redactJiaorongSdkDebugValue(nested, seen, depth + 1)
      } catch {
        // getter 抛错等：标记该字段不可读，不影响其它字段
        record[key] = '[unreadable]'
      }
    }
    return record
  } catch {
    // 整体序列化失败的兜底
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
    // 无 payload 时只打 kind / label
    if (payload === undefined) {
      console.log(JIAORONG_SDK_DEBUG_PREFIX, kind, label)
      return
    }
    // 有 payload：脱敏后再打
    console.log(JIAORONG_SDK_DEBUG_PREFIX, kind, label, redactJiaorongSdkDebugValue(payload))
  } catch {
    // 调试日志不能让 invoke / 事件回调失败
  }
}
