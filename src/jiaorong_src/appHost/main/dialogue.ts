/** 智能体/会话/发消息等对话桥，走 JiaorongAppDialoguePort。 */

import { JIAORONG_DEFAULT_MODEL_ID, JIAORONG_DEFAULT_PROVIDER_ID } from '@jiaorong/brand'
import { bridgeError } from '../bridgeErrors'
import type { JiaorongAppRuntime } from '../types'
import {
  appAgentIds,
  getAppAgentBinding,
  getAppAgentBindingByAgentId,
  listAppAgentBindings,
  runAppAgentMapExclusive,
  upsertAppAgentBinding,
  type JiaorongAppAgentBinding
} from './agentMap'
import type {
  JiaorongAppAgentRecord,
  JiaorongAppDialoguePort,
  JiaorongAppHostDeps,
  JiaorongAppSessionRecord,
  JiaorongAppUpdateAgentInput
} from './deps'
import {
  canonicalizeGuestPath,
  forgetSessionOwner,
  hasPickedDirectory,
  isAbsoluteGuestPath,
  isGuestPathAllowed,
  isGuestPathInsideDir,
  isJiaorongGuestKnowledgeBaseContextFile,
  materializeGuestFiles,
  normalizeGuestKnowledgeBaseContextFile,
  rememberPickedDirectory,
  rememberSessionOwner
} from './guest'
import { readAuthToken } from './userIdentity'

/** 与超级智能体 `messageWindowPolicy` 对齐：首屏 10，单次最多 50。 */
const DEFAULT_RESTORE_LIMIT = 10
/** 会话列表默认条数。 */
const DEFAULT_SESSION_LIST_LIMIT = 10
/** 单次分页上限。 */
const MAX_PAGE_LIMIT = 50
/** 扫历史会话项目目录时每页条数。 */
const EXISTING_DIR_PAGE_SIZE = 50

/**
 * 把分页 limit 收成 (0, MAX_PAGE_LIMIT] 的整数。
 * @param value 入参 limit
 * @param fallback 非法时用的缺省值
 */
export function readPageLimit(value: unknown, fallback: number): number {
  // 非数字、NaN 或非正数都用缺省
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback
  // 向下取整并夹到单页上限
  return Math.min(Math.floor(value), MAX_PAGE_LIMIT)
}

/** invoke args 的对象形态。 */
type InvokeRecord = Record<string, unknown>

/**
 * 把 invoke args 收成对象；非对象则空对象。
 * @param args invoke 原始入参
 */
function asRecord(args: unknown): InvokeRecord {
  return args && typeof args === 'object' ? (args as InvokeRecord) : {}
}

/**
 * 读对象上的字符串字段并 trim。
 * @param record invoke 入参对象
 * @param key 字段名
 */
function readString(record: InvokeRecord, key: string): string {
  /** 该字段的原始值。 */
  const value = record[key]
  // 非字符串按空串处理，由调用方决定是报错还是用缺省
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 创建智能体的应用内标识。文档用 agentKey；旧调用传的 key 仍可用。
 * 两个都传时用 agentKey。
 * @param record invoke 入参对象
 */
function readCreateAgentKey(record: InvokeRecord): string {
  return readString(record, 'agentKey') || readString(record, 'key')
}

/**
 * 取出对话端口；未接线则 FORBIDDEN。
 * @param deps 超级智能体依赖
 */
function requireDialogue(deps: JiaorongAppHostDeps): JiaorongAppDialoguePort {
  // presenter 没注入对话端口
  if (!deps.dialogue) {
    throw bridgeError('FORBIDDEN', '对话桥不可用')
  }
  return deps.dialogue
}

/**
 * 未登录则 UNAUTHORIZED。
 * @param deps 超级智能体依赖
 */
function requireToken(deps: JiaorongAppHostDeps): void {
  // 对话类方法一律要求登录
  if (!readAuthToken(deps.getAuthSession())) {
    throw bridgeError('UNAUTHORIZED', '未登录')
  }
}

/**
 * DeepChat agent + 绑定信息转成应用侧智能体记录。
 * @param agent DeepChat 智能体记录
 * @param binding 本应用 key ↔ agentId
 * @param created 是否本次新建
 * @param updated 是否本次写入
 */
function toAppAgent(
  agent: JiaorongAppAgentRecord,
  binding: JiaorongAppAgentBinding,
  created: boolean,
  updated = false
) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    enabled: agent.enabled,
    description: agent.description,
    icon: agent.icon,
    avatar: agent.avatar ?? null,
    config: agent.config ?? null,
    // 应用侧只认自己的 key，不回传 DeepChat 内部字段
    key: binding.key,
    appId: binding.appId,
    // 应用智能体对超级智能体界面隐藏
    hidden: true as const,
    source: 'app' as const,
    // 告诉应用本次是新建还是覆盖
    created,
    updated
  }
}

/**
 * JSON 序列化后比较，用于判断配置是否变化。
 * @param left 左值
 * @param right 右值
 */
function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * patch 相对当前 agent 是否有字段变化；没变化就不必写库。
 * @param agent 当前 DeepChat 智能体记录
 * @param patch 待写入的补丁
 */
function agentNeedsWrite(
  agent: JiaorongAppAgentRecord,
  patch: JiaorongAppUpdateAgentInput
): boolean {
  // 名称变了
  if (patch.name !== undefined && patch.name !== agent.name) return true
  // 启用状态变了
  if (patch.enabled !== undefined && patch.enabled !== agent.enabled) return true
  // 描述变了（空串与 undefined 视为相同）
  if (patch.description !== undefined && (patch.description || '') !== (agent.description || '')) {
    return true
  }
  // 图标变了
  if (patch.icon !== undefined && (patch.icon || '') !== (agent.icon || '')) return true
  // 头像变了，结构不定所以按 JSON 比
  if (patch.avatar !== undefined && !jsonEqual(patch.avatar ?? null, agent.avatar ?? null)) {
    return true
  }
  // config 只做字段级比较，允许保留 DeepChat 侧其它字段
  if (patch.config) {
    /** 当前 agent.config；非对象则当空对象比。 */
    const current =
      agent.config && typeof agent.config === 'object'
        ? agent.config
        : ({} as Record<string, unknown>)
    /** key：config 字段名；value：本次 patch 值。 */
    for (const [key, value] of Object.entries(patch.config)) {
      // 任一字段不同就要写
      if (!jsonEqual(current[key], value)) return true
    }
  }
  // 全部一致，不用写库
  return false
}

