/**
 * 脚手架业务常量与智能体入参。
 * 改应用 id / 技能 / 提示词时只动这个文件，页面只引用这里的导出。
 */

/** 应用 id，必须与 app.json 的 id 一致。 */
export const APP_ID = 'app-scaffold'

/** 包内 Node / 页面 WS 端口，前后端约定死；客户端不探口。 */
export const NODE_PORT = 8787

/** 应用内智能体的稳定 key，重复 create 会复用同一条。 */
export const CHAT_AGENT_KEY = 'workbench'
/** 侧栏和对话顶栏展示的智能体名称。 */
export const CHAT_AGENT_NAME = '示例应用助手'
/**
 * 应用自带技能目录名，对应 `skill/<name>/SKILL.md`。
 * 超级智能体会写成 `app.app-scaffold.<name>`。
 */
export const CHAT_SKILLS = [
  'weekly-report',
  'meeting-minutes',
  'contract-review',
  'data-query'
] as const
/** 传给 JiaorongAgentChat 的 `/` 列表。skillDir 是 `skill/` 下目录名，不要写 app.{id}.{dir}。 */
export const CHAT_SLASH_ITEMS = [
  {
    category: 'skill' as const,
    skillDir: 'app.app-scaffold.weekly-report',
    label: '周报整理',
    description: '把零散工作记录整理成周报。用户提到本周进展、周报、小结、汇报时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'meeting-minutes',
    label: '会议纪要',
    description: '把会议发言整理成纪要。用户提到开会、纪要、决议、待办、会议记录时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'contract-review',
    label: '合同审核',
    description: '按清单审核合同风险。用户提到合同、条款、违约、审核合同时必须使用。'
  },
  {
    category: 'skill' as const,
    skillDir: 'data-query',
    label: '数据查询',
    description: '按用户问题查询业务数据。用户提到查数、报表、库存、订单量、统计时必须使用。'
  }
]
/** 创建智能体时默认要求读取的技能。 */
export const DEFAULT_SKILL = 'weekly-report'
/** 传给 JiaorongAgentChat 的输入框占位文案。不传则组件用默认「向 xxx 发送消息…」。 */
export const CHAT_PLACEHOLDER = '请输入你的问题…例如「帮我写一份周报」'

/** `appDir/skill/<目录>/SKILL.md`。超级智能体拷到 ~/.jiaorongchat/apps/<id>/ 后的绝对路径。 */
export function appSkillFile(appDir: string, skillDir: string): string {
  const root = appDir
    .trim()
    .replace(/[/\\]+$/, '')
    .replaceAll('\\', '/')
  // 没有应用目录时退回相对路径，提示词里仍能看出技能文件位置
  if (!root) return `skill/${skillDir}/SKILL.md`
  return `${root}/skill/${skillDir}/SKILL.md`
}

/** 提示词里写死默认技能文件路径，让模型先 Read 再答。 */
export function buildChatAgentPrompt(appDir: string): string {
  const defaultFile = appSkillFile(appDir, DEFAULT_SKILL)
  const others = CHAT_SKILLS.filter((name) => name !== DEFAULT_SKILL)
    .map((name) => `- ${appSkillFile(appDir, name)}`)
    .join('\n')
  return [
    '你是示例应用助手，用中文简洁回答。',
    '',
    '默认必须先用文件读取工具打开并严格遵循这份技能，再回答用户：',
    defaultFile,
    '',
    '仅当用户明确要求会议纪要、合同审核或数据查询时，再改读对应技能文件：',
    others
  ].join('\n')
}

/** 直连页和 Node 转发页共用的 create / update 入参。 */
export function agentSnapshot(appDir: string) {
  return {
    agentKey: CHAT_AGENT_KEY,
    name: CHAT_AGENT_NAME,
    skills: [...CHAT_SKILLS],
    config: { systemPrompt: buildChatAgentPrompt(appDir) }
  }
}
