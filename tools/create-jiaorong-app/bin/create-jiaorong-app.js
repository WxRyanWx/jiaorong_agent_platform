#!/usr/bin/env node
/**
 * create-jiaorong-app 入口：问答式生成交融应用目录。
 *
 * 用法：
 *   jiaorong create app                       客户端 CLI 入口，问答式生成
 *   jiaorong create app my-app --no-ui        同上，带参数直接生成
 *   pnpm create jiaorong-app                  按当前目录名一路问答生成
 *   pnpm create jiaorong-app my-app           生成到 ./my-app
 *   npx create-jiaorong-app my-app --no-ui    不要官方 UI 组件，给极简对话页
 *   npx create-jiaorong-app my-app --yes      全用默认值，不问
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { CancelledError, askToggle } from '../lib/ask.js'
import { EXIT_CODES, UsageError } from '../lib/errors.js'
import { askConfig, defaultConfig, resolveDirName } from '../lib/prompts.js'
import { scaffold } from '../lib/scaffold.js'

/** 带值参数：命令行写法 → 配置字段。 */
const VALUE_FLAGS = {
  id: 'appId',
  name: 'appName',
  slot: 'slot',
  version: 'version',
  description: 'description',
  'agent-key': 'agentKey',
  'agent-name': 'agentName',
  'dev-port': 'devPort',
  port: 'bridgePort',
  'http-port': 'httpPort',
  pm: 'packageManager',
  entry: 'entry'
}

/** 开关参数：`--no-xxx` 关掉对应能力。 */
const NEGATIVE_FLAGS = {
  ui: 'withUi',
  router: 'withRouter',
  skill: 'withSkill',
  install: 'installDeps'
}

/** 帮助文本。 */
const HELP = `
create-jiaorong-app：生成交融应用目录

用法
  jiaorong create app [目录名] [选项]
  pnpm create jiaorong-app [目录名] [选项]
  npx create-jiaorong-app [目录名] [选项]

选项
  --id <应用 id>          小写字母、数字、单个横线，例如 my-app
  --name <应用名称>        客户端里显示的名字
  --slot <位置>           app-center（默认）或 menu
  --version <版本号>       默认 1.0.0
  --description <简介>     写进 app.json
  --agent-key <key>       智能体 key，默认 workbench
  --agent-name <名称>      智能体显示名，默认「应用名 + 助手」
  --dev-port <端口>        前端调试端口，默认 5174
  --port <端口>            本机服务桥端口，默认按应用 id 派生；HTTP 端口是它 +1
  --http-port <端口>       单独指定 HTTP 端口
  --entry <dev|build>     app.json 的 entry 写 web-ui/index.html（默认）还是调试地址 dev
  --no-ui                 不带官方 UI 组件，改用极简对话页
  --no-router             不带路由，App.vue 直接挂对话页
  --no-skill              不带技能模板
  --pm <包管理器>          pnpm（默认）/ npm / yarn / none
  --no-install            生成后不装依赖
  --yes, -y               全用默认值，不问；目录非空时也直接覆盖
  --help, -h              看这份说明

退出码
  0  全部成功
  1  目录已生成，但装依赖或构建失败，按打印出来的提示补跑
  2  参数不合法，或非交互终端下目录非空又没给 --yes
  7  用户取消
  8  目录没生成出来的其它失败
`

/**
 * 解析命令行参数。
 * @param argv `process.argv.slice(2)`
 * @returns `{ dirName, cliConfig, useDefaults, help }`
 */
const parseArgs = (argv) => {
  /** 目标目录名，取第一个不带横线的位置参数。 */
  let dirName = ''
  /** 命令行显式给了的配置，这些项不再问。 */
  const cliConfig = {}
  /** 是否跳过问答。 */
  let useDefaults = false
  /** 是否只看帮助。 */
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    /** 当前参数。 */
    const arg = argv[index]
    // 帮助与「全默认」两个短选项
    if (arg === '--help' || arg === '-h') help = true
    else if (arg === '--yes' || arg === '-y') useDefaults = true
    else if (!arg.startsWith('--')) {
      if (!dirName) dirName = arg
    } else {
      /** 参数名与内联值，支持 `--slot=menu` 这种写法。 */
      const [rawKey, inlineValue] = arg.slice(2).split('=')
      // --no-xxx 关掉开关
      if (rawKey.startsWith('no-') && NEGATIVE_FLAGS[rawKey.slice(3)]) {
        cliConfig[NEGATIVE_FLAGS[rawKey.slice(3)]] = false
        continue
      }
      /** 配置字段名。 */
      const key = VALUE_FLAGS[rawKey]
      if (!key) throw new UsageError(`不认识的选项 --${rawKey}，用 --help 看全部选项`)
      /** 值：内联写法优先，否则取下一个参数。 */
      const value = inlineValue ?? argv[index + 1]
      if (value === undefined || value.startsWith('--'))
        throw new UsageError(`--${rawKey} 后面要跟一个值`)
      if (inlineValue === undefined) index += 1
      // 端口类参数转成数字，其余原样存
      cliConfig[key] = key.endsWith('Port') ? Number(value) : value
    }
  }
  return { dirName, cliConfig, useDefaults, help }
}

