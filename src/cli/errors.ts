import type { LocalControlError, LocalControlErrorCode } from '@shared/contracts/localControl'

const MAX_CLI_ERROR_MESSAGE_LENGTH = 4_096

/**
 * 稳定退出码。
 *
 * `partial` 只有本地命令 `create app` 会返回：目录已经生成，只是装依赖或构建失败。
 * 脚手架（`tools/create-jiaorong-app/lib/errors.js`）用同一套数字，CLI 原样往上传。
 */
export const CLI_EXIT_CODES = {
  success: 0,
  partial: 1,
  usage: 2,
  unavailable: 3,
  authorization: 4,
  approval: 5,
  domain: 6,
  cancelled: 7,
  internal: 8
} as const

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES]

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export class CliClientError extends Error {
  constructor(
    readonly code: LocalControlErrorCode,
    message: string,
    readonly exitCode: CliExitCode,
    readonly retriable = false
  ) {
    super(
      (message.length > 0 ? message : 'CLI request failed').slice(0, MAX_CLI_ERROR_MESSAGE_LENGTH)
    )
    this.name = 'CliClientError'
  }
}

export function exitCodeForRemoteError(error: LocalControlError): CliExitCode {
  switch (error.code) {
    case 'authentication_failed':
    case 'permission_denied':
      return CLI_EXIT_CODES.authorization
    case 'approval_denied':
    case 'approval_timeout':
      return CLI_EXIT_CODES.approval
    case 'cancelled':
    case 'timeout':
      return CLI_EXIT_CODES.cancelled
    case 'unsupported_version':
    case 'unavailable':
      return CLI_EXIT_CODES.unavailable
    case 'invalid_request':
      return CLI_EXIT_CODES.usage
    case 'internal_error':
      return CLI_EXIT_CODES.internal
    default:
      return CLI_EXIT_CODES.domain
  }
}