/** 未传 assistantModel 时写入的默认服务商/模型。 */
const SUPER_AGENT_DEFAULT_MODEL = {
  providerId: JIAORONG_DEFAULT_PROVIDER_ID,
  modelId: JIAORONG_DEFAULT_MODEL_ID
}

/**
 * 从对象读 providerId + modelId。
 * @param value `assistantModel` 入参
 */
function readModelPair(value: unknown): { providerId: string; modelId: string } | null {
  // 非对象或数组
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  /** assistantModel 对象。 */
  const record = value as Record<string, unknown>
  /** 服务商 id。 */
  const providerId = typeof record.providerId === 'string' ? record.providerId.trim() : ''
  /** 模型 id。 */
  const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : ''
  // 两个都得有，否则视为没指定模型
  if (!providerId || !modelId) return null
  return { providerId, modelId }
}

/**
 * 未指定模型时写入超级智能体默认模型。
 * @param config 过滤后的 agent config
 */
function applySuperAgentDefaultModel(config: Record<string, unknown>): Record<string, unknown> {
  // 显式传 null 表示「不指定模型」，保留原样
  if (config.assistantModel === null) return config
  /** 解析出的或默认的模型对。 */
  const preset = readModelPair(config.assistantModel) ?? SUPER_AGENT_DEFAULT_MODEL
  // 两处都写，保证新旧读取口径一致
  return {
    ...config,
    assistantModel: preset,
    defaultModelPreset: preset
  }
}

/**
 * 会话记录转成应用侧会话结构。
 * @param session DeepChat 会话记录
 */
function toAppSession(session: JiaorongAppSessionRecord) {
  return {
    id: session.id,
    agentId: session.agentId,
    title: session.title,
    projectDir: session.projectDir,
    isPinned: session.isPinned,
    sessionKind: session.sessionKind,
    orchestrationPolicy: session.orchestrationPolicy,
    toolModeOverride: session.toolModeOverride,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    // 未设置模型时给空串，避免应用侧处理 undefined
    providerId: session.providerId ?? '',
    modelId: session.modelId ?? '',
    permissionMode: session.permissionMode
  }
}

/**
 * 把本页会话的 projectDir 记入窗口目录白名单。
 * @param webContentsId guest 窗口 id
 * @param sessions 本页会话
 */
function rememberSessionDirs(webContentsId: number, sessions: JiaorongAppSessionRecord[]) {
  /** session：本页一条会话。 */
  for (const session of sessions) {
    /** 规范化后的项目目录。 */
    const dir = session.projectDir?.trim()
    // 有项目目录才记
    if (dir) rememberPickedDirectory(webContentsId, dir)
  }
}

/**
 * 只保留本应用 `app.<id>.*` 与非 `app.` 前缀技能名。
 * @param appId 应用 id
 * @param names 应用传来的技能名数组
 */
function sanitizeSkillNames(appId: string, names: unknown): string[] {
  // 不是数组就当没传
  if (!Array.isArray(names)) return []
  /** 本应用技能前缀 app.<id>. */
  const prefix = `app.${appId}.`
  /** name：候选技能名；只留本应用 app.<id>.* 与非 app. 前缀。 */
  return names.filter(
    (name): name is string =>
      // 必须是非空字符串
      typeof name === 'string' &&
      name.trim().length > 0 &&
      // 别的应用的 app.* 技能一律拒绝
      (!name.startsWith('app.') || name.startsWith(prefix))
  )
}

/**
 * 附件是否自带 content / dataBase64，可去掉未授权 path。
 * @param row 单条附件对象
 */
function hasGuestFilePayload(row: Record<string, unknown>): boolean {
  // 有正文就能丢掉 path 继续使用
  return (
    (typeof row.content === 'string' && Boolean(row.content.trim())) ||
    (typeof row.dataBase64 === 'string' && Boolean(row.dataBase64.trim()))
  )
}

/**
 * 过滤 guest 附件：知识库 context 放行，绝对路径须在白名单。
 * @param files 应用传来的附件数组
 * @param webContentsId guest 窗口 id，用于目录白名单
 * @param projectDir 会话项目目录，作为额外白名单根
 */
function sanitizeGuestFiles(
  files: unknown,
  webContentsId: number,
  projectDir: string | null | undefined
): unknown[] | undefined {
  // 不是数组就当没附件
  if (!Array.isArray(files)) return undefined
  /** 项目目录规范化根，用于路径白名单。 */
  const allowedRoot = typeof projectDir === 'string' ? canonicalizeGuestPath(projectDir) : ''
  /** 过滤后仍放行的附件。 */
  const next: unknown[] = []
  /** 因路径未授权丢掉的附件数。 */
  let dropped = 0
  /** file：入参数组里的一条附件。 */
  for (const file of files) {
    // 非对象附件丢掉
    if (!file || typeof file !== 'object') continue
    /** 单条附件对象。 */
    const row = file as Record<string, unknown>
    // 知识库上下文附件不落盘，规范化后放行
    if (isJiaorongGuestKnowledgeBaseContextFile(row)) {
      next.push(normalizeGuestKnowledgeBaseContextFile(row))
      continue
    }
    /** 附件绝对路径。 */
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
    // 没给路径，交给上层按正文处理
    if (!filePath) {
      next.push(file)
      continue
    }
    // 给了路径但不是绝对路径
    if (!isAbsoluteGuestPath(filePath)) {
      // 也没有正文，这条附件没法用
      if (!hasGuestFilePayload(row)) {
        dropped += 1
        continue
      }
      /** 去掉未授权 path 后的附件对象。 */
      const rest = { ...row }
      // 相对路径不可信，删掉只留正文
      delete rest.path
      next.push(rest)
      continue
    }
    /** 路径是否落在当前项目目录内。 */
    const underProject = Boolean(allowedRoot) && isGuestPathInsideDir(allowedRoot, filePath)
    // 项目目录内，或用户在本窗口选过该目录
    if (underProject || isGuestPathAllowed(webContentsId, filePath)) {
      next.push(file)
    } else {
      // 越权路径，计数后统一报错
      dropped += 1
    }
  }
  // 只要有一条越权就整体失败，避免应用以为发成功了
  if (dropped > 0) {
    throw bridgeError('FORBIDDEN', '附件路径未授权，请通过「+」重新选择文件')
  }
  return next
}