/**
 * 主流程。
 * @returns 退出码，取值见 `lib/errors.js` 的 `EXIT_CODES`
 */
const main = async () => {
  /** 命令行解析结果。 */
  const { dirName, cliConfig, useDefaults, help } = parseArgs(process.argv.slice(2))
  if (help) {
    console.log(HELP)
    return EXIT_CODES.success
  }
  /** 目标目录名。 */
  const targetName = resolveDirName({ cliDirName: dirName, cwd: process.cwd() })
  /** 目标目录绝对路径。 */
  const projectDir = path.resolve(process.cwd(), targetName)
  // 目标已经是个文件：拷模板会 ENOTDIR，这是路径写错了，别报成内部错误
  if (existsSync(projectDir) && !statSync(projectDir).isDirectory()) {
    console.error(`${targetName} 已经是一个文件而不是目录，换一个目录名。`)
    return EXIT_CODES.usage
  }
  // 管道与 CI 里没有 TTY，问不了；先判定再去碰目录，否则覆盖确认会永远等不到输入
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  /** 目录是不是已经有内容：有就得先说清要不要覆盖。 */
  const isOccupied = existsSync(projectDir) && readdirSync(projectDir).length > 0

  // 非交互终端问不了「要不要覆盖」，没给 --yes 就直接判用法错误，别默默停在问答上
  if (isOccupied && !useDefaults && !isInteractive) {
    console.error(
      `${targetName} 已存在且不是空目录，非交互终端没法确认覆盖；加 --yes 直接覆盖，或换一个目录名。`
    )
    return EXIT_CODES.usage
  }
  // 交互终端里才问覆盖，避免盖掉别的项目；选「取消」或按 Ctrl+C 都算用户取消
  // --yes 是「不问」的意思，交互终端下也直接覆盖
  if (isOccupied && isInteractive && !useDefaults) {
    /** 用户的选择。 */
    const isOverwrite = await askToggle({
      message: `${targetName} 已存在且不是空目录，继续会覆盖同名文件`,
      active: '继续覆盖',
      inactive: '取消',
      initial: false
    })
    if (!isOverwrite) {
      console.log('已取消，没有改动任何文件。')
      return EXIT_CODES.cancelled
    }
  }

  /** 最终配置：--yes 与非交互终端都走默认值，否则问一遍。 */
  if (!useDefaults && !isInteractive) {
    console.log(
      '当前不是交互终端，按默认值生成；要逐项确认请在终端里重跑，或用命令行参数直接指定。'
    )
  }
  const config =
    useDefaults || !isInteractive
      ? defaultConfig({ cliConfig, dirName: targetName })
      : await askConfig({ cliConfig, dirName: targetName })
  /** 生成结果：到这一步目录已经落盘，剩下的只有装依赖与构建。 */
  const { installState, buildState } = scaffold({ projectDir, config })
  // 目录已经生成，只是依赖或构建没成：产物还在，按提示补跑即可，不能报成内部错误
  if (installState === 'failed' || buildState === 'failed') return EXIT_CODES.partial
  return EXIT_CODES.success
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    // 用户取消：问答阶段就退了，没有创建任何文件
    if (error instanceof CancelledError) {
      console.log('\n已取消，没有创建任何文件。')
      process.exitCode = EXIT_CODES.cancelled
      return
    }
    // 参数或归一化后的配置不合法：说清怎么改，别报成内部错误
    if (error instanceof UsageError) {
      console.error(`\n参数不合法：${error.message}`)
      console.error('用 --help 看全部选项。')
      process.exitCode = EXIT_CODES.usage
      return
    }
    console.error(`\n生成失败：${error?.message || error}`)
    process.exitCode = EXIT_CODES.internal
  })
