/**
 * 把问答得到的配置写进模板。
 *
 * 两类改写：
 * - JSON 文件（`app.json`、两个 `package.json`）走结构化改写，不碰排版。
 * - 其余文件走锚点正则替换，命中次数由 `lib/edit-file.js` 校验。
 */
import path from 'node:path'
import { applyRules, patchJson } from './edit-file.js'

/** JS 单引号字符串里的转义表：反斜杠、单引号、换行，以及会中断字符串的两个行分隔符。 */
const JS_QUOTE_ESCAPES = {
  '\\': '\\\\',
  "'": "\\'",
  '\n': '\\n',
  '\r': '\\r',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
}

/**
 * 转义成能安全放进 JS 单引号字符串的内容（不含外层引号）。
 * 应用名与智能体名是用户自由输入：`it's mine` 原样拼进去会让生成出来的文件直接语法错误，
 * 反斜杠会静默改掉字面值，真实换行会把字符串截断。
 * @param value 原始文案
 * @returns 转义后的文案
 */
const toJsQuoted = (value) =>
  String(value).replace(/[\\'\n\r\u2028\u2029]/g, (char) => JS_QUOTE_ESCAPES[char])

/** HTML 文本节点的转义表。 */
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

/**
 * 转义成能安全放进 HTML 文本节点的内容。
 * 应用名里带 `</title>` 会提前闭合标签，把后面的内容变成可执行脚本。
 * @param value 原始文案
 * @returns 转义后的文案
 */
const toHtmlText = (value) => String(value).replace(/[&<>]/g, (char) => HTML_ESCAPES[char])

/**
 * 转义成能安全放进 Vue 模板文本的内容。
 *
 * 模板文本会先被 Vue 编译，`{{` 是插值起始符：应用名写成 `{{ 1 }}` 会被编成插值、顶栏显示成 `1`，
 * 只有半个 `{{` 时构建直接失败。把 `{` 写成 `&#123;` 就不会被当成插值，页面上仍显示 `{`。
 * `index.html` 的 `<title>` 不是 Vue 模板，用 `toHtmlText` 就够，不必跟着转。
 * @param value 原始文案
 * @returns 转义后的文案
 */
const toVueText = (value) => toHtmlText(value).replace(/\{/g, '&#123;')

/**
 * 造替换规则表。
 * @param config 问答结果，字段见 `lib/prompts.js`
 * @returns 规则数组
 */
const buildRules = (config) => {
  /** 应用 id，例如 my-app。 */
  const { appId } = config
  /** 应用显示名。 */
  const { appName } = config
  /** 智能体显示名。 */
  const { agentName } = config
  /** 智能体显示名的 JS 字面量形式：三处都是拼进单引号字符串，必须先转义。 */
  const agentNameInJs = toJsQuoted(agentName)
  /** 应用显示名的 HTML 形式：两处都是拼进标签文本，必须先转义。 */
  const appNameInHtml = toHtmlText(appName)
  /** 应用显示名的 Vue 模板文本形式：顶栏在 `App.vue` 里，还要防 `{{` 被编成插值。 */
  const appNameInVue = toVueText(appName)
  /** 日志前缀，替换掉模板里的 `[app-scaffold]`。 */
  const logTag = `[${appId}]`
  /** slot 对应的中文位置名。 */
  const slotText = config.slot === 'menu' ? '侧栏菜单' : '应用中心'
  return [
    // 页面侧常量
    {
      file: 'web/src/constants.ts',
      find: /export const APP_ID = '[^']*'/g,
      to: `export const APP_ID = '${appId}'`,
      expect: 1
    },
    {
      file: 'web/src/constants.ts',
      find: /export const NODE_PORT = \d+/g,
      to: `export const NODE_PORT = ${config.bridgePort}`,
      expect: 1
    },
    {
      file: 'web/src/constants.ts',
      find: /export const NODE_HTTP_PORT = \d+/g,
      to: `export const NODE_HTTP_PORT = ${config.httpPort}`,
      expect: 1
    },
    {
      file: 'web/src/constants.ts',
      find: /export const CHAT_AGENT_KEY = '[^']*'/g,
      to: `export const CHAT_AGENT_KEY = '${config.agentKey}'`,
      expect: 1
    },
    {
      file: 'web/src/constants.ts',
      find: /export const CHAT_AGENT_NAME = '[^']*'/g,
      to: `export const CHAT_AGENT_NAME = '${agentNameInJs}'`,
      expect: 1
    },
    // 本机服务侧常量
    {
      file: 'node/config.js',
      find: /JIAORONG_NODE_PORT \|\| \d+/g,
      to: `JIAORONG_NODE_PORT || ${config.bridgePort}`,
      expect: 1
    },
    {
      file: 'node/config.js',
      find: /JIAORONG_NODE_HTTP_PORT \|\| \d+/g,
      to: `JIAORONG_NODE_HTTP_PORT || ${config.httpPort}`,
      expect: 1
    },
    {
      file: 'node/config.js',
      find: /export const AGENT_KEY = '[^']*'/g,
      to: `export const AGENT_KEY = '${config.agentKey}'`,
      expect: 1
    },
    {
      file: 'node/config.js',
      find: /export const AGENT_NAME = '[^']*'/g,
      to: `export const AGENT_NAME = '${agentNameInJs}'`,
      expect: 1
    },
    // 日志前缀
    { file: 'node/main.js', find: /\[app-scaffold\]/g, to: logTag, expect: 3 },
    { file: 'node/service/startup.js', find: /\[app-scaffold\]/g, to: logTag, expect: 3 },
    // 系统提示词首句
    // 这一处落在模板既有的单引号字符串内部，只能做单引号上下文转义，不能整体换成双引号字面量
    {
      file: 'node/service/agent.js',
      find: /你是示例应用助手/g,
      to: `你是${agentNameInJs}`,
      expect: 1
    },
    // 页面标题与顶栏
    {
      file: 'web/index.html',
      find: /<title>[^<]*<\/title>/g,
      to: `<title>${appNameInHtml}</title>`,
      expect: 1
    },
    {
      file: 'web/src/App.vue',
      find: /<strong>[^<]*<\/strong>/g,
      to: `<strong>${appNameInVue}</strong>`,
      expect: 1
    },
    // Vite 调试端口：pnpm run dev 监听的地址，调试时把 app.json 的 entry 改成它
    {
      file: 'web/vite.config.ts',
      find: /  base: '\.\/',\n/g,
      to: `  base: './',\n  // 调试地址固定端口，调试时把 app.json 的 entry 改成这个地址\n  server: { host: '127.0.0.1', port: ${config.devPort} },\n`,
      expect: 1
    },
    // 说明文档
    { file: 'README.md', find: /^# .*$/m, to: `# ${appName}`, expect: 1 },
    {
      file: 'README.md',
      find: /^改应用 id 和业务文案即可接入交融，默认挂在应用中心。.*$/m,
      to: `由 create-jiaorong-app 生成，改业务文案即可接入交融，默认挂在${slotText}。目录结构与《快速开始》一致。`,
      expect: 1
    },
    { file: 'README.md', find: /^app-scaffold\/$/m, to: `${appId}/`, expect: 1 },
    { file: 'README.md', find: /\| 47821 \|/g, to: `| ${config.bridgePort} |`, expect: 1 },
    { file: 'README.md', find: /\| 47822 \|/g, to: `| ${config.httpPort} |`, expect: 1 },
    { file: 'node/README.md', find: /\| 47821 \|/g, to: `| ${config.bridgePort} |`, expect: 1 },
    { file: 'node/README.md', find: /\| 47822 \|/g, to: `| ${config.httpPort} |`, expect: 1 }
  ]
}

/**
 * 把配置写进项目目录。
 * @param options projectDir 目标目录；config 问答结果
 * @returns 改写了多少个文件
 */
export const applyConfig = ({ projectDir, config }) => {
  // app.json：id / name / version / entry / slot 必填，description 为空就不写这个字段
  patchJson(path.join(projectDir, 'app.json'), {
    id: config.appId,
    name: config.appName,
    version: config.version,
    entry: config.entry === 'build' ? 'web-ui/index.html' : `http://127.0.0.1:${config.devPort}/`,
    slot: config.slot,
    description: config.description || undefined
  })
  // 两个 package.json 的包名跟着应用 id 走
  patchJson(path.join(projectDir, 'node/package.json'), { name: `${config.appId}-node` })
  patchJson(path.join(projectDir, 'web/package.json'), { name: `${config.appId}-web` })
  /** 锚点替换命中的文件。 */
  const edited = applyRules({ projectDir, rules: buildRules(config) })
  return { files: ['app.json', 'node/package.json', 'web/package.json', ...edited] }
}
