/**
 * 问答流程：分步收集配置。
 * 命令行已经给了的项不再问；取消与参数不合法都抛给入口（`bin/create-jiaorong-app.js`）
 * 按退出码收口，这里不碰 `process.exit`，否则 CLI 会把取消当成内部错误。
 */
import path from 'node:path'
import { askSelect, askText, askToggle } from './ask.js'
import { UsageError } from './errors.js'
import {
  BRIDGE_PORT_MAX,
  DEFAULTS,
  PACKAGE_MANAGER_CHOICES,
  SLOT_CHOICES,
  derivePorts,
  validateAgentKey,
  validateAgentName,
  validateAppId,
  validateAppName,
  validateEntry,
  validatePackageKind,
  validatePort,
  validateSlot,
  validateVersion
} from './rules.js'

/**
 * 从目录名推一个合法的应用 id 当默认值。
 * @param dirName 目标目录名
 * @returns 合法的应用 id
 */
const suggestAppId = (dirName) => {
  /** 规范化：非法字符换成单个横线，再去掉首尾横线。 */
  const normalized = String(dirName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'my-app'
}

/**
 * 派生智能体显示名：应用名已经带「助手」就不重复追加。
 * @param appName 应用名称
 * @returns 智能体显示名
 */
const defaultAgentName = (appName) => (appName.endsWith('助手') ? appName : `${appName}助手`)

/**
 * 问一项：命令行给过就直接用，不问。
 * @param options name 配置字段；cliConfig 命令行参数；ask 真正发问的函数
 * @returns 这一项的值
 */
const askOne = async ({ name, cliConfig, ask }) => {
  // 命令行显式给过的项不再打断用户
  if (cliConfig[name] !== undefined) return cliConfig[name]
  return await ask()
}

/**
 * 合并默认值、问答结果与命令行参数，并统一校验。
 * 命令行给的值不会经过问答里的 validate，这里是唯一的兜底：
 * 不合法就抛 `UsageError`，由入口按「参数不合法」退出，不会被当成内部错误。
 * @param options answers 问答结果；cliConfig 命令行参数
 * @returns 完整配置，字段与 `lib/replace.js` 用到的一致
 */
export const normalizeConfig = ({ answers, cliConfig }) => {
  /** 合并顺序：默认值 < 问答 < 命令行，命令行永远最大。 */
  const merged = { ...DEFAULTS, ...answers, ...cliConfig }
  /** 应用名称：没单独填就用 id。 */
  const appName = String(merged.appName || merged.appId).trim()
  /** 包管理器：枚举值统一小写，`--pm PNPM` 这种写法不至于白跑一趟。 */
  const packageManager = String(merged.packageManager || DEFAULTS.packageManager)
    .trim()
    .toLowerCase()
  /** 选了「先不装」就不再装依赖。 */
  const installDeps = packageManager !== 'none' && merged.installDeps !== false
  /** 三个端口统一成数字；HTTP 端口默认紧跟桥端口。 */
  const devPort = Number(merged.devPort)
  const bridgePort = Number(merged.bridgePort)
  const httpPort = Number(merged.httpPort ?? bridgePort + 1)
  /** 归一化后的完整配置。 */
  const config = {
    ...merged,
    appId: String(merged.appId).trim(),
    appName,
    description: String(merged.description ?? appName).trim(),
    version: String(merged.version || DEFAULTS.version).trim(),
    /** 枚举类字段：小写归一后再校验。 */
    slot: String(merged.slot || DEFAULTS.slot)
      .trim()
      .toLowerCase(),
    entry: String(merged.entry || DEFAULTS.entry)
      .trim()
      .toLowerCase(),
    packageManager,
    /** 智能体 key 与显示名：key 规则和应用 id 一致，必须小写，不做归一。 */
    agentKey: String(merged.agentKey || DEFAULTS.agentKey).trim(),
    agentName: String(merged.agentName || defaultAgentName(appName)).trim(),
    devPort,
    bridgePort,
    httpPort,
    installDeps
  }
  // 先逐项校验单字段，把问题一次说清，省得改一个报一个
  const problems = [
    validateAppId(config.appId),
    validateAppName(config.appName),
    validateVersion(config.version),
    validateSlot(config.slot),
    validateEntry(config.entry),
    validatePackageKind(config.packageManager),
    validateAgentKey(config.agentKey),
    validateAgentName(config.agentName),
    validatePort(devPort, '调试端口'),
    // 桥端口留出 +1 给 HTTP 端口，命令行传进来的值走这里兜底
    validatePort(bridgePort, '桥端口', BRIDGE_PORT_MAX),
    validatePort(httpPort, 'HTTP 端口')
  ].filter(Boolean)
  if (problems.length > 0) throw new UsageError(problems.join('；'))
  // 端口撞了会让客户端判定端口占用；单字段都合法之后再查重复
  const ports = new Set([devPort, bridgePort, httpPort])
  if (ports.size !== 3)
    throw new UsageError(`调试端口、桥端口、HTTP 端口不能重复：${[...ports].join(' / ')}`)
  return config
}

/**
 * 走一遍问答。
 * @param options cliConfig 命令行参数；dirName 目标目录名
 * @returns 完整配置
 */
export const askConfig = async ({ cliConfig, dirName }) => {
  /** 建议的应用 id。 */
  const suggestedId = suggestAppId(dirName)
  /** 问答结果。 */
  const answers = {}

  // 第一步：先定应用 id 与名称，后面的端口默认值要按 id 派生
  answers.appId = await askOne({
    name: 'appId',
    cliConfig,
    ask: () =>
      askText({
        message: '应用 id（小写字母、数字、单个横线）',
        initial: suggestedId,
        validate: (value) => validateAppId(value)
      })
  })
  answers.appName = await askOne({
    name: 'appName',
    cliConfig,
    ask: () =>
      askText({
        message: '应用名称（客户端里显示的名字）',
        initial: suggestedId,
        validate: (value) => validateAppName(value)
      })
  })

  /** 按应用 id 派生的默认端口，让多个应用不会撞口。 */
  const ports = derivePorts(cliConfig.appId ?? answers.appId)

  // 第二步：位置、功能开关、端口、智能体 key 与包管理器
  answers.slot = await askOne({
    name: 'slot',
    cliConfig,
    ask: () => askSelect({ message: '应用挂在哪儿', choices: SLOT_CHOICES, initial: 0 })
  })
  answers.withUi = await askOne({
    name: 'withUi',
    cliConfig,
    ask: () =>
      askToggle({
        message: '带官方 UI 组件（会话列表 + 对话区）',
        active: '带',
        inactive: '不带，给我极简页',
        initial: true
      })
  })
  answers.withRouter = await askOne({
    name: 'withRouter',
    cliConfig,
    ask: () =>
      askToggle({
        message: '带路由（多页面才需要；客户端里必须 Hash 路由）',
        active: '带',
        inactive: '不带',
        initial: true
      })
  })
  answers.withSkill = await askOne({
    name: 'withSkill',
    cliConfig,
    ask: () =>
      askToggle({
        message: '带技能模板（skill/example 一份 SKILL.md 与 / 菜单）',
        active: '带',
        inactive: '不带',
        initial: true
      })
  })
  answers.devPort = await askOne({
    name: 'devPort',
    cliConfig,
    ask: () =>
      askText({
        message: '前端调试端口（pnpm run dev 的地址，调试时把 entry 改成它）',
        initial: String(cliConfig.devPort ?? DEFAULTS.devPort),
        validate: (value) => validatePort(value, '调试端口')
      })
  })

  /** 已经答完的调试端口：桥端口要拿它查重。 */
  const answeredDevPort = Number(answers.devPort)
  /**
   * 校验桥端口，连带查重。
   * HTTP 端口是桥端口 +1、界面上不问，所以两个都要跟调试端口比。
   * 撞了在这一题就重问：等到 `normalizeConfig` 才发现，前面答完的内容会被整份丢掉。
   * @param value 用户输入
   * @returns 通过返回 undefined，否则返回原因
   */
  const validateBridgePort = (value) => {
    /** 范围校验结果：上限是 BRIDGE_PORT_MAX，留出 +1 给 HTTP 端口。 */
    const outOfRange = validatePort(value, '桥端口', BRIDGE_PORT_MAX)
    if (outOfRange) return outOfRange
    /** 桥端口。 */
    const bridgePort = Number(value)
    /** HTTP 端口：命令行单独给过就用，否则跟着桥端口 +1。 */
    const httpPort = Number(cliConfig.httpPort ?? bridgePort + 1)
    const isClashing = bridgePort === answeredDevPort || httpPort === answeredDevPort
    if (isClashing)
      return `桥端口 ${bridgePort}（HTTP ${httpPort}）和调试端口 ${answeredDevPort} 撞了，换一个`
    return undefined
  }
  answers.bridgePort = await askOne({
    name: 'bridgePort',
    cliConfig,
    ask: () =>
      askText({
        message: '本机服务桥端口（HTTP 端口自动 +1）',
        initial: String(ports.bridgePort),
        validate: validateBridgePort
      })
  })
  answers.agentKey = await askOne({
    name: 'agentKey',
    cliConfig,
    ask: () =>
      askText({
        message: '智能体 key（同 key 重复创建会复用同一条）',
        initial: DEFAULTS.agentKey,
        validate: (value) => validateAgentKey(value)
      })
  })
  answers.packageManager = await askOne({
    name: 'packageManager',
    cliConfig,
    ask: () =>
      askSelect({ message: '用哪个包管理器装依赖', choices: PACKAGE_MANAGER_CHOICES, initial: 0 })
  })

  // 第三步：选了「先不装」就不必再问要不要装依赖
  const packageManager = cliConfig.packageManager ?? answers.packageManager
  if (packageManager !== 'none') {
    answers.installDeps = await askOne({
      name: 'installDeps',
      cliConfig,
      ask: () =>
        askToggle({
          message: '现在就装依赖',
          active: '装',
          inactive: '稍后自己装',
          initial: true
        })
    })
  }

  return normalizeConfig({ answers, cliConfig })
}

/**
 * 全默认配置：命令行给了什么就用什么，其余按应用 id 派生。
 * @param options cliConfig 命令行参数；dirName 目标目录名
 * @returns 完整配置
 */
export const defaultConfig = ({ cliConfig, dirName }) => {
  /** 应用 id：命令行优先，否则从目录名推。 */
  const appId = cliConfig.appId ?? suggestAppId(dirName)
  // 命令行指定了桥端口就别再塞按 id 派生的端口对，否则 HTTP 端口不会跟着 +1
  const ports = cliConfig.bridgePort === undefined ? derivePorts(appId) : {}
  return normalizeConfig({ answers: { appId, appName: appId, ...ports }, cliConfig })
}

/**
 * 目录名：命令行第一个位置参数优先，否则用当前目录名。
 * @param options cliDirName 命令行给的目录名；cwd 当前目录
 * @returns 目录名
 */
export const resolveDirName = ({ cliDirName, cwd }) => cliDirName || path.basename(cwd)
