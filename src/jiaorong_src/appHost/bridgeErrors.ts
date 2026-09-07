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

export type JiaorongBridgeErrorCode = (typeof JIAORONG_BRIDGE_ERROR_CODES)[number]

export type JiaorongBridgeError = {
  code: JiaorongBridgeErrorCode
  message: string
}

const ERROR_CODE_SET = new Set<string>(JIAORONG_BRIDGE_ERROR_CODES)

export function bridgeError(code: JiaorongBridgeErrorCode, message: string): JiaorongBridgeError {
  return { code, message }
}

export function isJiaorongBridgeFailure(value: unknown): value is JiaorongBridgeError {
  if (!value || typeof value !== 'object') return false
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
