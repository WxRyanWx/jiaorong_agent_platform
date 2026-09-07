'use strict'

const { Service } = require('egg')
const { connect, isJiaorongError } = require('jiaorong-app-sdk')

/**
 * 整个 Node 进程里唯一调用 connect({ runtime: 'node' }) 的地方。
 * 依赖宿主注入的 globalThis.jiaorong，所以必须单进程。
 *
 * 前端不直接打这些 method 名到宿主，而是 POST /api/sdk { method, args }，
 * 由下面 dispatch 转到 SDK。未知 method 返回 VALIDATION_ERROR。
 *
 * HTTP 页只传智能体 key/名称。技能和提示词在本文件 agent.create / update 里补上，
 * 不要让前端拼 appDir/skill/.../SKILL.md。
 */
const SSE_EVENTS = [
  'chat.stream.updated', // 流式块增量
  'chat.stream.completed', // 本轮生成成功结束
  'chat.stream.failed', // 本轮生成失败
  'chat.plan.updated', // 计划/步骤变化
  'sessions.messages.changed', // 消息落库
  'context' // 宿主上下文变化
]

const AGENT_KEY = 'workbench'
const AGENT_NAME = '示例工作台助手'
const SKILLS = ['weekly-report', 'meeting-minutes', 'contract-review', 'data-query']
const DEFAULT_SKILL = 'weekly-report'

function skillFile(appDir, skillDir) {
  const root = String(appDir || '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replaceAll('\\', '/')
  if (!root) return `skill/${skillDir}/SKILL.md`
  return `${root}/skill/${skillDir}/SKILL.md`
}

function buildPrompt(appDir) {
  const defaultFile = skillFile(appDir, DEFAULT_SKILL)
  const others = SKILLS.filter((name) => name !== DEFAULT_SKILL)
    .map((name) => `- ${skillFile(appDir, name)}`)
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

async function workbenchAgentInput(client, args) {
  const ctx = await client.getContext()
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
      systemPrompt: buildPrompt(ctx.appDir)
    }
  }
}

async function dispatch(client, method, args) {
  switch (method) {
    case 'context.get': // 当前项目目录、权限等宿主上下文
      return client.getContext()
    case 'userinfo.get': // 登录用户名 / token
      return client.userinfo()
    case 'agent.create': // 按 key 创建或复用；已存在则不改配置。技能/提示词由 Node 写入。
      return client.agent.create(await workbenchAgentInput(client, args))
    case 'agent.update': // 部分更新；内容和库里一样则不写库。同样补技能/提示词。
      return client.agent.update(await workbenchAgentInput(client, args))
    case 'agent.get': // 按 id 查一条智能体
      return client.agent.get(args)
    case 'agent.list': // 列出本应用下的智能体
      return client.agent.list()
    case 'catalog.slash': // slash / skill 目录
      return client.catalog.slash()
    case 'session.create': // 新建会话，可带上第一条用户消息
      return client.session.create(args)
    case 'session.list': // 分页列会话
      return client.session.list(args)
    case 'session.search': // 按标题/内容搜会话
      return client.session.search(args)
    case 'session.get': // 拉会话 + 最近消息
      return client.session.get(args)
    case 'session.rename': // 改会话标题
      return client.session.rename(args)
    case 'session.pin': // 置顶 / 取消置顶
      return client.session.pin(args)
    case 'session.delete': // 删会话
      return client.session.delete(args)
    case 'session.send': // 已有会话里发一条，开始生成
      return client.session.send(args)
    case 'session.stop': // 停止当前生成
      return client.session.stop(args)
    case 'session.steer': // 生成中追加指令
      return client.session.steer(args)
    case 'chat.respondToolInteraction': // 工具授权或回答提问
      return client.respondToolInteraction(args)
    case 'disconnect': // HTTP 模式不断宿主进程，只回 ok
      return { ok: true }
    default: {
      const error = new Error(`Unknown method: ${method}`)
      error.code = 'VALIDATION_ERROR'
      throw error
    }
  }
}

class JiaorongService extends Service {
  errorPayload(error) {
    const code = isJiaorongError(error)
      ? error.code
      : typeof error?.code === 'string'
        ? error.code
        : 'GENERATION_FAILED'
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, code, message }
  }

  statusForCode(code) {
    if (code === 'UNAUTHORIZED') return 401
    if (code === 'JIAORONG_NOT_RUNNING') return 503
    if (code === 'VALIDATION_ERROR') return 400
    return 500
  }

  writeSse(event, payload) {
    const clients = this.app.sdkSseClients
    if (!clients?.size) return
    const chunk = `event: sdk\ndata: ${JSON.stringify({ event, payload })}\n\n`
    for (const res of [...clients]) {
      try {
        res.write(chunk)
      } catch {
        clients.delete(res)
      }
    }
  }

  bindEvents(client) {
    if (this.app.jiaorongEventsBound) return
    this.app.jiaorongEventsBound = true
    for (const event of SSE_EVENTS) {
      client.on(event, (payload) => this.writeSse(event, payload))
    }
  }

  async getClient() {
    if (this.app.jiaorongClient) return this.app.jiaorongClient
    const client = await connect({
      appId: this.config.jiaorong.appId,
      runtime: 'node'
    })
    this.app.jiaorongClient = client
    this.bindEvents(client)
    return client
  }

  async invoke(method, args) {
    const client = await this.getClient()
    return dispatch(client, method, args ?? {})
  }
}

module.exports = JiaorongService
