/** 桥错误码与 `JiaorongError`。宿主失败会转成这个类。 */

/** 稳定错误码。 */
export const ERROR_CODES = {
  /** 不在交融 webview / 未注入桥。 */
  NOT_IN_JIAORONG: 'NOT_IN_JIAORONG',
  /** 包内 Node 连不上或页面未连上。 */
  JIAORONG_NOT_RUNNING: 'JIAORONG_NOT_RUNNING',
  /** 应用不存在或不可见。 */
  APP_NOT_FOUND: 'APP_NOT_FOUND',
  /** 未登录。 */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 入参不合法。 */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 智能体不存在。 */
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  /** 会话不存在。 */
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  /** 技能不存在。 */
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  /** 无权限或越权 appId。 */
  FORBIDDEN: 'FORBIDDEN',
  /** 当前不能插入引导。 */
  STEER_NOT_ALLOWED: 'STEER_NOT_ALLOWED',
  /** 生成失败。 */
  GENERATION_FAILED: 'GENERATION_FAILED',
  /** 超时。 */
  TIMEOUT: 'TIMEOUT',
  /** 连接已断开。 */
  DISCONNECTED: 'DISCONNECTED'
} as const

/** 错误码字面量。 */
export type JiaorongErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** SDK 抛出的错误，带 `code`。 */
export class JiaorongError extends Error {
  /** 稳定码。 */
  readonly code: JiaorongErrorCode

  /**
   * @param code 错误码
   * @param message 说明
   */
  constructor(code: JiaorongErrorCode, message: string) {
    super(message)
    this.name = 'JiaorongError'
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /** JSON 序列化。 */
  toJSON() {
    return { name: this.name, code: this.code, message: this.message }
  }
}

/**
 * 是否为 SDK 错误（含跨 realm 的同名 Error）。
 * @param error 未知值
 */
export function isJiaorongError(error: unknown): error is JiaorongError {
  if (error instanceof JiaorongError) return true
  return (
    error instanceof Error &&
    error.name === 'JiaorongError' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  )
}

/**
 * 把未知失败收成 `JiaorongError`。
 * @param error invoke reject 或任意 throw
 */
export function toJiaorongError(error: unknown): JiaorongError {
  if (error instanceof JiaorongError) return error
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    /** 桥返回的 code。 */
    const code = String((error as { code: unknown }).code) as JiaorongErrorCode
    /** 桥返回的 message。 */
    const message = String((error as { message: unknown }).message)
    if (code in ERROR_CODES || Object.values(ERROR_CODES).includes(code)) {
      return new JiaorongError(code, message)
    }
  }
  if (error instanceof Error) {
    return new JiaorongError('GENERATION_FAILED', error.message)
  }
  return new JiaorongError('GENERATION_FAILED', String(error))
}

const HOST_ERROR_ZH: Record<string, string> = {
  'common.error.requestFailed': '请求失败，请稍后重试，或开新对话',
  'common.error.createChatFailed': '创建会话失败',
  'common.error.selectChatFailed': '选择会话失败',
  'common.error.renameChatFailed': '重命名会话失败',
  'common.error.deleteChatFailed': '删除会话失败',
  'common.error.cleanMessagesFailed': '清空会话消息失败',
  'common.error.userCanceledGeneration': '已停止生成',
  'common.error.sessionInterrupted': '会话意外中断，生成未完成',
  'common.error.noModelResponse': '模型未返回任何内容，可能是超时了',
  'common.error.invalidJson': '无效的 JSON 格式',
  'common.error.maximumToolCallsReached': '达到最大工具调用次数',
  'common.error.causeOfError': '错误可能原因：',
  'common.error.error400': '请求错误，参数或者兼容问题',
  'common.error.error401': '身份验证失败，配置了错误的 API Key 或者域名',
  'common.error.error403': '禁止访问该模型，可能是余额不足或者没有权限访问',
  'common.error.error404': '请求地址不存在，配置的域名或者模型名错误了',
  'common.error.error429': '请求速度过快，被服务商限制了访问频率',
  'common.error.error500': '服务器出错了，请求的服务当前可能不太稳定，可以稍后再试试',
  'common.error.error502': '网关错误，请求的服务当前可能不太稳定，可以稍后再试试',
  'common.error.error503': '服务不可用，请求的服务可能当前不稳定，可以稍后再试试',
  'common.error.error504': '请求超时，请检查网络后再试试',
  'common.error.operationFailed': '操作失败',
  'common.error.invalidQuestionRequest': '问题请求无效'
}

/** 错误码 → 中文。 */
const CODE_ZH: Record<JiaorongErrorCode, string> = {
  NOT_IN_JIAORONG: '请从交融侧栏打开本应用',
  JIAORONG_NOT_RUNNING: '交融 Node 服务未启动',
  APP_NOT_FOUND: '未找到该应用',
  UNAUTHORIZED: '未登录',
  VALIDATION_ERROR: '参数无效',
  AGENT_NOT_FOUND: '未找到智能体',
  SESSION_NOT_FOUND: '未找到会话',
  SKILL_NOT_FOUND: '未找到技能',
  FORBIDDEN: '没有权限',
  STEER_NOT_ALLOWED: '当前不能插入追问',
  GENERATION_FAILED: '生成失败',
  TIMEOUT: '请求超时',
  DISCONNECTED: '连接已断开'
}

