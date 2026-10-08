/**
 * 生成流程：拷模板 → 按开关裁剪 → 写入配置 → 装依赖 → 打印下一步。
 * 模板内容就是包内示例应用 `app-scaffold/`：唯一内容源，没有同步产物。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyVariants } from './prune.js'
import { applyConfig } from './replace.js'

/** 本包目录。 */
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** 示例应用源目录：脚手架唯一的内容源，与生成器同包维护。 */
const sourceDir = path.join(packageDir, 'app-scaffold')
/** 拷贝时跳过的目录：依赖、构建产物与本地运行目录不属于模板。 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'web-ui', 'run', 'logs', '.git', 'vendor'])
/** 拷贝时跳过的文件：系统垃圾文件。 */
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db'])

/**
 * 判断一个路径要不要拷进项目。
 * @param source 源路径
 */
const shouldCopy = (source) => {
  /** 文件或目录名。 */
  const name = path.basename(source)
  if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) return false
  // 压缩包与本地打好的 tgz 都不属于模板
  return !name.endsWith('.zip') && !name.endsWith('.tgz')
}

/**
 * 拷示例应用到目标目录，并把 `_gitignore` 改回 `.gitignore`。
 * @param options projectDir 目标目录
 */
const copyTemplate = ({ projectDir }) => {
  // 来源不在就直接失败，别生成一份空项目
  if (!existsSync(sourceDir)) {
    throw new Error(`示例应用模板不存在：${sourceDir}，包不完整`)
  }
  // force: true 是默认值，这里写明「覆盖同名文件」是有意为之：非空目录确认过才走到这一步
  cpSync(sourceDir, projectDir, { recursive: true, force: true, filter: shouldCopy })
  /** npm 发包会吃掉点文件，所以包内叫 `_gitignore`，落盘再改回来。 */
  const renamed = path.join(projectDir, '_gitignore')
  if (existsSync(renamed)) renameSync(renamed, path.join(projectDir, '.gitignore'))
}

/**
 * 跑一次包管理器命令，失败时把原因打出来。
 * @param options cwd 工作目录；packageManager 包管理器；args 命令参数；label 这一步叫什么
 * @returns 成功返回 true
 */
const runPackageManager = ({ cwd, packageManager, args, label }) => {
  /** 子进程结果：stdio 继承，输出直接进当前终端。 */
  const result = spawnSync(packageManager, args, {
    cwd,
    stdio: 'inherit',
    // Windows 下 pnpm / yarn 是 .cmd，必须走 shell
    shell: process.platform === 'win32'
  })
  // 起不来（没装这个包管理器）时 status 是 null，真正的原因只在 error 里
  if (result.error) {
    console.error(`\n${label}起不来：${result.error.message}`)
    return false
  }
  if (result.status !== 0) {
    // status 是 null 说明子进程被信号带走，例如 Ctrl+C 打到了整个进程组
    const reason =
      result.status === null ? `被信号 ${result.signal} 打断` : `退出码 ${result.status}`
    console.error(`\n${label}失败，${reason}`)
    return false
  }
  return true
}

/**
 * 装依赖：`web` 与 `node` 各装一次。
 * @param options projectDir 项目目录；packageManager 包管理器
 * @returns 全部成功返回 true
 */
const installDeps = ({ projectDir, packageManager }) => {
  for (const dir of ['web', 'node']) {
    /** 这一个子项目装完没有。 */
    const isInstalled = runPackageManager({
      cwd: path.join(projectDir, dir),
      packageManager,
      args: ['install'],
      label: `${dir} 装依赖`
    })
    if (!isInstalled) return false
  }
  return true
}

/**
 * 构建前端产物到 web-ui/：entry 默认指向它，构建完创建即可直接打开。
 * @param options projectDir 项目目录；packageManager 包管理器
 * @returns 构建成功返回 true
 */
const buildWeb = ({ projectDir, packageManager }) =>
  runPackageManager({
    cwd: path.join(projectDir, 'web'),
    packageManager,
    args: ['run', 'build'],
    label: '前端构建'
  })

/**
 * 打印下一步该做什么。
 * @param options projectDir 项目目录；config 问答结果；installed 依赖是否已装好；built web-ui 是否已构建
 */
