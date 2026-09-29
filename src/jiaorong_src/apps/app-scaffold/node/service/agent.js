/**
 * 智能体入参：技能文件路径与系统提示词都在这里拼。
 * 页面只传 `agentKey` 和 `name`，其余由这里补齐。
 */
import { AGENT_NAME, DEFAULT_SKILL, SKILLS } from '../config.js'

/**
 * 拼技能文件路径，供提示词引用；拿不到应用目录时退回相对路径。
 * @param appDir 客户端安装本应用后的目录，来自 `context.get`
 * @param skillDir `skill/` 下的目录名
 * @returns `SKILL.md` 路径
 */
const skillFile = (appDir, skillDir) =>
  appDir ? `${appDir}/skill/${skillDir}/SKILL.md` : `skill/${skillDir}/SKILL.md`

/**
 * 拼系统提示词：默认技能必读，其余技能按用户意图再读。
 * @param appDir 应用目录
 * @returns 提示词文本
 */
export function buildPrompt(appDir) {
  /** 其余技能文件路径，一行一个。 */
  const others = SKILLS.filter((name) => name !== DEFAULT_SKILL)
    .map((name) => `- ${skillFile(appDir, name)}`)
    .join('\n')
  return [
    '你是示例应用助手，用中文简洁回答。',
    '',
    '默认必须先用文件读取工具打开并严格遵循这份技能，再回答用户：',
    skillFile(appDir, DEFAULT_SKILL),
    '',
    '仅当用户明确要求会议纪要、合同审核或数据查询时，再改读对应技能文件：',
    others
  ].join('\n')
}

/**
 * 给 `agent.create` 入参补上技能与提示词。
 * @param input 页面传来的入参
 * @param appDir 应用目录，用来拼技能文件绝对路径
 * @returns 补齐后的入参
 */
export function withAgentDefaults(input, appDir) {
  return {
    ...input,
    // 名称必填，页面没传就用默认名
    name: input.name || AGENT_NAME,
    // 技能传目录名数组，对应包内 skill/ 下的目录
    skills: SKILLS,
    // 保留页面传来的其它 config 字段，例如 permissionMode
    config: { ...input.config, systemPrompt: buildPrompt(appDir) }
  }
}
