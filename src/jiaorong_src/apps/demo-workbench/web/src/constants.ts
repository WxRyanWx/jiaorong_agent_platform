/** 应用 id，必须与 app.json 的 id 一致。 */
export const APP_ID = 'demo-workbench'

/** HttpChatPage 的 Node 地址。必须与 app.json 的 node.port、Egg listen 一致。 */
export const NODE_BASE = 'http://127.0.0.1:8787'

/** 应用内智能体的稳定 key，重复 create 会复用同一条。 */
export const CHAT_AGENT_KEY = 'workbench'
/** 侧栏和对话顶栏展示的智能体名称。 */
export const CHAT_AGENT_NAME = '示例工作台助手'
/**
 * 应用自带技能目录名，对应 `skill/<name>/SKILL.md`。
 * SDK 会写成 `app.demo-workbench.<name>` 再交给宿主。
 */
export const CHAT_SKILLS = [
  'weekly-report',
  'meeting-minutes',
  'contract-review',
  'data-query'
] as const
/** 创建智能体时默认要求读取的技能。 */
export const DEFAULT_SKILL = 'weekly-report'
/** 传给 JiaorongAgentChat 的输入框占位文案。不传则组件用默认「向 xxx 发送消息…」。 */
export const CHAT_PLACEHOLDER = '请输入你的问题…例如「帮我写一份周报」'

/** `appDir/skill/<目录>/SKILL.md`。宿主拷到 ~/.jiaorongchat/apps/<id>/ 后的绝对路径。 */
export function appSkillFile(appDir: string, skillDir: string): string {
  const root = appDir.trim().replace(/[/\\]+$/, '').replaceAll('\\', '/')
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
    '你是示例工作台助手，用中文简洁回答。',
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
    key: CHAT_AGENT_KEY,
    name: CHAT_AGENT_NAME,
    skills: [...CHAT_SKILLS],
    config: { systemPrompt: buildChatAgentPrompt(appDir) }
  }
}
