/**
 * 把问答得到的配置写进模板。
 *
 * 两类改写：
 * - JSON 文件（`app.json`、两个 `package.json`）走结构化改写，不碰排版。
 * - 其余文件走锚点正则替换，命中次数由 `lib/edit-file.js` 校验。
 */
import path from 'node:path'
import { applyRules, patchJson } from './edit-file.js'

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
      to: `export const CHAT_AGENT_NAME = '${agentName}'`,
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
      to: `export const AGENT_NAME = '${agentName}'`,
      expect: 1
    },
    // 日志前缀
    { file: 'node/main.js', find: /\[app-scaffold\]/g, to: logTag, expect: 3 },
    { file: 'node/service/startup.js', find: /\[app-scaffold\]/g, to: logTag, expect: 3 },
    // 系统提示词首句
    { file: 'node/service/agent.js', find: /你是示例应用助手/g, to: `你是${agentName}`, expect: 1 },
    // 页面标题与顶栏
    {
      file: 'web/index.html',
      find: /<title>[^<]*<\/title>/g,
      to: `<title>${appName}</title>`,
      expect: 1
    },
    {
      file: 'web/src/App.vue',
      find: /<strong>[^<]*<\/strong>/g,
      to: `<strong>${appName}</strong>`,
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
    { file: 'node/README.md', find: /\| 47822 \|/g, to: `| ${config.httpPort} |`, expect: 1 },
    {
      file: 'node/README.md',
      find: /^pnpm install --ignore-workspace$/m,
      to: 'pnpm install',
      expect: 1
    }
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