/**
 * agent.create/update 只保留允许写入的 config 字段。
 * @param appId 应用 id，用于技能白名单
 * @param config 应用传来的 config
 */
export function sanitizeCreateConfig(
  appId: string,
  config: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  // 没传 config
  if (!config) return undefined
  /** 允许写入的 config 字段。 */
  const next: Record<string, unknown> = {}
  /** 过滤后的技能名。 */
  const allowed = sanitizeSkillNames(appId, config.enabledSkillNames)
  // 空数组不下发，避免把已有技能清空
  if (allowed.length > 0) next.enabledSkillNames = allowed
  // 系统提示词只认字符串
  if (typeof config.systemPrompt === 'string') next.systemPrompt = config.systemPrompt
  // 权限模式只认这三个枚举值
  if (
    config.permissionMode === 'default' ||
    config.permissionMode === 'auto_approve' ||
    config.permissionMode === 'full_access'
  ) {
    next.permissionMode = config.permissionMode
  }
  // 显式 null 表示不指定模型，需要保留
  if (config.assistantModel === null) {
    next.assistantModel = null
  } else if (config.assistantModel && typeof config.assistantModel === 'object') {
    // 对象形态：只挑 providerId / modelId 两个字段
    /** assistantModel 对象。 */
    const model = config.assistantModel as Record<string, unknown>
    /** 服务商 id。 */
    const providerId = typeof model.providerId === 'string' ? model.providerId.trim() : ''
    /** 模型 id。 */
    const modelId = typeof model.modelId === 'string' ? model.modelId.trim() : ''
    // 两个都齐才写入
    if (providerId && modelId) next.assistantModel = { providerId, modelId }
  }
  // 一个字段都没剩下就当没传
  return Object.keys(next).length > 0 ? next : undefined
}

/**
 * agent.create 新建与覆盖共用的可写字段。
 * @param appId 应用 id
 * @param key 应用内智能体 key
 * @param record invoke 入参
 * @param name 智能体名称
 */
function buildCreateAgentWrite(appId: string, key: string, record: InvokeRecord, name: string) {
  /** 允许写入的 config（技能/提示词/模型/权限）。 */
  const sanitized = sanitizeCreateConfig(
    appId,
    // 只有对象形态的 config 才参与过滤
    record.config && typeof record.config === 'object'
      ? (record.config as Record<string, unknown>)
      : null
  )
  return {
    name,
    // 只有显式 false 才算停用
    enabled: record.enabled !== false,
    // 空串转 undefined，避免覆盖已有值为空
    description: readString(record, 'description') || undefined,
    icon: readString(record, 'icon') || undefined,
    avatar: record.avatar,
    // 打上应用标记，官方列表据此隐藏该智能体
    config: applySuperAgentDefaultModel({
      ...(sanitized ?? {}),
      jiaorongAppId: appId,
      jiaorongAppKey: key
    })
  }
}

/**
 * 是否绝对路径。
 * @param value 路径
 */
export function isAbsoluteFsPath(value: string): boolean {
  return isAbsoluteGuestPath(value)
}

/**
 * 会话必须存在且 agent 属于本应用。
 * @param dialogue 对话端口
 * @param appId 应用 id
 * @param sessionId 会话 id
 */
async function requireOwnedSession(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  sessionId: string
): Promise<JiaorongAppSessionRecord> {
  /** 会话记录。 */
  const session = await dialogue.getSession(sessionId)
  // 会话不存在
  if (!session) {
    throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
  }
  // 会话挂在别的应用（或官方）的智能体上
  if (!appAgentIds(appId).has(session.agentId)) {
    throw bridgeError('FORBIDDEN', '会话不属于本应用')
  }
  return session
}

/**
 * 消息必须属于该会话。
 * @param dialogue 对话端口
 * @param appId 应用 id
 * @param sessionId 会话 id
 * @param messageId 消息 id
 */
async function requireOwnedMessage(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  sessionId: string,
  messageId: string
) {
  // 先校验会话归属
  await requireOwnedSession(dialogue, appId, sessionId)
  /** 该 messageId 对应的消息。 */
  const message = await dialogue.getMessage(messageId)
  // 消息不存在，或属于别的会话
  if (!message || message.sessionId !== sessionId) {
    throw bridgeError('SESSION_NOT_FOUND', '未找到该消息')
  }
  return message
}

/**
 * 附件准备需要用户处理时 accepted=false。
 * @param preparation 附件准备状态
 */
function isBlockedAttachment(preparation: unknown): boolean {
  // 只有 needs_user_action 算被挡住
  return Boolean(
    preparation &&
    typeof preparation === 'object' &&
    (preparation as { status?: string }).status === 'needs_user_action'
  )
}

/**
 * 用 agentId 或 agentKey 解析本应用智能体。
 * @param dialogue 对话端口
 * @param appId 应用 id
 * @param record invoke 入参
 */
