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
 * HTTP 页只传智能体 key / 名称。技能和提示词在本文件 agent.create / update 里补上，
 * 不要让前端拼 appDir/skill/.../SKILL.md。
 */
// SSE_EVENTS：订阅后经 writeSse 推给页面的宿主事件。
const SSE_EVENTS = [
  'chat.stream.updated', // 流式块增量
  'chat.stream.completed', // 本轮生成成功结束
  'chat.stream.failed', // 本轮生成失败
  'chat.plan.updated', // 计划 / 步骤变化
  'sessions.messages.changed', // 消息落库
  'context' // 宿主上下文变化
]

// AGENT_KEY / AGENT_NAME：HTTP 页只传智能体标识时的默认值。
const AGENT_KEY = 'workbench'
const AGENT_NAME = '示例工作台助手'
// SKILLS / DEFAULT_SKILL：Node 写入智能体的技能列表；默认先读周报技能。
const SKILLS = ['weekly-report', 'meeting-minutes', 'contract-review', 'data-query']
const DEFAULT_SKILL = 'weekly-report'

/**
 * 拼技能文件路径。前端不传绝对路径，由 Node 按 appDir 补全。
 * @param {string} appDir 宿主上下文里的应用目录
 * @param {string} skillDir 技能目录名，如 weekly-report
 * @returns {string} `appDir/skill/<skillDir>/SKILL.md`；appDir 空则用相对路径
 */
function skillFile(appDir, skillDir) {
  const root = String(appDir || '')
    .trim()
    .replace(/[/\\]+$/, '')
    .replaceAll('\\', '/')
  if (!root) return `skill/${skillDir}/SKILL.md` // 没有应用目录：退回相对路径，避免出现 `/skill/...`。
  return `${root}/skill/${skillDir}/SKILL.md`
}

/**
 * 拼工作台系统提示词：默认先读 weekly-report，其它技能按需再读。
 * @param {string} appDir 应用目录，用于展开技能文件路径
 * @returns {string} 写入 agent.config.systemPrompt 的整段提示词
 */
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

/**
 * 补齐创建 / 更新智能体的入参：缺 key / name 用默认值，技能和提示词由 Node 写入。
 * @param {object} client 已 connect 的 SDK 客户端
 * @param {object} args 前端传来的 agent 字段
 * @returns {Promise<object>} 可直接交给 agent.create / agent.update 的对象
 */
