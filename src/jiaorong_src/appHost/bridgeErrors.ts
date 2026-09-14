/** 应用桥失败码。IPC 用 `{ code, message }` 表示失败，不要和成功 payload 混用同名字段。 */

/** 宿主与 SDK 共用的失败码列表。 */
export const JIAORONG_BRIDGE_ERROR_CODES = [
  'NOT_IN_JIAORONG',
  'JIAORONG_NOT_RUNNING',
  'APP_NOT_FOUND',
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'AGENT_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'SKILL_NOT_FOUND',
  'FORBIDDEN',
  'STEER_NOT_ALLOWED',
  'GENERATION_FAILED',
  'TIMEOUT'
] as const

/** 桥失败码字面量。 */
export type JiaorongBridgeErrorCode = (typeof JIAORONG_BRIDGE_ERROR_CODES)[number]

/** IPC / Node 桥返回的失败对象。 */
export type JiaorongBridgeError = {
  /** 稳定错误码，SDK 会映射成 `JiaorongError.code`。 */
  code: JiaorongBridgeErrorCode
  /** 给人看的说明。 */
  message: string
}

/** 用于 `isJiaorongBridgeFailure` 的码表。 */
const ERROR_CODE_SET = new Set<string>(JIAORONG_BRIDGE_ERROR_CODES)

/**
 * 构造桥失败对象，供 `ipcMain.handle` 直接 return（不要 throw 到渲染进程）。
 * @param code 失败码
 * @param message 说明
 */
export function bridgeError(code: JiaorongBridgeErrorCode, message: string): JiaorongBridgeError {
  return { code, message }
}

/**
 * 判断 IPC 结果是失败还是成功 payload。带 `session` / `ok` 等字段的视为成功。
 * @param value `invoke` 的原始返回
 */
export function isJiaorongBridgeFailure(value: unknown): value is JiaorongBridgeError {
  if (!value || typeof value !== 'object') return false
  /** 候选失败对象。 */
  const record = value as Record<string, unknown>
  return (
    typeof record.code === 'string' &&
    ERROR_CODE_SET.has(record.code) &&
    typeof record.message === 'string' &&
    record.session === undefined &&
    record.agents === undefined &&
    record.items === undefined &&
    record.ok === undefined &&
    record.accepted === undefined &&
    record.hidden === undefined
  )
}
