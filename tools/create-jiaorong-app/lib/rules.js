/**
 * 校验规则与默认值。
 * 应用 id 的正则与 slot 的取值必须和客户端一致，否则生成出来的目录在开发者中心会被判为无效：
 * id 见 `src/jiaorong_src/appHost/catalog.ts` 的 `APP_ID_RE`，slot 见 `src/jiaorong_src/appHost/manifestRules.ts`。
 */

/** 应用 id：小写字母数字加单横线，不能以横线开头或结尾。 */
export const APP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** slot 选项：客户端只认这两个位置。 */
export const SLOT_CHOICES = [
  { title: '应用中心（app-center）', value: 'app-center' },
  { title: '侧栏菜单（menu）', value: 'menu' }
]

/** entry 取值：构建产物，或前端调试地址。 */
export const ENTRY_CHOICES = ['build', 'dev']

/** 版本号：与客户端 `src/jiaorong_src/appHost/manifestRules.ts` 的 `APP_MANIFEST_SEMVER` 一致。 */
export const VERSION_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/

/** 包管理器选项。 */
export const PACKAGE_MANAGER_CHOICES = [
  { title: 'pnpm', value: 'pnpm' },
  { title: 'npm', value: 'npm' },
  { title: 'yarn', value: 'yarn' },
  { title: '先不装，我自己来', value: 'none' }
]

/** 端口可用区间：避开系统保留端口。 */
export const PORT_MIN = 1024
export const PORT_MAX = 65534
/**
 * 桥端口的上限：HTTP 端口是桥端口 +1。
 * 桥端口要是允许填到 `PORT_MAX`，HTTP 端口就成了 65535、超出可用区间，
 * 而这一题自己看不出来，要等全部问完才在 `normalizeConfig` 报错，前面填的内容会被整份丢掉。
 */
export const BRIDGE_PORT_MAX = PORT_MAX - 1

/**
 * 问答的默认值。
 * 端口在问答时按应用 id 派生，这里只给兜底值。
 */
export const DEFAULTS = {
  version: '1.0.0',
  slot: 'app-center',
  entry: 'build',
  devPort: 5174,
  bridgePort: 47821,
  agentKey: 'workbench',
  withUi: true,
  withRouter: true,
  withSkill: true,
  installDeps: true,
  packageManager: 'pnpm'
}

/**
 * 校验应用 id。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateAppId = (value) => {
  const id = String(value || '').trim()
  if (!id) return '应用 id 不能为空'
  if (id.length > 64) return '应用 id 太长，控制在 64 个字符内'
  if (!APP_ID_RE.test(id)) return '只能用小写字母、数字和单个横线，例如 my-app'
  return undefined
}

/**
 * 校验应用名称。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateAppName = (value) => {
  if (!String(value || '').trim()) return '应用名称不能为空'
  return undefined
}

/**
 * 校验端口。
 * @param value 用户输入
 * @param label 端口名称，报错时用来区分是哪一个
 * @param max 允许的最大值，桥端口传 `BRIDGE_PORT_MAX`
 * @returns 通过返回 undefined，否则返回原因
 */
export const validatePort = (value, label = '端口', max = PORT_MAX) => {
  const port = Number(value)
  if (!Number.isInteger(port)) return `${label}要是整数`
  if (port < PORT_MIN || port > max) return `${label}要在 ${PORT_MIN} 到 ${max} 之间`
  return undefined
}

/**
 * 校验版本号：客户端按三段式 semver 判清单，写别的会在开发者中心被判为无效。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateVersion = (value) => {
  const version = String(value || '').trim()
  if (!version) return '版本号不能为空'
  if (!VERSION_RE.test(version)) return '版本号要用三段式，例如 1.0.0'
  return undefined
}

/**
 * 校验挂载位置。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateSlot = (value) => {
  if (!SLOT_CHOICES.some((choice) => choice.value === value))
    return '挂载位置只能是 app-center 或 menu'
  return undefined
}

/**
 * 校验 entry 取值。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateEntry = (value) => {
  if (!ENTRY_CHOICES.includes(value)) return 'entry 只能是 build 或 dev'
  return undefined
}

/**
 * 校验包管理器：不认的名字会让装依赖静默失败，这里提前拦住。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validatePackageKind = (value) => {
  if (!PACKAGE_MANAGER_CHOICES.some((choice) => choice.value === value))
    return `包管理器只能是 ${PACKAGE_MANAGER_CHOICES.map((choice) => choice.value).join(' / ')}`
  return undefined
}

/**
 * 校验智能体显示名。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateAgentName = (value) => {
  if (!String(value || '').trim()) return '智能体显示名不能为空'
  return undefined
}

/**
 * 校验智能体 key：宿主用它复用同一条智能体，规则与应用 id 一致。
 * @param value 用户输入
 * @returns 通过返回 undefined，否则返回原因
 */
export const validateAgentKey = (value) => {
  const key = String(value || '').trim()
  if (!key) return 'agentKey 不能为空'
  if (!APP_ID_RE.test(key)) return '只能用小写字母、数字和单个横线'
  return undefined
}

/**
 * 按应用 id 派生一对冷门端口，让同时打开多个应用不会撞口。
 * @param appId 应用 id
 * @returns `{ bridgePort, httpPort }`，两者相邻
 */
export const derivePorts = (appId) => {
  /** 简单散列：把 id 的字符码揉成一个数。 */
  let hash = 0
  for (const char of String(appId)) hash = (hash * 31 + char.charCodeAt(0)) % 100000
  /** 落到 40000 到 49998 的偶数起点，保证 +1 后仍在区间内。 */
  const bridgePort = 40000 + (hash % 5000) * 2
  return { bridgePort, httpPort: bridgePort + 1 }
}