async function workbenchAgentInput(client, args) {
  const ctx = await client.getContext()
  const input = args && typeof args === 'object' ? args : {}
  // key / name：前端可覆盖；空串当没传。
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

/**
 * 把 HTTP method 名转到 SDK 调用。未知 method 抛 VALIDATION_ERROR。
 * @param {object} client SDK 客户端
 * @param {string} method 如 session.send
 * @param {object} args 该方法的入参
 * @returns {Promise<*>} SDK 原样返回值
 */
async function dispatch(client, method, args) {
  switch (method) {
    case 'context.get': // 当前项目目录、权限等宿主上下文
      return client.getContext()
    case 'userinfo.get': // 登录用户名 / token
      return client.userinfo()
    case 'agent.create': // 按 key 创建或覆盖配置；已存在不新建，created 仍为 false。技能 / 提示词由 Node 写入。
      return client.agent.create(await workbenchAgentInput(client, args))
    case 'agent.update': // 部分更新；内容和库里一样则不写库。同样补技能 / 提示词。
      return client.agent.update(await workbenchAgentInput(client, args))
    case 'agent.get': // 按 id 查一条智能体
      return client.agent.get(args)
    case 'agent.list': // 列出本应用下的智能体
      return client.agent.list()
    case 'catalog.slash': // slash / skill 目录
      return client.catalog.slash()
    case 'catalog.models': // 已启用模型
      return client.catalog.models()
    case 'catalog.systemPrompts': // 系统提示词列表
      return client.catalog.systemPrompts()
    case 'catalog.agentTools': // 可配置内置工具
      return client.catalog.agentTools(args)
    case 'knowledgeBase.query': // 知识库列表
      return client.knowledgeBase.query(args)
    case 'knowledgeBase.queryDirectory': // 知识库目录
      return client.knowledgeBase.queryDirectory(args)
    case 'session.create': // 新建会话，可带上第一条用户消息
      return client.session.create(args)
    case 'session.list': // 分页列会话
      return client.session.list(args)
    case 'session.search': // 按标题 / 内容搜会话
      return client.session.search(args)
    case 'session.get': // 拉会话 + 最近消息
      return client.session.get(args)
    case 'session.rename': // 改会话标题
      return client.session.rename(args)
    case 'session.pin': // 置顶 / 取消置顶
      return client.session.pin(args)
    case 'session.setModel': // 切换会话模型
      return client.session.setModel(args)
    case 'session.setPermissionMode': // 权限模式
      return client.session.setPermissionMode(args)
    case 'session.setOrchestrationPolicy': // 主动协作
      return client.session.setOrchestrationPolicy(args)
    case 'session.getGenerationSettings': // 读模型高级设置
      return client.session.getGenerationSettings(args)
    case 'session.updateGenerationSettings': // 写模型高级设置
      return client.session.updateGenerationSettings(args)
    case 'session.getContextOccupancy': // 上下文占用
      return client.session.getContextOccupancy(args)
    case 'session.setToolMode': // Agent / Code / Minimal
      return client.session.setToolMode(args)
    case 'session.getDisabledAgentTools': // 关闭的内置工具
      return client.session.getDisabledAgentTools(args)
    case 'session.updateDisabledAgentTools': // 写入关闭的内置工具
      return client.session.updateDisabledAgentTools(args)
    case 'session.delete': // 删会话
      return client.session.delete(args)
    case 'session.send': // 已有会话里发一条，开始生成
      return client.session.send(args)
    case 'session.retryMessage': // 从某条消息重试
      return client.session.retryMessage(args)
    case 'session.deleteMessage': // 删除该条及之后的消息
      return client.session.deleteMessage(args)
    case 'session.editUserMessage': // 改用户消息文本
      return client.session.editUserMessage(args)
    case 'session.fork': // 从某条消息分出新会话
      return client.session.fork(args)
    case 'session.stop': // 停止当前生成
      return client.session.stop(args)
    case 'session.steer': // 生成中追加指令
      return client.session.steer(args)
    case 'chat.respondToolInteraction': // 工具授权或回答提问
      return client.respondToolInteraction(args)
    case 'devtools.open': // 对本应用侧栏页面弹出独立 DevTools
      return client.openDevTools()
    case 'disconnect': // HTTP 模式不断宿主进程，只回 ok
      return { ok: true }
    default: {
      // 未登记的 method：不当成 SDK 调用，避免误打宿主。
      const error = new Error(`Unknown method: ${method}`)
      error.code = 'VALIDATION_ERROR'
      throw error
    }
  }
}

class JiaorongService extends Service {
  /**
   * 把任意抛错收成前端能展示的 { ok, code, message }。
   * @param {unknown} error SDK 或业务抛出的值
   * @returns {{ ok: false, code: string, message: string }}
   */
  errorPayload(error) {
    const code = isJiaorongError(error)
      ? error.code // 宿主 / SDK 标准错误，沿用原 code。
      : typeof error?.code === 'string'
        ? error.code // 本层自己标的 VALIDATION_ERROR 等。
        : 'GENERATION_FAILED' // 无 code 的普通 Error，不当成校验失败。
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, code, message }
  }

  /**
   * 按错误码选 HTTP 状态。
   * @param {string} code errorPayload 里的 code
   * @returns {number} 401 / 503 / 400 / 500
   */
  statusForCode(code) {
    if (code === 'UNAUTHORIZED') return 401 // 桥 token 或登录无效。
    if (code === 'JIAORONG_NOT_RUNNING') return 503 // 宿主没起来，稍后可重试。
    if (code === 'VALIDATION_ERROR') return 400 // 入参或 method 不合法。
    return 500 // 其余当内部错误。
  }

  /**
   * 向所有 SSE 连接写一条 sdk 事件。
   * @param {string} event 如 chat.stream.updated
   * @param {*} payload SDK 事件负载
   * @returns {void}
   */
  writeSse(event, payload) {
    const clients = this.app.sdkSseClients
    if (!clients?.size) return // 没人订阅，少一次 JSON.stringify。
    const chunk = `event: sdk\ndata: ${JSON.stringify({ event, payload })}\n\n`
    for (const res of [...clients]) {
      try {
        res.write(chunk)
      } catch {
        clients.delete(res) // 写失败当连接已死，立刻摘掉。
      }
    }
  }

  /**
   * 把 SSE_EVENTS 绑到 SDK 客户端，每个进程只绑一次。
   * @param {object} client 已 connect 的客户端
   * @returns {void}
   */
  bindEvents(client) {
    if (this.app.jiaorongEventsBound) return // 避免重复 on，事件会翻倍推。
    this.app.jiaorongEventsBound = true
    for (const event of SSE_EVENTS) {
      client.on(event, (payload) => this.writeSse(event, payload))
    }
  }

  /**
   * 取进程内唯一的 SDK 客户端；没有则 attach 桥再 connect。
   * 无参数。
   * 返回：Promise，resolve 为 SDK 客户端。
   */
  async getClient() {
    if (this.app.jiaorongClient) return this.app.jiaorongClient // 已连过，复用同一份。
    const { attachJiaorong } = require('../lib/attachJiaorong')
    await attachJiaorong(this.config.jiaorong.appId)
    const client = await connect({
      appId: this.config.jiaorong.appId,
      runtime: 'node'
    })
    this.app.jiaorongClient = client
    this.bindEvents(client)
    return client
  }

  /**
   * Controller 调用入口：确保客户端就绪后 dispatch。
   * @param {string} method SDK 方法名
   * @param {object} [args] 入参，缺省当 {}
   * @returns {Promise<*>} dispatch 结果
   */
  async invoke(method, args) {
    const client = await this.getClient()
    return dispatch(client, method, args ?? {})
  }
}

module.exports = JiaorongService
