export const ERROR_CODES = {
  NOT_IN_JIAORONG: 'NOT_IN_JIAORONG',
  JIAORONG_NOT_RUNNING: 'JIAORONG_NOT_RUNNING',
  APP_NOT_FOUND: 'APP_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  STEER_NOT_ALLOWED: 'STEER_NOT_ALLOWED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  DISCONNECTED: 'DISCONNECTED'
} as const

export type JiaorongErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export class JiaorongError extends Error {
  readonly code: JiaorongErrorCode

  constructor(code: JiaorongErrorCode, message: string) {
    super(message)
    this.name = 'JiaorongError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message }
  }
}

export function isJiaorongError(error: unknown): error is JiaorongError {
  if (error instanceof JiaorongError) return true
  return (
    error instanceof Error &&
    error.name === 'JiaorongError' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

export function toJiaorongError(error: unknown): JiaorongError {
  if (isJiaorongError(error)) {
    return error instanceof JiaorongError
      ? error
      : new JiaorongError((error as { code: JiaorongErrorCode }).code, error.message)
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const code = String((error as { code: unknown }).code) as JiaorongErrorCode
    const message = String((error as { message: unknown }).message)
    if (code in ERROR_CODES || Object.values(ERROR_CODES).includes(code)) {
      return new JiaorongError(code, message)
    }
  }
  if (error instanceof Error) {
    return new JiaorongError('GENERATION_FAILED', error.message)
  }
  return new JiaorongError('GENERATION_FAILED', String(error))
}