async function resolveOwnedAgentId(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  record: InvokeRecord
): Promise<string> {
  /** DeepChat 智能体 id。 */
  const agentId = readString(record, 'agentId')
  /** 应用内智能体 key。 */
  const agentKey = readString(record, 'agentKey')
  // 优先按 agentId 解析
  if (agentId) {
    /** 应用 key ↔ agentId 绑定。 */
    const binding = getAppAgentBindingByAgentId(appId, agentId)
    // 该 agentId 不是本应用创建的
    if (!binding) throw bridgeError('FORBIDDEN', '智能体不属于本应用')
    /** DeepChat 智能体记录。 */
    const agent = await dialogue.getAgent(agentId)
    // 绑定还在但智能体已被删
    if (!agent) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return agentId
  }
  // 退化到按应用 key 解析
  if (agentKey) {
    /** 应用 key ↔ agentId 绑定。 */
    const binding = getAppAgentBinding(appId, agentKey)
    // 本应用没用这个 key 建过智能体
    if (!binding) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return binding.agentId
  }
  // 两个标识都没给
  throw bridgeError('VALIDATION_ERROR', '需要提供 agentId 或 agentKey')
}

/**
 * 发送内容里的 files / activeSkills 做白名单与技能过滤。
 * @param appId 应用 id
 * @param webContentsId guest 窗口 id
 * @param projectDir 会话项目目录
 * @param content 应用传来的发送内容
 */
function sanitizeSendContent(
  appId: string,
  webContentsId: number,
  projectDir: string | null | undefined,
  content: string | Record<string, unknown>
): string | Record<string, unknown> {
  // 纯文本不需要过滤
  if (typeof content === 'string') return content
  /** 附件数组。 */
  const files = Array.isArray(content.files)
    ? (sanitizeGuestFiles(content.files, webContentsId, projectDir) ?? [])
    : content.files
  /** 过滤后的 activeSkills。 */
  const skills = sanitizeSkillNames(appId, content.activeSkills)
  return {
    ...content,
    files,
    // 没有可用技能时不下发该字段
    activeSkills: skills.length > 0 ? skills : undefined
  }
}

/**
 * sanitize 后再把附件落地到超级智能体可读路径。
 * @param deps 超级智能体依赖（文件端口）
 * @param appId 应用 id
 * @param webContentsId guest 窗口 id
 * @param projectDir 会话项目目录
 * @param content 应用传来的发送内容
 */
async function prepareGuestSendContent(
  deps: JiaorongAppHostDeps,
  appId: string,
  webContentsId: number,
  projectDir: string | null | undefined,
  content: string | Record<string, unknown>
): Promise<string | Record<string, unknown>> {
  /** 过滤 files / activeSkills 后的发送内容。 */
  const sanitized = sanitizeSendContent(appId, webContentsId, projectDir, content)
  // 纯文本直接发
  if (typeof sanitized === 'string') return sanitized
  // 带附件：落临时文件并抽取可读内容
  return {
    ...sanitized,
    files: await materializeGuestFiles(sanitized.files, deps.files)
  }
}

/**
 * 读 content，必须是 string 或对象。
 * @param record invoke 入参
 */
function readSendContent(record: InvokeRecord): string | Record<string, unknown> {
  /** 发送内容。 */
  const content = record.content
  // 纯文本
  if (typeof content === 'string') return content
  // 结构化内容（带 files / activeSkills 等）
  if (content && typeof content === 'object') return content as Record<string, unknown>
  // 其余类型都算没传
  throw bridgeError('VALIDATION_ERROR', '需要提供 content')
}

/**
 * 消息分页游标 { orderSeq, id }。
 * @param record invoke 入参
 */
function readMessageCursor(record: InvokeRecord): { orderSeq: number; id: string } | null {
  /** 分页游标。 */
  const cursor = record.cursor
  // 首页不传游标
  if (!cursor || typeof cursor !== 'object') return null
  /** 消息分页游标对象。 */
  const row = cursor as Record<string, unknown>
  /** 消息顺序号。 */
  const orderSeq = row.orderSeq
  /** 记录 id。 */
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  // 游标两个字段都得合法，否则当首页处理
  if (typeof orderSeq !== 'number' || Number.isNaN(orderSeq) || !id) return null
  return { orderSeq, id }
}

/**
 * 会话分页游标 { updatedAt, id }。
 * @param record invoke 入参
 */
function readSessionCursor(record: InvokeRecord): { updatedAt: number; id: string } | null {
  /** 分页游标。 */
  const cursor = record.cursor
  // 首页不传游标
  if (!cursor || typeof cursor !== 'object') return null
  /** 会话分页游标对象。 */
  const row = cursor as Record<string, unknown>
  /** 会话更新时间。 */
  const updatedAt = row.updatedAt
  /** 记录 id。 */
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  // 游标两个字段都得合法，否则当首页处理
  if (typeof updatedAt !== 'number' || Number.isNaN(updatedAt) || !id) return null
  return { updatedAt, id }
}

/**
 * 本应用已有会话是否用过该项目目录。
 * @param dialogue 对话端口
 * @param appId 应用 id
 * @param dir 规范化后的目录
 */