const printNextSteps = ({ projectDir, config, installed, built }) => {
  /** 当前目录到项目的相对路径；项目不在当前目录下面时相对路径会是一串 `../`，改用绝对路径。 */
  const relative = path.relative(process.cwd(), projectDir)
  /** 打印用的项目路径。 */
  const target = relative && !relative.startsWith('..') ? relative : projectDir
  /** 包管理器命令。 */
  const pm = config.packageManager === 'none' ? 'pnpm' : config.packageManager
  /** 调试地址：entry 切成 dev 时才用得上。 */
  const devUrl = `http://127.0.0.1:${config.devPort}/`
  /** entry 当前指向。 */
  const entryText = config.entry === 'dev' ? `${devUrl}（调试）` : 'web-ui/index.html'
  /** web-ui 状态行：只有 entry 指向它时才关心。 */
  const webUiLine =
    config.entry === 'build'
      ? `  web-ui      ${built ? '已构建好，可直接打开' : `未构建，打开前先跑 ${pm} run build`}\n`
      : ''
  /** 还剩哪些命令要补跑：装依赖、构建、起 dev，做完的不再提示。 */
  const nextSteps = []
  // 三个入口都在 web 里，只要有一件没做完就先 cd 过去
  if (!installed || !built || config.entry === 'dev') {
    nextSteps.push(`  cd ${target}/web`)
    if (!installed) nextSteps.push(`  ${pm} install`)
    if (config.entry === 'dev') nextSteps.push(`  ${pm} run dev`)
    else if (!built) nextSteps.push(`  ${pm} run build    # 产物写进 web-ui/，entry 默认指向它`)
  }
  // 装依赖是 web 失败就不接着装 node，所以没装好时两边都得补，少一边应用起不来
  if (!installed) nextSteps.push(`  cd ../node`, `  ${pm} install`)
  /** 下一步块：全都做完就整块不打印，「然后」也跟着块走，免得失主语。 */
  const nextBlock = nextSteps.length ? `${nextSteps.join('\n')}\n\n然后` : ''
  /** 收尾提醒：调试与交付两种姿势。 */
  const tip =
    config.entry === 'dev'
      ? `交付前：在 ${target}/web 跑 ${pm} run build，把 entry 改回 web-ui/index.html。`
      : `调试时：把 app.json 的 entry 改成 ${devUrl}，再在 ${target}/web 跑 ${pm} run dev。`
  console.log(`
应用已生成：${target}
  应用 id     ${config.appId}
  应用名称    ${config.appName}
  位置        ${config.slot}
  entry       ${entryText}
${webUiLine}  调试端口    ${config.devPort}（${pm} run dev 的地址）
  本机服务    桥 ${config.bridgePort} / HTTP ${config.httpPort}
  智能体      ${config.agentKey}（${config.agentName}）

下一步：
${nextBlock}打开 JiaorongAI → 开发者中心 → 创建应用，选这个目录：
  ${projectDir}

${tip}
node/ 服务由客户端点开应用时自动拉起，改了 node/ 离开应用再打开。
`)
}

/**
 * 生成一个应用目录。
 *
 * 拷模板、裁剪、写配置任一步抛错都意味着目录不完整，由入口按内部错误退出；
 * 装依赖与构建失败时目录已经生成好了，用 `installState` / `buildState` 回报，
 * 入口据此退成 `partial`，让开发者按打印的提示自己补跑。
 * @param options projectDir 目标目录；config 问答结果
 * @returns 裁剪说明、改写过的文件清单与两步的完成状态
 */
export const scaffold = ({ projectDir, config }) => {
  copyTemplate({ projectDir })
  // 先裁剪再写配置：变体文件里保留着模板的原始锚点值
  const { notes } = applyVariants({ projectDir, config })
  const { files } = applyConfig({ projectDir, config })
  /** 装依赖的结果：skipped 是用户选了不装，failed 是装了但没成。 */
  let installState = 'skipped'
  if (config.installDeps) {
    installState = installDeps({ projectDir, packageManager: config.packageManager })
      ? 'ok'
      : 'failed'
  }
  /** 构建结果：entry 指向 web-ui/ 且依赖装好了才构建。 */
  let buildState = 'skipped'
  if (installState === 'ok' && config.entry === 'build') {
    buildState = buildWeb({ projectDir, packageManager: config.packageManager }) ? 'ok' : 'failed'
  }
  /** 依赖是否已经装好。 */
  const installed = installState === 'ok'
  /** web-ui 是否已经构建好。 */
  const built = buildState === 'ok'
  printNextSteps({ projectDir, config, installed, built })
  return { notes, files, installed, built, installState, buildState }
}
