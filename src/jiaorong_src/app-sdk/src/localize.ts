import { ERROR_CODES, isJiaorongError, type JiaorongErrorCode } from './errors'

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

const KNOWN_ENGLISH_ZH: Record<string, string> = {
  'Not logged in': '未登录',
  'Failed to reach Node HTTP': '无法连接 Node 服务',
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
  'projectDir is not allowed for this app': 'projectDir 不允许用于本应用'
}

function extractCode(error: unknown): JiaorongErrorCode | undefined {
  if (isJiaorongError(error)) return error.code
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code
    if (code in ERROR_CODES) return code as JiaorongErrorCode
  }
  return undefined
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error == null) return ''
  return String(error)
}

export function isUserCanceledError(text?: string | null): boolean {
  if (!text) return false
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

export function localizeErrorText(text?: string | null): string {
  if (!text) return ''
  const trimmed = text.trim()
  if (HOST_ERROR_ZH[trimmed]) return HOST_ERROR_ZH[trimmed]
  if (KNOWN_ENGLISH_ZH[trimmed]) return KNOWN_ENGLISH_ZH[trimmed]
  if (/^common\.error\.[A-Za-z0-9]+$/.test(trimmed)) return '请求失败'
  const httpMatch = trimmed.match(/^HTTP\s+(\d{3})$/)
  if (httpMatch) return `HTTP 请求失败（${httpMatch[1]}）`
  return trimmed
}

export function formatJiaorongError(error: unknown): string {
  const message = extractMessage(error)
  const localized = localizeErrorText(message)
  if (isUserCanceledError(message) || isUserCanceledError(localized)) {
    return '已停止生成'
  }
  if (localized) return localized
  const code = extractCode(error)
  if (code) return CODE_ZH[code]
  return '请求失败'
}
