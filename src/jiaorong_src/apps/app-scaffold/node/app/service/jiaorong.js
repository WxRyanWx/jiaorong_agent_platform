'use strict'

const { Service } = require('egg')

/**
 * 页面经 WebSocket 发来的请求：本进程补业务入参后，再让页面中继调宿主。
 * 本进程没有宿主桥，也不对客户端直连。
 */

const KNOWN_METHODS = new Set([
  'context.get',
  'userinfo.get',
  'agent.create',
  'agent.update',
  'agent.get',
  'agent.list',
  'catalog.slash',
  'catalog.models',
  'catalog.systemPrompts',
  'catalog.agentTools',
  'knowledgeBase.query',
  'knowledgeBase.queryDirectory',
  'session.create',
  'session.list',
  'session.search',
  'session.get',
  'session.rename',
  'session.pin',
  'session.setModel',
  'session.setPermissionMode',
  'session.setOrchestrationPolicy',
  'session.getGenerationSettings',
  'session.updateGenerationSettings',
  'session.getContextOccupancy',
  'session.setToolMode',
  'session.getDisabledAgentTools',
  'session.updateDisabledAgentTools',
  'session.delete',
  'session.send',
  'session.retryMessage',
  'session.deleteMessage',
  'session.editUserMessage',
  'session.fork',
  'session.stop',
  'session.steer',
  'chat.respondToolInteraction',
  'dialog.selectDirectory',
  'dialog.selectFiles',
  'dialog.readFilePreview',
  'dialog.rememberDroppedFiles',
  'dialog.allowProjectDir',
  'clipboard.writeImage',
  'capture.pageArea',
  'devtools.open',
  'disconnect'
])

const AGENT_KEY = 'workbench'
const AGENT_NAME = '应用脚手架助手'
const SKILLS = ['weekly-report', 'meeting-minutes', 'contract-review', 'data-query']
const DEFAULT_SKILL = 'weekly-report'

/**
 * 拼技能文件路径。
 * @param {string} appDir 应用目录
 * @param {string} skillDir 技能目录名
 * @returns {string} SKILL.md 路径
 */
function skillFile(appDir, skillDir) {
  const root = String(appDir || '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replaceAll('\\', '/')
  if (!root) return `skill/${skillDir}/SKILL.md`
  return `${root}/skill/${skillDir}/SKILL.md`
}

/**
 * 默认系统提示词。
 * @param {string} appDir 应用目录
 * @returns {string} 提示词
 */
function buildPrompt(appDir) {
  const defaultFile = skillFile(appDir, DEFAULT_SKILL)
  const others = SKILLS.filter((name) => name !== DEFAULT_SKILL)
    .map((name) => `- ${skillFile(appDir, name)}`)
    .join('\n')
  return [
    '你是应用脚手架助手，用中文简洁回答。',
    '',
    '默认必须先用文件读取工具打开并严格遵循这份技能，再回答用户：',
    defaultFile,
    '',
    '仅当用户明确要求会议纪要、合同审核或数据查询时，再改读对应技能文件：',
    others
  ].join('\n')
}

/**
 * 补齐创建 / 更新智能体入参。
 * @param {import('egg').Application} app Egg 应用
 * @param {object} args 前端入参
 * @returns {Promise<object>}
 */
async function workbenchAgentInput(app, args) {
  const ctx = await app.invokeViaPage('context.get', {})
  const input = args && typeof args === 'object' ? args : {}
  const key = typeof input.key === 'string' ? input.key.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  return {
    ...input,
    key: key || AGENT_KEY,
    name: name || AGENT_NAME,
    skills: SKILLS,
    config: {
      ...(input.config && typeof input.config === 'object' ? input.config : {}),
      systemPrompt: buildPrompt(ctx?.appDir || '')
    }
  }
}

class JiaorongService extends Service {
  /**
   * 把抛错收成 { ok, code, message }。
   * @param {unknown} error 抛出值
   * @returns {{ ok: false, code: string, message: string }}
   */
  errorPayload(error) {
    const code =
      error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : 'GENERATION_FAILED'
    const message =
      error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()
        ? error.message
        : error instanceof Error
          ? error.message
          : '请求失败'
    return { ok: false, code, message }
  }

  /**
   * 转发到页面中继，由页面代调 window.jiaorong.invoke。
   * @param {string} method 方法名
   * @param {object} [args] 入参
   * @returns {Promise<*>}
   */
  async invoke(method, args) {
    if (!KNOWN_METHODS.has(method)) {
      const error = new Error(`Unknown method: ${method}`)
      error.code = 'VALIDATION_ERROR'
      throw error
    }
    if (method === 'disconnect') return { ok: true }
    if (typeof this.app.invokeViaPage !== 'function') {
      const error = new Error('页面未连接宿主桥')
      error.code = 'JIAORONG_NOT_RUNNING'
      throw error
    }
    let payload = args ?? {}
    if (method === 'agent.create' || method === 'agent.update') {
      payload = await workbenchAgentInput(this.app, payload)
    }
    return this.app.invokeViaPage(method, payload)
  }
}

module.exports = JiaorongService