async function directoryExistsOnOwnedSessions(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  dir: string
): Promise<boolean> {
  /** agentId：本应用绑定过的 DeepChat 智能体。 */
  for (const agentId of appAgentIds(appId)) {
    /** 分页游标。 */
    let cursor: { updatedAt: number; id: string } | null = null
    // 翻完该 agent 下的历史会话
    for (;;) {
      /** 分页结果。 */
      const page = await dialogue.listLightweight({
        agentId,
        limit: EXISTING_DIR_PAGE_SIZE,
        cursor,
        // 子智能体会话不参与目录归属判断
        includeSubagents: false
      })
      /** item：本页一条轻量会话，看 projectDir 是否用过 dir。 */
      if (page.items.some((item) => canonicalizeGuestPath(item.projectDir ?? '') === dir)) {
        return true
      }
      // 没有下一页
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
  }
  // 全部翻完都没用过这个目录
  return false
}

/**
 * 校验 projectDir：须绝对路径且已选过或历史会话用过。
 * @param dialogue 对话端口
 * @param appId 应用 id
 * @param webContentsId guest 窗口 id
 * @param projectDir 入参项目目录
 */
async function resolveAllowedProjectDir(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  webContentsId: number,
  projectDir: unknown
): Promise<string | null | undefined> {
  // 未传：沿用默认行为
  if (projectDir === undefined) return undefined
  // 显式 null：不带项目目录
  if (projectDir === null) return null
  // 类型不对
  if (typeof projectDir !== 'string') {
    throw bridgeError('VALIDATION_ERROR', 'projectDir 必须是绝对路径')
  }
  // 相对路径一律拒绝
  if (!isAbsoluteFsPath(projectDir)) {
    throw bridgeError('VALIDATION_ERROR', 'projectDir 必须是绝对路径')
  }
  /** 规范化后的项目目录。 */
  const dir = canonicalizeGuestPath(projectDir)
  // 规范化不出结果（如非法 Windows 路径）
  if (!dir) return null
  // 用户在本窗口选过这个目录
  if (hasPickedDirectory(webContentsId, dir)) return dir
  // 本应用历史会话用过，视为已授权并补记白名单
  if (await directoryExistsOnOwnedSessions(dialogue, appId, dir)) {
    rememberPickedDirectory(webContentsId, dir)
    return dir
  }
  // 凭空指定别人的目录，拒绝
  throw bridgeError('VALIDATION_ERROR', 'projectDir 不允许用于本应用')
}

/** 对话类 invoke：agent / session / chat。 */
export async function handleDialogueInvoke(
  /** 超级智能体对话/鉴权依赖。 */
  deps: JiaorongAppHostDeps,
  /** 当前应用运行时。 */
  runtime: JiaorongAppRuntime,
  /** 桥方法名，如 agent.create。 */
  method: string,
  /** invoke 入参。 */
  args: unknown,
  /** guest webContents id，用于目录/附件白名单。 */
  webContentsId: number
): Promise<unknown> {
  requireToken(deps)
  /** 对话端口。 */
  const dialogue = requireDialogue(deps)
  /** 对象形态的 args。 */
  const record = asRecord(args)
  /** 当前应用 id。 */
  const appId = runtime.id

  // 按方法名分发；不认的方法返回 undefined 交给上层报错
  switch (method) {
    // 按 agentKey 创建智能体，已存在则按同一份字段覆盖；旧字段 key 仍可用
    case 'agent.create': {
      /** 应用内智能体标识，绑定表仍记在 key 上。 */
      const key = readCreateAgentKey(record)
      /** 智能体名称。 */
      const name = readString(record, 'name')
      // agentKey（或旧的 key）与 name 都必填
      if (!key || !name) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 agentKey 和 name')
      }
      // 同一 appId+key 串行，避免并发建出两个 agent
      return runAppAgentMapExclusive(appId, key, async () => {
        /** 与首次创建相同的可写字段；已存在时用来覆盖。 */
        const write = buildCreateAgentWrite(appId, key, record, name)
        /** 已有绑定。 */
        const existing = getAppAgentBinding(appId, key)
        // 之前建过
        if (existing) {
          /** DeepChat 智能体记录。 */
          const agent = await dialogue.getAgent(existing.agentId)
          // 智能体还在（没被官方侧删掉）
          if (agent) {
            // 字段没变化就不写库，直接回当前状态
            if (!agentNeedsWrite(agent, write)) {
              return toAppAgent(agent, existing, false, false)
            }
            /** 覆盖后的 DeepChat 智能体。 */
            const updated = await dialogue.updateDeepChatAgent(existing.agentId, write)
            // 写入过程中被删
            if (!updated) {
              throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
            }
            return toAppAgent(updated, existing, false, true)
          }
        }
        /** 新建的 DeepChat 智能体。 */
        const created = await dialogue.createDeepChatAgent(write)
        /** 应用 key ↔ agentId 绑定。 */
        const binding = { appId, key, agentId: created.id }
        // 落绑定表，官方列表据此隐藏该智能体
        upsertAppAgentBinding(binding)
        return toAppAgent(created, binding, true)
      })
    }
    // 按 id 或 key 改智能体，只写应用真正传了的字段
    case 'agent.update': {
      /** 应用内智能体 key。 */
      const key = readString(record, 'key')
      /** DeepChat 智能体 id。 */
      const id = readString(record, 'id')
      /** 应用 key ↔ agentId 绑定。 */
      const binding = id
        ? getAppAgentBindingByAgentId(appId, id)
        : key
          ? getAppAgentBinding(appId, key)
          : null
      // 两个标识都没命中本应用的绑定
      if (!binding) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      /** DeepChat 智能体记录。 */
      const agent = await dialogue.getAgent(binding.agentId)
      // 绑定还在但智能体已被删
      if (!agent) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      /** 待写入的智能体字段。 */
      const patch: JiaorongAppUpdateAgentInput = {}
      // 用 `in` 判断，区分「没传」和「传了空值」
      if ('name' in record) {
        /** 智能体名称。 */
        const name = readString(record, 'name')
        // 传了 name 就不能为空
        if (!name) throw bridgeError('VALIDATION_ERROR', '需要提供 name')
        patch.name = name
      }
      // 只有显式 false 才算停用
      if ('enabled' in record) patch.enabled = record.enabled !== false
      if ('description' in record) patch.description = readString(record, 'description')
      if ('icon' in record) patch.icon = readString(record, 'icon')
      if ('avatar' in record) patch.avatar = record.avatar
      // config 走同一份白名单过滤
      if (record.config && typeof record.config === 'object') {
        /** 允许写入的 config（技能/提示词/模型/权限）。 */
        const sanitized = sanitizeCreateConfig(appId, record.config as Record<string, unknown>)
        // 过滤后仍有可写字段
        if (sanitized) {
          patch.config = {
            ...sanitized,
            // 重新打上应用标记，防止被覆盖掉
            jiaorongAppId: appId,
            jiaorongAppKey: binding.key
          }
        }
      }
      // 没有实际变化就不写库
      if (!agentNeedsWrite(agent, patch)) {
        return toAppAgent(agent, binding, false, false)
      }
      /** 更新后的 DeepChat 智能体。 */
      const updated = await dialogue.updateDeepChatAgent(binding.agentId, patch)
      // 写入过程中被删
      if (!updated) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      return toAppAgent(updated, binding, false, true)
    }
    // 按 id 或 key 读一条智能体，读不到返回 null 而不是报错
    case 'agent.get': {
      /** 应用内智能体 key。 */
      const key = readString(record, 'key')
      /** DeepChat 智能体 id。 */
      const id = readString(record, 'id')
      /** 应用 key ↔ agentId 绑定。 */
      const binding = id
        ? getAppAgentBindingByAgentId(appId, id)
        : key
          ? getAppAgentBinding(appId, key)
          : null
      // 没绑定过就当作不存在
      if (!binding) return null
      /** DeepChat 智能体记录。 */
      const agent = await dialogue.getAgent(binding.agentId)
      // 智能体已被删也返回 null
      return agent ? toAppAgent(agent, binding, false) : null
    }
    // 列出本应用的全部智能体
    case 'agent.list': {
      /** 全部 DeepChat agent。 */
      const agents = await dialogue.listAgents()
      /** agentId → DeepChat agent。 */
      const byId = new Map(agents.map((agent) => [agent.id, agent]))
      return {
        /** binding：本应用一条 key ↔ agentId。 */
        agents: listAppAgentBindings(appId).flatMap((binding) => {
          /** DeepChat 智能体记录。 */
          const agent = byId.get(binding.agentId)
          // 绑定还在但智能体已删，跳过这条
          return agent ? [toAppAgent(agent, binding, false)] : []
        })
      }
    }
    // 新建会话，可同时带首轮消息
    case 'session.create': {
      /** DeepChat 智能体 id。 */
      const agentId = await resolveOwnedAgentId(dialogue, appId, record)
      /** 首轮用户输入。 */
      const message = typeof record.message === 'string' ? record.message : ''
      /** 会话项目目录。 */
      const projectDir = await resolveAllowedProjectDir(
        dialogue,
        appId,
        webContentsId,
        record.projectDir
      )
      /** 新建会话，含 optional 首轮 initialTurn。 */
      const created = await dialogue.createSession(
        {
          agentId,
          message,
          // 附件先做路径白名单，再落地成可读文件
          files: await materializeGuestFiles(
            sanitizeGuestFiles(record.files, webContentsId, projectDir),
            deps.files
          ),
          // 联网搜索只在显式传布尔时下发
          search: typeof record.search === 'boolean' ? record.search : undefined,
          // 行内标记只认数组
          inlineItems: Array.isArray(record.inlineItems) ? record.inlineItems : undefined,
          projectDir,
          // 空串转 undefined，交给超级智能体用默认模型
          providerId: readString(record, 'providerId') || undefined,
          modelId: readString(record, 'modelId') || undefined,
          // 权限模式只认这三个枚举值
          permissionMode:
            record.permissionMode === 'default' ||
            record.permissionMode === 'auto_approve' ||
            record.permissionMode === 'full_access'
              ? record.permissionMode
              : undefined,
          // 编排策略只认这两个枚举值
          orchestrationPolicy:
            record.orchestrationPolicy === 'proactive' || record.orchestrationPolicy === 'explicit'
              ? record.orchestrationPolicy
              : undefined,
          // 技能名过滤掉别的应用的 app.* 技能
          activeSkills: sanitizeSkillNames(appId, record.activeSkills)
        },
        webContentsId
      )
      // 记下会话归属，官方列表与事件分发都靠它
      rememberSessionOwner(created.id, appId)
      // 项目目录进白名单，后续附件免再授权
      if (typeof projectDir === 'string' && projectDir) {
        rememberPickedDirectory(webContentsId, projectDir)
      }
      /** initialTurn：首轮结果；session：去掉首轮后的会话记录。 */
      const { initialTurn, ...session } = created
      return {
        session: toAppSession(session),
        // 附件需要用户处理时告诉应用「没被接受」
        accepted: !isBlockedAttachment(initialTurn?.attachmentPreparation),
        // 没有首轮就不下发该字段
        ...(initialTurn ? { initialTurn } : {})
      }
    }
    // 分页列某个智能体下的会话
    case 'session.list': {
      /** session.list 指定的 agentId。 */
      const requestedAgentId = readString(record, 'agentId')
      // 必须指定智能体
      if (!requestedAgentId) throw bridgeError('VALIDATION_ERROR', '需要提供 agentId')
      // 只能列本应用的智能体
      if (!appAgentIds(appId).has(requestedAgentId)) {
        throw bridgeError('FORBIDDEN', '智能体不属于本应用')
      }
      /** 分页结果。 */
      const page = await dialogue.listLightweight({
        agentId: requestedAgentId,
        limit: readPageLimit(record.limit, DEFAULT_SESSION_LIST_LIMIT),
        cursor: readSessionCursor(record),
        includeSubagents:
          typeof record.includeSubagents === 'boolean' ? record.includeSubagents : false
      })
      // 把历史会话的项目目录记进白名单
      rememberSessionDirs(webContentsId, page.items)
      return {
        items: page.items.map(toAppSession),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore
      }
    }
    // 搜历史，只搜本应用智能体下的会话
    case 'session.search': {
      /** 搜索词。 */
      const query = readString(record, 'query')
      // 搜索词必填
      if (!query) throw bridgeError('VALIDATION_ERROR', '需要提供 query')
      /** 本应用全部 agentId。 */
      const ownedIds = [...appAgentIds(appId)]
      // 本应用还没有智能体，直接返回空
      if (ownedIds.length === 0) return { hits: [] }
      /** 搜索可选参数。 */
      const options =
        record.options && typeof record.options === 'object'
          ? (record.options as { limit?: number })
          : undefined
      /** 搜索命中。 */
      const hits = await dialogue.searchHistory(query, {
        ...options,
        // 强制限定在本应用的智能体内
        includeAgentIds: ownedIds
      })
      return { hits }
    }
    // 读会话详情 + 首页消息
    case 'session.get': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      /** 会话记录。 */
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      // 补记归属，兼容早期建的会话
      rememberSessionOwner(sessionId, appId)
      /** 会话权限模式。 */
      let permissionMode = session.permissionMode
      // 记录里没带权限模式，且端口支持单独读
      if (!permissionMode && dialogue.getPermissionMode) {
        try {
          permissionMode = await dialogue.getPermissionMode(sessionId)
        } catch {
          // 读失败按未知处理，不阻断详情
          permissionMode = undefined
        }
      }
      /** 分页结果。 */
      const page = await dialogue.listMessagesPage(sessionId, {
        limit: readPageLimit(record.limit, DEFAULT_RESTORE_LIMIT),
        cursor: readMessageCursor(record)
      })
      return {
        session: toAppSession({ ...session, permissionMode }),
        messages: page.messages,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore
      }
    }
    // 改会话标题
    case 'session.rename': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 会话标题。 */
      const title = readString(record, 'title')
      // 两个都必填
      if (!sessionId || !title) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 title')
      }
      // 先校验归属
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.renameSession(sessionId, title)
      return { session: toAppSession(session) }
    }
    // 删会话，同时清掉归属记录
    case 'session.delete': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.deleteSession(sessionId)
      // 会话没了，归属表也要清
      forgetSessionOwner(sessionId)
      return { deleted: true as const }
    }
    // 往已有会话发一条消息
    case 'session.send': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      /** 会话记录。 */
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      rememberSessionOwner(sessionId, appId)
      /** 本轮发送结果（requestId / messageId / 附件准备）。 */
      const result = await dialogue.sendMessage(
        sessionId,
        // 发送内容按会话的项目目录做附件白名单
        await prepareGuestSendContent(
          deps,
          appId,
          webContentsId,
          session.projectDir,
          readSendContent(record)
        )
      )
      // 附件需要用户处理：明确告诉应用这轮没被接受
      if (isBlockedAttachment(result.attachmentPreparation)) {
        return {
          accepted: false as const,
          requestId: result.requestId,
          messageId: result.messageId,
          attachmentPreparation: result.attachmentPreparation
        }
      }
      return {
        accepted: true as const,
        requestId: result.requestId,
        messageId: result.messageId,
        attachmentPreparation: result.attachmentPreparation
      }
    }
    // 停当前生成；可用 requestId 反查会话
    case 'session.stop': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 本轮请求 id。 */
      const requestId = readString(record, 'requestId')
      /** stop 解析出的会话 id。 */
      let targetId = sessionId
      // 没给 sessionId 时，用 requestId 对应的消息反查
      if (!targetId && requestId) {
        /** requestId 对应的消息，用来反查 sessionId。 */
        const message = await dialogue.getMessage(requestId)
        targetId = message?.sessionId ?? ''
      }
      // 两个标识都没有，或反查不到会话
      if (!targetId) return { stopped: false }
      await requireOwnedSession(dialogue, appId, targetId)
      await dialogue.cancelGeneration(targetId)
      return { stopped: true }
    }
    // 生成中插入追问
    case 'session.steer': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      /** 会话记录。 */
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      /** 插入追问的结果（userMessage / 附件准备）。 */
      const result = await dialogue.steerActiveTurn(
        sessionId,
        await prepareGuestSendContent(
          deps,
          appId,
          webContentsId,
          session.projectDir,
          readSendContent(record)
        )
      )
      // 附件被挡住，这轮追问没插进去
      if (isBlockedAttachment(result.attachmentPreparation)) {
        return { accepted: false as const, message: null }
      }
      // 当前不在生成中，不允许追问
      if (!result.userMessage) {
        throw bridgeError('STEER_NOT_ALLOWED', '当前不能插入追问')
      }
      return { accepted: true as const, message: result.userMessage }
    }
    // 回答工具批准 / 工具提问
    case 'chat.respondToolInteraction': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      /** 工具调用 id。 */
      const toolCallId = readString(record, 'toolCallId')
      // 三个标识缺一不可
      if (!sessionId || !messageId || !toolCallId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 toolCallId')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 工具批准/提问处理后的结果。 */
      const result = await dialogue.respondToolInteraction({
        sessionId,
        messageId,
        toolCallId,
        // 回答体结构由工具决定，原样透传
        response: record.response
      })
      return { accepted: true as const, ...result }
    }
    // 改会话权限模式
    case 'session.setPermissionMode': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 权限模式。 */
      const mode = readString(record, 'mode')
      // 两个都必填
      if (!sessionId || !mode) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 mode')
      }
      // 只认这三个枚举值
      if (mode !== 'default' && mode !== 'auto_approve' && mode !== 'full_access') {
        throw bridgeError('VALIDATION_ERROR', 'mode 必须是 default、auto_approve 或 full_access')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.setPermissionMode(sessionId, mode)
      return { ok: true as const, mode }
    }
    // 切换会话模型
    case 'session.setModel': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 服务商 id。 */
      const providerId = readString(record, 'providerId')
      /** 模型 id。 */
      const modelId = readString(record, 'modelId')
      // 三个都必填
      if (!sessionId || !providerId || !modelId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId、providerId 和 modelId')
      }
      // 宿主没接模型切换能力
      if (!deps.setSessionModel) {
        throw bridgeError('FORBIDDEN', '当前不能切换模型')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await deps.setSessionModel(sessionId, providerId, modelId)
      // 切换过程中会话被删
      if (!session) throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
      return { session: toAppSession(session) }
    }
    // 改编排策略
    case 'session.setOrchestrationPolicy': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 编排策略。 */
      const policy =
        record.policy === 'proactive' || record.policy === 'explicit' ? record.policy : ''
      // 会话必填，策略只认两个枚举值（非法值会收成空串）
      if (!sessionId || !policy) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 policy')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 写入后的编排策略。 */
      const next = await dialogue.updateOrchestrationPolicy(sessionId, policy)
      // 回传落库后的值，可能与请求不同
      return { ok: true as const, policy: next }
    }
    // 读模型高级设置
    case 'session.getGenerationSettings': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      // 端口没实现该能力
      if (!dialogue.getGenerationSettings) {
        throw bridgeError('FORBIDDEN', '当前不能读取模型高级设置')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { settings: await dialogue.getGenerationSettings(sessionId) }
    }
    // 写模型高级设置
    case 'session.updateGenerationSettings': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 生成参数。 */
      const settings =
        // 只认普通对象，数组与标量都算没传
        record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)
          ? (record.settings as Record<string, unknown>)
          : null
      // 两个都必填
      if (!sessionId || !settings) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 settings')
      }
      // 端口没实现该能力
      if (!dialogue.updateGenerationSettings) {
        throw bridgeError('FORBIDDEN', '当前不能写入模型高级设置')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      // 回传落库后的设置
      return { settings: await dialogue.updateGenerationSettings(sessionId, settings) }
    }
    // 读上下文占用
    case 'session.getContextOccupancy': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      // 端口没实现该能力
      if (!dialogue.getContextOccupancy) {
        throw bridgeError('FORBIDDEN', '当前不能读取上下文占用')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { occupancy: await dialogue.getContextOccupancy(sessionId) }
    }
    // 覆盖工具模式（agent / code / minimal / null 取消）
    case 'session.setToolMode': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      // 端口没实现该能力
      if (!dialogue.setToolMode) {
        throw bridgeError('FORBIDDEN', '当前不能切换工具模式')
      }
      /** 工具模式覆盖：三个枚举值原样收下，显式 null 表示取消覆盖，其余归为「没传对」。 */
      const override =
        record.override === 'agent' || record.override === 'code' || record.override === 'minimal'
          ? record.override
          : record.override === null
            ? null
            : undefined
      // undefined 说明值非法
      if (override === undefined) {
        throw bridgeError('VALIDATION_ERROR', 'override 必须是 agent、code、minimal 或 null')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.setToolMode(sessionId, override)
      // 写入过程中会话被删
      if (!session) throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
      return { session: toAppSession(session) }
    }
    // 读已关闭的内置工具
    case 'session.getDisabledAgentTools': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      // 端口没实现该能力
      if (!dialogue.getDisabledAgentTools) {
        throw bridgeError('FORBIDDEN', '当前不能读取工具开关')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { toolNames: await dialogue.getDisabledAgentTools(sessionId) }
    }
    // 写已关闭的内置工具
    case 'session.updateDisabledAgentTools': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 关闭的内置工具名：不是数组就算没传，是数组则只留字符串项。 */
      const toolNames = Array.isArray(record.toolNames)
        ? record.toolNames.filter((item): item is string => typeof item === 'string')
        : null
      // 两个都必填（空数组是合法的「全部打开」）
      if (!sessionId || !toolNames) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 toolNames')
      }
      // 端口没实现该能力
      if (!dialogue.updateDisabledAgentTools) {
        throw bridgeError('FORBIDDEN', '当前不能写入工具开关')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      // 回传落库后的工具名列表
      return { toolNames: await dialogue.updateDisabledAgentTools(sessionId, toolNames) }
    }
    // 置顶 / 取消置顶会话
    case 'session.pin': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      // 会话 id 必填
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      // pinned 必须是明确的布尔值
      if (typeof record.pinned !== 'boolean') {
        throw bridgeError('VALIDATION_ERROR', 'pinned 必须是布尔值')
      }
      // 端口没实现该能力
      if (!dialogue.toggleSessionPinned) {
        throw bridgeError('FORBIDDEN', '当前不能置顶会话')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.toggleSessionPinned(sessionId, record.pinned)
      return { session: toAppSession(session) }
    }
    // 重试某条消息的生成
    case 'session.retryMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      // 两个都必填
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      // 会话归属 + 消息归属都要校验
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      rememberSessionOwner(sessionId, appId)
      /** 重试该消息的生成结果。 */
      const result = await dialogue.retryMessage(sessionId, messageId)
      // 附件需要用户处理，这轮没被接受
      if (isBlockedAttachment(result.attachmentPreparation)) {
        return {
          accepted: false as const,
          requestId: result.requestId,
          messageId: result.messageId,
          attachmentPreparation: result.attachmentPreparation
        }
      }
      return {
        accepted: true as const,
        requestId: result.requestId,
        messageId: result.messageId,
        attachmentPreparation: result.attachmentPreparation
      }
    }
    // 删一条消息
    case 'session.deleteMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      // 两个都必填
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      await dialogue.deleteMessage(sessionId, messageId)
      return { deleted: true as const }
    }
    // 改用户消息正文
    case 'session.editUserMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      /** 编辑后的用户消息正文。 */
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      // 会话与消息 id 都必填
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      // 不允许把消息改成空白
      if (!text) throw bridgeError('VALIDATION_ERROR', '编辑内容不能为空')
      /** 待编辑的消息（必须是 user）。 */
      const message = await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      // 助手消息不允许编辑
      if (message.role !== 'user') {
        throw bridgeError('VALIDATION_ERROR', '只能编辑用户消息')
      }
      /** 编辑后的用户消息。 */
      const updated = await dialogue.editUserMessage(sessionId, messageId, text)
      return { message: updated }
    }
    // 从某条消息分叉出新会话
    case 'session.fork': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      // 两个都必填
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      /** fork 源会话。 */
      const source = await requireOwnedSession(dialogue, appId, sessionId)
      // 分叉点消息也必须属于本应用
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      /** 会话记录。 */
      const session = await dialogue.forkSession(sessionId, messageId)
      // 新会话同样归属本应用
      rememberSessionOwner(session.id, appId)
      // 新会话自带项目目录就记它，否则沿用源会话的
      if (session.projectDir) {
        rememberPickedDirectory(webContentsId, session.projectDir)
      } else if (source.projectDir) {
        rememberPickedDirectory(webContentsId, source.projectDir)
      }
      return { session: toAppSession(session) }
    }
    // 不认的方法：交给上层 bridge 报「未知方法」
    default:
      return undefined
  }
}
