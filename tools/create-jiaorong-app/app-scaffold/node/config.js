/**
 * 包内 Node 的配置：端口与智能体常量。
 * 改端口或智能体编号只动这个文件，业务代码一律从这里的导出取值。
 */

/** WS 桥端口，与 `web/src/constants.ts` 的 `NODE_PORT` 一致。 */
export const BRIDGE_PORT = Number(process.env.JIAORONG_NODE_PORT || 47821)
/** HTTP 端口，与 `web/src/constants.ts` 的 `NODE_HTTP_PORT` 一致。 */
export const HTTP_PORT = Number(process.env.JIAORONG_NODE_HTTP_PORT || 47822)

/** 应用内智能体的稳定编号，与 `web/src/constants.ts` 的 `CHAT_AGENT_KEY` 一致。 */
export const AGENT_KEY = 'workbench'
/** 智能体显示名，与 `web/src/constants.ts` 的 `CHAT_AGENT_NAME` 一致。 */
export const AGENT_NAME = '示例应用助手'
/** 应用自带的技能目录名，对应包内 `skill/<目录名>/SKILL.md`；`example` 是模板，换成你自己的技能名。 */
export const SKILLS = ['example']
/** 默认技能：提示词要求模型先读这份技能再回答，取 `SKILLS` 里的一份。 */
export const DEFAULT_SKILL = 'example'
