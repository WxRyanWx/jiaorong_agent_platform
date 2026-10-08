/**
 * 智能体入参：系统提示词在这里拼（不带技能的版本）。
 * 页面只传 `agentKey` 和 `name`，其余由这里补齐。
 * 要加技能：建 `skill/<技能名>/SKILL.md`，把目录名加进 `agent.create` 的 `skills`，
 * 并在提示词里给出 SKILL.md 的绝对路径（应用目录取自 `context.get` 的 `appDir`）。
 */
import { AGENT_NAME } from '../config.js'

/**
 * 拼系统提示词。
 * @returns 提示词文本
 */
export function buildPrompt() {
  return '你是示例应用助手，用中文简洁回答。'
}

/**
 * 给 `agent.create` 入参补上提示词。
 * @param input 页面传来的入参
 * @returns 补齐后的入参
 */
export function withAgentDefaults(input) {
  return {
    ...input,
    // 名称必填，页面没传就用默认名
    name: input.name || AGENT_NAME,
    // 保留页面传来的其它 config 字段，例如 permissionMode
    config: { ...input.config, systemPrompt: buildPrompt() }
  }
}
