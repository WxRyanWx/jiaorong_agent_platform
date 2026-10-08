/**
 * 脚手架的失败分类与退出码。
 *
 * 客户端 CLI（`src/cli/createApp.ts`）按同一套数字原样往上传，
 * 所以「用户取消」与「参数不合法」不会在 CLI 门口被统一收成内部错误。
 * 数字与 `src/cli/errors.ts` 的 `CLI_EXIT_CODES` 保持一致。
 */

/** 退出码。 */
export const EXIT_CODES = {
  /** 全部成功。 */
  success: 0,
  /** 目录已生成，但装依赖或构建失败：产物还在，剩下的步骤要开发者自己补。 */
  partial: 1,
  /** 参数不合法，或非交互终端下目录非空又没给 `--yes`。 */
  usage: 2,
  /** 用户主动取消。 */
  cancelled: 7,
  /** 目录没生成出来的其它失败。 */
  internal: 8
}

/** 用法错误：参数或归一化后的配置不合法，退出码固定 `usage`。 */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}