/** 已知英文错误句 → 中文。 */
const KNOWN_ENGLISH_ZH: Record<string, string> = {
  'Not logged in': '未登录',
  'Failed to reach Node HTTP': '无法连接 Node 服务',
  'Failed to fetch': '无法连接 Node 服务',
  'failed to fetch': '无法连接 Node 服务',
  'Load failed': '无法连接 Node 服务',
  'fetch failed': '无法连接 Node 服务',
  'NetworkError when attempting to fetch resource.': '无法连接 Node 服务',
  'httpBase is required': '需要提供 httpBase',
  'httpBase is required when runtime is http': 'runtime 为 http 时必须提供 httpBase',
  'appId is required': '需要提供 appId',
  'appId must be lowercase letters, digits, and hyphens': 'appId 只能包含小写字母、数字和连字符',
  'runtime must be web, node, or http': 'runtime 必须是 web、node 或 http',
  'session.steer is unavailable': '当前无法插入追问',
  'waitForTurn cancelled by disconnect': '连接已断开，已取消等待本轮结束',
  'key and name are required': '需要提供 key 和 name',
  'key or id is required': '需要提供 key 或 id',
  'agentId is required': '需要提供 agentId',
  'query is required': '需要提供 query',
  'sessionId is required': '需要提供 sessionId',
  'sessionId and title are required': '需要提供 sessionId 和 title',
  'sessionId, messageId and toolCallId are required': '需要提供 sessionId、messageId 和 toolCallId',
  'sessionId and mode are required': '需要提供 sessionId 和 mode',
  'sessionId and policy are required': '需要提供 sessionId 和 policy',
  'pinned must be a boolean': 'pinned 必须是布尔值',
  'Steer was not accepted for this turn': '当前不能插入追问',
  'Pin is not available': '当前不能置顶会话',
  'Invalid app bridge invoke': '无效的应用调用',
  'App is not visible to the current user': '当前用户看不到该应用',
  'Node runtime is not hosted by JiaorongAI.': '交融 Node 服务未启动',
  'invoke failed': '请求失败',
  'appId does not match the open app': 'appId 与当前打开的应用不一致',
  'path must be an absolute directory': 'path 必须是绝对路径',
  'Directory must be chosen with the folder picker': '目录必须通过文件夹选择器选择',
  'Session not found': '未找到会话',
  'Request failed': '请求失败',
  'projectDir must be an absolute path': 'projectDir 必须是绝对路径',
  'projectDir is not allowed for this app': 'projectDir 不允许用于本应用',
  'Interaction queue out of order. Please handle the first pending item.':
    '请先处理当前待回答的问题',
  'No pending interaction found in target message.': '当前没有待回答的追问',
  'Answer cannot be empty.': '回答不能为空',
  'Invalid response kind for question interaction.': '当前追问不能这样回答',
  'Invalid response kind for permission interaction.': '当前批准不能这样回答',
  'Invalid action block without tool call id.': '追问数据无效'
}

/** 从错误里抽出稳定码。 */
function extractCode(error: unknown): JiaorongErrorCode | undefined {
  if (isJiaorongError(error)) return error.code
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    /** 错误码。 */
    const code = (error as { code: string }).code
    if (code in ERROR_CODES) return code as JiaorongErrorCode
  }
  return undefined
}

/** 从错误里抽出文案。 */
function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error
  /** 原始入参。 */
  const raw =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? (error as { message: unknown }).message
        : undefined
  if (typeof raw === 'string' && raw.trim() && raw !== '[object Object]') return raw
  return ''
}

/** 是否用户取消。 */
export function isUserCanceledError(text?: string | null): boolean {
  if (!text) return false
  /** 待处理的值。 */
  const value = text.trim()
  return (
    value === 'common.error.userCanceledGeneration' ||
    value.includes('userCanceledGeneration') ||
    value === '已停止生成' ||
    value === '用户取消了生成' ||
    value === '使用者取消了生成' ||
    value === '用戶取消了生成' ||
    value === 'User canceled generation' ||
    value === 'User cancelled generation' ||
    value === 'Generation canceled' ||
    value === 'Generation cancelled' ||
    value === '已取消'
  )
}

/** 错误文案转中文。 */
export function localizeErrorText(text?: string | null): string {
  if (!text) return ''
  /** trim 后的字符串。 */
  const trimmed = text.trim()
  if (HOST_ERROR_ZH[trimmed]) return HOST_ERROR_ZH[trimmed]
  if (KNOWN_ENGLISH_ZH[trimmed]) return KNOWN_ENGLISH_ZH[trimmed]
  if (trimmed.startsWith('Assistant message not found:')) return '未找到助手消息'
  if (trimmed.startsWith('Session not found:')) return '未找到会话'
  /** HTTP 状态文案匹配。 */
  const httpMatch = trimmed.match(/^HTTP\s+(\d{3})$/)
  if (httpMatch) return `HTTP 请求失败（${httpMatch[1]}）`
  return trimmed
}

/** 格式化 JiaorongError 展示文案。 */
export function formatJiaorongError(error: unknown): string {
  /** 消息或文案。 */
  const message = extractMessage(error)
  /** 本地化后的文案。 */
  const localized = localizeErrorText(message)
  if (isUserCanceledError(message) || isUserCanceledError(localized)) {
    return '已停止生成'
  }
  if (localized) return localized
  /** 错误码。 */
  const code = extractCode(error)
  if (code) return CODE_ZH[code]
  return '请求失败'
}
