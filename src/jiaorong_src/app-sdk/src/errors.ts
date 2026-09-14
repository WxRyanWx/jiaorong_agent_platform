/** SDK 错误码与 `JiaorongError`。宿主桥失败会转成这个类。 */

/** 稳定错误码。 */
export const ERROR_CODES = {
  /** 不在交融 webview / 未注入桥。 */
  NOT_IN_JIAORONG: 'NOT_IN_JIAORONG',
  /** 独立 Node 连不上正在运行的客户端。 */
  JIAORONG_NOT_RUNNING: 'JIAORONG_NOT_RUNNING',
  /** 应用不存在或不可见。 */
  APP_NOT_FOUND: 'APP_NOT_FOUND',
  /** 未登录。 */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 入参不合法。 */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 智能体不存在。 */
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  /** 会话不存在。 */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** 技能不存在。 */
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  /** 无权限或越权 appId。 */
  FORBIDDEN: 'FORBIDDEN',
  /** 当前不能插入引导。 */
  STEER_NOT_ALLOWED: 'STEER_NOT_ALLOWED',
  /** 生成失败。 */
  GENERATION_FAILED: 'GENERATION_FAILED',
  /** 超时。 */
  TIMEOUT: 'TIMEOUT',
  /** 连接已断开。 */
  DISCONNECTED: 'DISCONNECTED'
} as const

/** 错误码字面量。 */
export type JiaorongErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** SDK 抛出的错误，带 `code`。 */
export class JiaorongError extends Error {
  /** 稳定码。 */
  readonly code: JiaorongErrorCode

  /**
   * @param code 错误码
   * @param message 说明
   */
  constructor(code: JiaorongErrorCode, message: string) {
    super(message)
    this.name = 'JiaorongError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /** JSON 序列化。 */
  toJSON() {
    return { name: this.name, code: this.code, message: this.message }
  }
}

/**
 * 是否为 SDK 错误（含跨 realm 的同名 Error）。
 * @param error 未知值
 */
export function isJiaorongError(error: unknown): error is JiaorongError {
  if (error instanceof JiaorongError) return true
  return (
    error instanceof Error &&
    error.name === 'JiaorongError' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

/**
 * 把未知失败收成 `JiaorongError`。
 * @param error invoke reject 或任意 throw
 */
export function toJiaorongError(error: unknown): JiaorongError {
  if (isJiaorongError(error)) {
    return error instanceof JiaorongError
      ? error
      : new JiaorongError((error as { code: JiaorongErrorCode }).code, error.message)
  }
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    /** 桥返回的 code。 */
    const code = String((error as { code: unknown }).code) as JiaorongErrorCode
    /** 桥返回的 message。 */
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
