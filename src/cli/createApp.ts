/**
 * `jiaorong create app`：本地脚手架命令，不经本地控制面，客户端没启动也能用。
 *
 * 生成逻辑与模板都在 `create-jiaorong-app` 包里（同一份代码后续也发 npm），
 * 这里只负责定位入口并用当前 Node 把它跑起来：stdio 直接继承，交互问答才能正常工作。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLI_EXIT_CODES, type CliExitCode } from './errors'

/** 显式指定脚手架入口的环境变量，供测试与本地开发覆盖查找结果。 */
export const CREATE_APP_ENTRY_ENV = 'JIAORONG_CREATE_APP_ENTRY'

/** CLI 认得的退出码值域：脚手架与 CLI 共用一套数字，落在里面的原样往上传。 */
const KNOWN_EXIT_CODES: ReadonlySet<number> = new Set<number>(Object.values(CLI_EXIT_CODES))

/**
 * 把脚手架的退出码映射成 CLI 退出码。
 *
 * 「用户取消」「参数不合法」「生成了但装依赖失败」都是脚手架已经分好类的结果，
 * 统一收成 internal 会让调用方分不清该重试还是该改参数，所以只兜住认不出的码。
 * @param status 子进程退出码，被信号终止时是 null
 * @returns CLI 退出码
 */
const toCliExitCode = (status: number | null): CliExitCode => {
  if (status !== null && KNOWN_EXIT_CODES.has(status)) return status as CliExitCode
  return CLI_EXIT_CODES.internal
}

/** 脚手架入口相对查找根的子路径：打包后在资源目录，开发态在仓库里。 */
const ENTRY_CANDIDATES: readonly string[] = [
  'create-jiaorong-app/bin/create-jiaorong-app.js',
  'tools/create-jiaorong-app/bin/create-jiaorong-app.js'
]

export type CreateAppDependencies = Readonly<{
  env?: NodeJS.ProcessEnv
  /** CLI 模块所在目录，默认取本文件的运行时位置。 */
  cliDirectory?: string
  /** 执行脚手架用的 Node，默认取当前进程。 */
  execPath?: string
  writeError?: (message: string) => void
  spawn?: typeof spawnSync
}>

/**
 * 定位脚手架入口。
 *
 * 打包后 CLI 在 `<resources>/app.asar.unpacked/cli/deepchat.mjs`，脚手架在
 * `<resources>/create-jiaorong-app/`；开发态 CLI 在 `<repo>/out/cli/`，脚手架在
 * `<repo>/tools/create-jiaorong-app/`。两种布局都在 CLI 目录的上两级，所以共用一个查找根。
 *
 * @param dependencies 环境、CLI 目录与文件系统探测函数
 * @returns 入口绝对路径，找不到返回 null
 */
export function resolveCreateAppEntry(dependencies: CreateAppDependencies = {}): string | null {
  const env = dependencies.env ?? process.env
  /** 环境变量显式指定的入口。 */
  const override = env[CREATE_APP_ENTRY_ENV]?.trim()
  if (override) return existsSync(override) ? override : null
  const cliDirectory = dependencies.cliDirectory ?? path.dirname(fileURLToPath(import.meta.url))
  /** 查找根：CLI 目录的上两级。 */
  const baseDirectory = path.resolve(cliDirectory, '..', '..')
  for (const candidate of ENTRY_CANDIDATES) {
    /** 候选入口。 */
    const entry = path.join(baseDirectory, candidate)
    if (existsSync(entry)) return entry
  }
  return null
}

/**
 * 跑脚手架生成应用目录。
 * @param argv `create app` 之后的原始参数，原样交给脚手架
 * @param dependencies 运行环境依赖
 * @returns CLI 退出码
 */
export function runCreateApp(
  argv: readonly string[],
  dependencies: CreateAppDependencies = {}
): CliExitCode {
  const writeError =
    dependencies.writeError ?? ((message: string) => process.stderr.write(`${message}\n`))
  /** 脚手架入口。 */
  const entry = resolveCreateAppEntry(dependencies)
  if (!entry) {
    writeError('JiaorongAI app scaffold is unavailable in this installation.')
    return CLI_EXIT_CODES.unavailable
  }
  /** 子进程结果：stdio 继承，问答与日志直接走当前终端。 */
  const result = (dependencies.spawn ?? spawnSync)(
    dependencies.execPath ?? process.execPath,
    [entry, ...argv],
    { stdio: 'inherit' }
  )
  // 起不来（例如 Node 不可执行）算内部错误
  if (result.error) {
    writeError(`JiaorongAI app scaffold failed to start: ${result.error.message}`)
    return CLI_EXIT_CODES.internal
  }
  return toCliExitCode(result.status)
}
