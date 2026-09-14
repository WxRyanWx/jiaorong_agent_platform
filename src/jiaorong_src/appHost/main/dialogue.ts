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
  isJiaorongGuestKnowledgeBaseContextFile,
  materializeGuestFiles,
  normalizeGuestKnowledgeBaseContextFile
} from './guestAttachments'
import {
  canonicalizeGuestPath,
  forgetSessionOwner,
  hasPickedDirectory,
  isAbsoluteGuestPath,
  isGuestPathAllowed,
  isGuestPathInsideDir,
  rememberPickedDirectory,
  rememberSessionOwner
} from './guestBind'
import { readAuthToken } from './userIdentity'

/** 与超级智能体 `messageWindowPolicy` 对齐：首屏 10，单次最多 50。 */
const DEFAULT_RESTORE_LIMIT = 10
/** 会话列表默认条数。 */
const DEFAULT_SESSION_LIST_LIMIT = 10
/** 单次分页上限。 */
const MAX_PAGE_LIMIT = 50
/** 扫历史会话项目目录时每页条数。 */
const EXISTING_DIR_PAGE_SIZE = 50

/** 把分页 limit 收成 (0, MAX_PAGE_LIMIT] 的整数。 */
export function readPageLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), MAX_PAGE_LIMIT)
}

/** invoke args 的对象形态。 */
type InvokeRecord = Record<string, unknown>

/** 把 invoke args 收成对象；非对象则空对象。 */
function asRecord(args: unknown): InvokeRecord {
  return args && typeof args === 'object' ? (args as InvokeRecord) : {}
}

/** 读对象上的字符串字段并 trim。 */
function readString(record: InvokeRecord, key: string): string {
  /** 该字段的原始值。 */
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** 取出对话端口；未接线则 FORBIDDEN。 */
function requireDialogue(deps: JiaorongAppHostDeps): JiaorongAppDialoguePort {
  if (!deps.dialogue) {
    throw bridgeError('FORBIDDEN', '对话桥不可用')
  }
  return deps.dialogue
}

/** 未登录则 UNAUTHORIZED。 */
function requireToken(deps: JiaorongAppHostDeps): void {
  if (!readAuthToken(deps.getAuthSession())) {
    throw bridgeError('UNAUTHORIZED', '未登录')
  }
}

/**
 * DeepChat agent + 绑定信息转成 SDK AppAgent。
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
    key: binding.key,
    appId: binding.appId,
    hidden: true as const,
    source: 'app' as const,
    created,
    updated
  }
}

/** JSON 序列化后比较，用于判断配置是否变化。 */
function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** patch 相对当前 agent 是否有字段变化。 */
function agentNeedsWrite(
  agent: JiaorongAppAgentRecord,
  patch: JiaorongAppUpdateAgentInput
): boolean {
  if (patch.name !== undefined && patch.name !== agent.name) return true
  if (patch.enabled !== undefined && patch.enabled !== agent.enabled) return true
  if (patch.description !== undefined && (patch.description || '') !== (agent.description || '')) {
    return true
  }
  if (patch.icon !== undefined && (patch.icon || '') !== (agent.icon || '')) return true
  if (patch.avatar !== undefined && !jsonEqual(patch.avatar ?? null, agent.avatar ?? null)) {
    return true
  }
  if (patch.config) {
    /** 当前 agent.config；非对象则当空对象比。 */
    const current =
      agent.config && typeof agent.config === 'object'
        ? agent.config
        : ({} as Record<string, unknown>)
    /** key：config 字段名；value：本次 patch 值。 */
    for (const [key, value] of Object.entries(patch.config)) {
      if (!jsonEqual(current[key], value)) return true
    }
  }
  return false
}

/** 未传 assistantModel 时写入的默认服务商/模型。 */
const SUPER_AGENT_DEFAULT_MODEL = {
  providerId: JIAORONG_DEFAULT_PROVIDER_ID,
  modelId: JIAORONG_DEFAULT_MODEL_ID
}

/** 从对象读 providerId + modelId。 */
function readModelPair(value: unknown): { providerId: string; modelId: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  /** assistantModel 对象。 */
  const record = value as Record<string, unknown>
  /** 服务商 id。 */
  const providerId = typeof record.providerId === 'string' ? record.providerId.trim() : ''
  /** 模型 id。 */
  const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : ''
  if (!providerId || !modelId) return null
  return { providerId, modelId }
}

/** 未指定模型时写入超级智能体默认模型。 */
function applySuperAgentDefaultModel(config: Record<string, unknown>): Record<string, unknown> {
  if (config.assistantModel === null) return config
  /** 解析出的或默认的模型对。 */
  const preset = readModelPair(config.assistantModel) ?? SUPER_AGENT_DEFAULT_MODEL
  return {
    ...config,
    assistantModel: preset,
    defaultModelPreset: preset
  }
}

/** 会话记录转成 SDK 会话结构。 */
function toSdkSession(session: JiaorongAppSessionRecord) {
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
    providerId: session.providerId ?? '',
    modelId: session.modelId ?? '',
    permissionMode: session.permissionMode
  }
}

/** 把本页会话的 projectDir 记入窗口目录白名单。 */
function rememberSessionDirs(webContentsId: number, sessions: JiaorongAppSessionRecord[]) {
  /** session：本页一条会话。 */
  for (const session of sessions) {
    /** 规范化后的项目目录。 */
    const dir = session.projectDir?.trim()
    if (dir) rememberPickedDirectory(webContentsId, dir)
  }
}

/** 只保留本应用 app.<id>.* 与非 app. 前缀技能名。 */
function sanitizeSkillNames(appId: string, names: unknown): string[] {
  if (!Array.isArray(names)) return []
  /** 本应用技能前缀 app.<id>. */
  const prefix = `app.${appId}.`
  /** name：候选技能名；只留本应用 app.<id>.* 与非 app. 前缀。 */
  return names.filter(
    (name): name is string =>
      typeof name === 'string' &&
      name.trim().length > 0 &&
      (!name.startsWith('app.') || name.startsWith(prefix))
  )
}

/** 附件是否自带 content / dataBase64，可去掉未授权 path。 */
function hasGuestFilePayload(row: Record<string, unknown>): boolean {
  return (
    (typeof row.content === 'string' && Boolean(row.content.trim())) ||
    (typeof row.dataBase64 === 'string' && Boolean(row.dataBase64.trim()))
  )
}

/** 过滤 guest 附件：知识库 context 放行，绝对路径须在白名单。 */
function sanitizeGuestFiles(
  files: unknown,
  webContentsId: number,
  projectDir: string | null | undefined
): unknown[] | undefined {
  if (!Array.isArray(files)) return undefined
  /** 项目目录规范化根，用于路径白名单。 */
  const allowedRoot = typeof projectDir === 'string' ? canonicalizeGuestPath(projectDir) : ''
  /** 过滤后仍放行的附件。 */
  const next: unknown[] = []
  /** 因路径未授权丢掉的附件数。 */
  let dropped = 0
  /** file：入参数组里的一条附件。 */
  for (const file of files) {
    if (!file || typeof file !== 'object') continue
    /** 单条附件对象。 */
    const row = file as Record<string, unknown>
    if (isJiaorongGuestKnowledgeBaseContextFile(row)) {
      next.push(normalizeGuestKnowledgeBaseContextFile(row))
      continue
    }
    /** 附件绝对路径。 */
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
    if (!filePath) {
      next.push(file)
      continue
    }
    if (!isAbsoluteGuestPath(filePath)) {
      if (!hasGuestFilePayload(row)) {
        dropped += 1
        continue
      }
      /** 去掉未授权 path 后的附件对象。 */
      const rest = { ...row }
      delete rest.path
      next.push(rest)
      continue
    }
    /** 路径是否落在当前项目目录内。 */
    const underProject = Boolean(allowedRoot) && isGuestPathInsideDir(allowedRoot, filePath)
    if (underProject || isGuestPathAllowed(webContentsId, filePath)) {
      next.push(file)
    } else {
      dropped += 1
    }
  }
  if (dropped > 0) {
    throw bridgeError('FORBIDDEN', '附件路径未授权，请通过「+」重新选择文件')
  }
  return next
}

/** agent.create/update 只保留允许写入的 config 字段。 */
export function sanitizeCreateConfig(
  appId: string,
  config: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!config) return undefined
  /** 允许写入的 config 字段。 */
  const next: Record<string, unknown> = {}
  /** 过滤后的技能名。 */
  const allowed = sanitizeSkillNames(appId, config.enabledSkillNames)
  if (allowed.length > 0) next.enabledSkillNames = allowed
  if (typeof config.systemPrompt === 'string') next.systemPrompt = config.systemPrompt
  if (
    config.permissionMode === 'default' ||
    config.permissionMode === 'auto_approve' ||
    config.permissionMode === 'full_access'
  ) {
    next.permissionMode = config.permissionMode
  }
  if (config.assistantModel === null) {
    next.assistantModel = null
  } else if (config.assistantModel && typeof config.assistantModel === 'object') {
    /** assistantModel 对象。 */
    const model = config.assistantModel as Record<string, unknown>
    /** 服务商 id。 */
    const providerId = typeof model.providerId === 'string' ? model.providerId.trim() : ''
    /** 模型 id。 */
    const modelId = typeof model.modelId === 'string' ? model.modelId.trim() : ''
    if (providerId && modelId) next.assistantModel = { providerId, modelId }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/** 是否绝对路径（委托 guestBind）。 */
export function isAbsoluteFsPath(value: string): boolean {
  return isAbsoluteGuestPath(value)
}

/** 会话必须存在且 agent 属于本应用。 */
async function requireOwnedSession(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  sessionId: string
): Promise<JiaorongAppSessionRecord> {
  /** 会话记录。 */
  const session = await dialogue.getSession(sessionId)
  if (!session) {
    throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
  }
  if (!appAgentIds(appId).has(session.agentId)) {
    throw bridgeError('FORBIDDEN', '会话不属于本应用')
  }
  return session
}

/** 消息必须属于该会话。 */
async function requireOwnedMessage(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  sessionId: string,
  messageId: string
) {
  await requireOwnedSession(dialogue, appId, sessionId)
  /** 该 messageId 对应的消息。 */
  const message = await dialogue.getMessage(messageId)
  if (!message || message.sessionId !== sessionId) {
    throw bridgeError('SESSION_NOT_FOUND', '未找到该消息')
  }
  return message
}

/** 附件准备需要用户处理时 accepted=false。 */
function isBlockedAttachment(preparation: unknown): boolean {
  return Boolean(
    preparation &&
    typeof preparation === 'object' &&
    (preparation as { status?: string }).status === 'needs_user_action'
  )
}

/** 用 agentId 或 agentKey 解析本应用智能体。 */
async function resolveOwnedAgentId(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  record: InvokeRecord
): Promise<string> {
  /** DeepChat 智能体 id。 */
  const agentId = readString(record, 'agentId')
  /** 应用内智能体 key。 */
  const agentKey = readString(record, 'agentKey')
  if (agentId) {
    /** 应用 key ↔ agentId 绑定。 */
    const binding = getAppAgentBindingByAgentId(appId, agentId)
    if (!binding) throw bridgeError('FORBIDDEN', '智能体不属于本应用')
    /** DeepChat 智能体记录。 */
    const agent = await dialogue.getAgent(agentId)
    if (!agent) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return agentId
  }
  if (agentKey) {
    /** 应用 key ↔ agentId 绑定。 */
    const binding = getAppAgentBinding(appId, agentKey)
    if (!binding) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return binding.agentId
  }
  throw bridgeError('VALIDATION_ERROR', '需要提供 agentId 或 agentKey')
}

/** 发送内容里的 files / activeSkills 做白名单与技能过滤。 */
function sanitizeSendContent(
  appId: string,
  webContentsId: number,
  projectDir: string | null | undefined,
  content: string | Record<string, unknown>
): string | Record<string, unknown> {
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
    activeSkills: skills.length > 0 ? skills : undefined
  }
}

/** sanitize 后再把附件落地到宿主可读路径。 */
async function prepareGuestSendContent(
  deps: JiaorongAppHostDeps,
  appId: string,
  webContentsId: number,
  projectDir: string | null | undefined,
  content: string | Record<string, unknown>
): Promise<string | Record<string, unknown>> {
  /** 过滤 files / activeSkills 后的发送内容。 */
  const sanitized = sanitizeSendContent(appId, webContentsId, projectDir, content)
  if (typeof sanitized === 'string') return sanitized
  return {
    ...sanitized,
    files: await materializeGuestFiles(sanitized.files, deps.files)
  }
}

/** 读 content，必须是 string 或对象。 */
function readSendContent(record: InvokeRecord): string | Record<string, unknown> {
  /** 发送内容。 */
  const content = record.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return content as Record<string, unknown>
  throw bridgeError('VALIDATION_ERROR', '需要提供 content')
}

/** 消息分页游标 { orderSeq, id }。 */
function readMessageCursor(record: InvokeRecord): { orderSeq: number; id: string } | null {
  /** 分页游标。 */
  const cursor = record.cursor
  if (!cursor || typeof cursor !== 'object') return null
  /** 消息分页游标对象。 */
  const row = cursor as Record<string, unknown>
  /** 消息顺序号。 */
  const orderSeq = row.orderSeq
  /** 记录 id。 */
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (typeof orderSeq !== 'number' || Number.isNaN(orderSeq) || !id) return null
  return { orderSeq, id }
}

/** 会话分页游标 { updatedAt, id }。 */
function readSessionCursor(record: InvokeRecord): { updatedAt: number; id: string } | null {
  /** 分页游标。 */
  const cursor = record.cursor
  if (!cursor || typeof cursor !== 'object') return null
  /** 会话分页游标对象。 */
  const row = cursor as Record<string, unknown>
  /** 会话更新时间。 */
  const updatedAt = row.updatedAt
  /** 记录 id。 */
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (typeof updatedAt !== 'number' || Number.isNaN(updatedAt) || !id) return null
  return { updatedAt, id }
}

/** 本应用已有会话是否用过该项目目录。 */
async function directoryExistsOnOwnedSessions(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  dir: string
): Promise<boolean> {
  /** agentId：本应用绑定过的 DeepChat 智能体。 */
  for (const agentId of appAgentIds(appId)) {
    /** 分页游标。 */
    let cursor: { updatedAt: number; id: string } | null = null
    for (;;) {
      /** 分页结果。 */
      const page = await dialogue.listLightweight({
        agentId,
        limit: EXISTING_DIR_PAGE_SIZE,
        cursor,
        includeSubagents: false
      })
      /** item：本页一条轻量会话，看 projectDir 是否用过 dir。 */
      if (page.items.some((item) => canonicalizeGuestPath(item.projectDir ?? '') === dir)) {
        return true
      }
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
  }
  return false
}

/** 校验 projectDir：须绝对路径且已选过或历史会话用过。 */
async function resolveAllowedProjectDir(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  webContentsId: number,
  projectDir: unknown
): Promise<string | null | undefined> {
  if (projectDir === undefined) return undefined
  if (projectDir === null) return null
  if (typeof projectDir !== 'string') {
    throw bridgeError('VALIDATION_ERROR', 'projectDir 必须是绝对路径')
  }
  if (!isAbsoluteFsPath(projectDir)) {
    throw bridgeError('VALIDATION_ERROR', 'projectDir 必须是绝对路径')
  }
  /** 规范化后的项目目录。 */
  const dir = canonicalizeGuestPath(projectDir)
  if (!dir) return null
  if (hasPickedDirectory(webContentsId, dir)) return dir
  if (await directoryExistsOnOwnedSessions(dialogue, appId, dir)) {
    rememberPickedDirectory(webContentsId, dir)
    return dir
  }
  throw bridgeError('VALIDATION_ERROR', 'projectDir 不允许用于本应用')
}

/** 对话类 invoke：agent / session / chat。 */
export async function handleDialogueInvoke(
  /** 宿主对话/鉴权依赖。 */
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

  switch (method) {
    case 'agent.create': {
      /** 智能体 key。 */
      const key = readString(record, 'key')
      /** 智能体名称。 */
      const name = readString(record, 'name')
      if (!key || !name) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 key 和 name')
      }
      return runAppAgentMapExclusive(appId, key, async () => {
        /** 已有绑定。 */
        const existing = getAppAgentBinding(appId, key)
        if (existing) {
          /** DeepChat 智能体记录。 */
          const agent = await dialogue.getAgent(existing.agentId)
          if (agent) return toAppAgent(agent, existing, false)
        }
        /** 允许写入的 config（技能/提示词/模型/权限）。 */
        const sanitized = sanitizeCreateConfig(
          appId,
          record.config && typeof record.config === 'object'
            ? (record.config as Record<string, unknown>)
            : null
        )
        /** 智能体 config。 */
        const config = applySuperAgentDefaultModel({
          ...(sanitized ?? {}),
          jiaorongAppId: appId,
          jiaorongAppKey: key
        })
        /** 新建的 DeepChat 智能体。 */
        const created = await dialogue.createDeepChatAgent({
          name,
          enabled: record.enabled !== false,
          description: readString(record, 'description') || undefined,
          icon: readString(record, 'icon') || undefined,
          avatar: record.avatar,
          config
        })
        /** 应用 key ↔ agentId 绑定。 */
        const binding = { appId, key, agentId: created.id }
        upsertAppAgentBinding(binding)
        return toAppAgent(created, binding, true)
      })
    }
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
      if (!binding) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      /** DeepChat 智能体记录。 */
      const agent = await dialogue.getAgent(binding.agentId)
      if (!agent) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      /** 待写入的智能体字段。 */
      const patch: JiaorongAppUpdateAgentInput = {}
      if ('name' in record) {
        /** 智能体名称。 */
        const name = readString(record, 'name')
        if (!name) throw bridgeError('VALIDATION_ERROR', '需要提供 name')
        patch.name = name
      }
      if ('enabled' in record) patch.enabled = record.enabled !== false
      if ('description' in record) patch.description = readString(record, 'description')
      if ('icon' in record) patch.icon = readString(record, 'icon')
      if ('avatar' in record) patch.avatar = record.avatar
      if (record.config && typeof record.config === 'object') {
        /** 允许写入的 config（技能/提示词/模型/权限）。 */
        const sanitized = sanitizeCreateConfig(appId, record.config as Record<string, unknown>)
        if (sanitized) {
          patch.config = {
            ...sanitized,
            jiaorongAppId: appId,
            jiaorongAppKey: binding.key
          }
        }
      }
      if (!agentNeedsWrite(agent, patch)) {
        return toAppAgent(agent, binding, false, false)
      }
      /** 更新后的 DeepChat 智能体。 */
      const updated = await dialogue.updateDeepChatAgent(binding.agentId, patch)
      if (!updated) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      return toAppAgent(updated, binding, false, true)
    }
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
      if (!binding) return null
      /** DeepChat 智能体记录。 */
      const agent = await dialogue.getAgent(binding.agentId)
      return agent ? toAppAgent(agent, binding, false) : null
    }
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
          return agent ? [toAppAgent(agent, binding, false)] : []
        })
      }
    }
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
          files: await materializeGuestFiles(
            sanitizeGuestFiles(record.files, webContentsId, projectDir),
            deps.files
          ),
          search: typeof record.search === 'boolean' ? record.search : undefined,
          inlineItems: Array.isArray(record.inlineItems) ? record.inlineItems : undefined,
          projectDir,
          providerId: readString(record, 'providerId') || undefined,
          modelId: readString(record, 'modelId') || undefined,
          permissionMode:
            record.permissionMode === 'default' ||
            record.permissionMode === 'auto_approve' ||
            record.permissionMode === 'full_access'
              ? record.permissionMode
              : undefined,
          orchestrationPolicy:
            record.orchestrationPolicy === 'proactive' || record.orchestrationPolicy === 'explicit'
              ? record.orchestrationPolicy
              : undefined,
          activeSkills: sanitizeSkillNames(appId, record.activeSkills)
        },
        webContentsId
      )
      rememberSessionOwner(created.id, appId)
      if (typeof projectDir === 'string' && projectDir) {
        rememberPickedDirectory(webContentsId, projectDir)
      }
      /** initialTurn：首轮结果；session：去掉首轮后的会话记录。 */
      const { initialTurn, ...session } = created
      return {
        session: toSdkSession(session),
        accepted: !isBlockedAttachment(initialTurn?.attachmentPreparation),
        ...(initialTurn ? { initialTurn } : {})
      }
    }
    case 'session.list': {
      /** session.list 指定的 agentId。 */
      const requestedAgentId = readString(record, 'agentId')
      if (!requestedAgentId) throw bridgeError('VALIDATION_ERROR', '需要提供 agentId')
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
      rememberSessionDirs(webContentsId, page.items)
      return {
        items: page.items.map(toSdkSession),
        nextCursor: page.nextCursor,
        hasMore: page.hasMore
      }
    }
    case 'session.search': {
      /** 搜索词。 */
      const query = readString(record, 'query')
      if (!query) throw bridgeError('VALIDATION_ERROR', '需要提供 query')
      /** 本应用全部 agentId。 */
      const ownedIds = [...appAgentIds(appId)]
      if (ownedIds.length === 0) return { hits: [] }
      /** 搜索可选参数。 */
      const options =
        record.options && typeof record.options === 'object'
          ? (record.options as { limit?: number })
          : undefined
      /** 搜索命中。 */
      const hits = await dialogue.searchHistory(query, {
        ...options,
        includeAgentIds: ownedIds
      })
      return { hits }
    }
    case 'session.get': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      /** 会话记录。 */
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      rememberSessionOwner(sessionId, appId)
      /** 会话权限模式。 */
      let permissionMode = session.permissionMode
      if (!permissionMode && dialogue.getPermissionMode) {
        try {
          permissionMode = await dialogue.getPermissionMode(sessionId)
        } catch {
          permissionMode = undefined
        }
      }
      /** 分页结果。 */
      const page = await dialogue.listMessagesPage(sessionId, {
        limit: readPageLimit(record.limit, DEFAULT_RESTORE_LIMIT),
        cursor: readMessageCursor(record)
      })
      return {
        session: toSdkSession({ ...session, permissionMode }),
        messages: page.messages,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore
      }
    }
    case 'session.rename': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 会话标题。 */
      const title = readString(record, 'title')
      if (!sessionId || !title) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 title')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.renameSession(sessionId, title)
      return { session: toSdkSession(session) }
    }
    case 'session.delete': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.deleteSession(sessionId)
      forgetSessionOwner(sessionId)
      return { deleted: true as const }
    }
    case 'session.send': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      /** 会话记录。 */
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      rememberSessionOwner(sessionId, appId)
      /** 本轮发送结果（requestId / messageId / 附件准备）。 */
      const result = await dialogue.sendMessage(
        sessionId,
        await prepareGuestSendContent(
          deps,
          appId,
          webContentsId,
          session.projectDir,
          readSendContent(record)
        )
      )
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
    case 'session.stop': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 本轮请求 id。 */
      const requestId = readString(record, 'requestId')
      /** stop 解析出的会话 id。 */
      let targetId = sessionId
      if (!targetId && requestId) {
        /** requestId 对应的消息，用来反查 sessionId。 */
        const message = await dialogue.getMessage(requestId)
        targetId = message?.sessionId ?? ''
      }
      if (!targetId) return { stopped: false }
      await requireOwnedSession(dialogue, appId, targetId)
      await dialogue.cancelGeneration(targetId)
      return { stopped: true }
    }
    case 'session.steer': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
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
      if (isBlockedAttachment(result.attachmentPreparation)) {
        return { accepted: false as const, message: null }
      }
      if (!result.userMessage) {
        throw bridgeError('STEER_NOT_ALLOWED', '当前不能插入追问')
      }
      return { accepted: true as const, message: result.userMessage }
    }
    case 'chat.respondToolInteraction': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      /** 工具调用 id。 */
      const toolCallId = readString(record, 'toolCallId')
      if (!sessionId || !messageId || !toolCallId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 toolCallId')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 工具批准/提问处理后的结果。 */
      const result = await dialogue.respondToolInteraction({
        sessionId,
        messageId,
        toolCallId,
        response: record.response
      })
      return { accepted: true as const, ...result }
    }
    case 'session.setPermissionMode': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 权限模式。 */
      const mode = readString(record, 'mode')
      if (!sessionId || !mode) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 mode')
      }
      if (mode !== 'default' && mode !== 'auto_approve' && mode !== 'full_access') {
        throw bridgeError('VALIDATION_ERROR', 'mode 必须是 default、auto_approve 或 full_access')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.setPermissionMode(sessionId, mode)
      return { ok: true as const, mode }
    }
    case 'session.setModel': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 服务商 id。 */
      const providerId = readString(record, 'providerId')
      /** 模型 id。 */
      const modelId = readString(record, 'modelId')
      if (!sessionId || !providerId || !modelId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId、providerId 和 modelId')
      }
      if (!deps.setSessionModel) {
        throw bridgeError('FORBIDDEN', '当前不能切换模型')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await deps.setSessionModel(sessionId, providerId, modelId)
      if (!session) throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
      return { session: toSdkSession(session) }
    }
    case 'session.setOrchestrationPolicy': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 编排策略。 */
      const policy =
        record.policy === 'proactive' || record.policy === 'explicit' ? record.policy : ''
      if (!sessionId || !policy) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 policy')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 写入后的编排策略。 */
      const next = await dialogue.updateOrchestrationPolicy(sessionId, policy)
      return { ok: true as const, policy: next }
    }
    case 'session.getGenerationSettings': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (!dialogue.getGenerationSettings) {
        throw bridgeError('FORBIDDEN', '当前不能读取模型高级设置')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { settings: await dialogue.getGenerationSettings(sessionId) }
    }
    case 'session.updateGenerationSettings': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 生成参数。 */
      const settings =
        record.settings && typeof record.settings === 'object' && !Array.isArray(record.settings)
          ? (record.settings as Record<string, unknown>)
          : null
      if (!sessionId || !settings) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 settings')
      }
      if (!dialogue.updateGenerationSettings) {
        throw bridgeError('FORBIDDEN', '当前不能写入模型高级设置')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { settings: await dialogue.updateGenerationSettings(sessionId, settings) }
    }
    case 'session.getContextOccupancy': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (!dialogue.getContextOccupancy) {
        throw bridgeError('FORBIDDEN', '当前不能读取上下文占用')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { occupancy: await dialogue.getContextOccupancy(sessionId) }
    }
    case 'session.setToolMode': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (!dialogue.setToolMode) {
        throw bridgeError('FORBIDDEN', '当前不能切换工具模式')
      }
      /** 工具模式覆盖。 */
      const override =
        record.override === 'agent' || record.override === 'code' || record.override === 'minimal'
          ? record.override
          : record.override === null
            ? null
            : undefined
      if (override === undefined) {
        throw bridgeError('VALIDATION_ERROR', 'override 必须是 agent、code、minimal 或 null')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.setToolMode(sessionId, override)
      if (!session) throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
      return { session: toSdkSession(session) }
    }
    case 'session.getDisabledAgentTools': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (!dialogue.getDisabledAgentTools) {
        throw bridgeError('FORBIDDEN', '当前不能读取工具开关')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { toolNames: await dialogue.getDisabledAgentTools(sessionId) }
    }
    case 'session.updateDisabledAgentTools': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 关闭的内置工具名。 */
      const toolNames = Array.isArray(record.toolNames)
        ? record.toolNames.filter((item): item is string => typeof item === 'string')
        : null
      if (!sessionId || !toolNames) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 toolNames')
      }
      if (!dialogue.updateDisabledAgentTools) {
        throw bridgeError('FORBIDDEN', '当前不能写入工具开关')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      return { toolNames: await dialogue.updateDisabledAgentTools(sessionId, toolNames) }
    }
    case 'session.pin': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (typeof record.pinned !== 'boolean') {
        throw bridgeError('VALIDATION_ERROR', 'pinned 必须是布尔值')
      }
      if (!dialogue.toggleSessionPinned) {
        throw bridgeError('FORBIDDEN', '当前不能置顶会话')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      /** 会话记录。 */
      const session = await dialogue.toggleSessionPinned(sessionId, record.pinned)
      return { session: toSdkSession(session) }
    }
    case 'session.retryMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      rememberSessionOwner(sessionId, appId)
      /** 重试该消息的生成结果。 */
      const result = await dialogue.retryMessage(sessionId, messageId)
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
    case 'session.deleteMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      await dialogue.deleteMessage(sessionId, messageId)
      return { deleted: true as const }
    }
    case 'session.editUserMessage': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      /** 编辑后的用户消息正文。 */
      const text = typeof record.text === 'string' ? record.text.trim() : ''
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      if (!text) throw bridgeError('VALIDATION_ERROR', '编辑内容不能为空')
      /** 待编辑的消息（必须是 user）。 */
      const message = await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      if (message.role !== 'user') {
        throw bridgeError('VALIDATION_ERROR', '只能编辑用户消息')
      }
      /** 编辑后的用户消息。 */
      const updated = await dialogue.editUserMessage(sessionId, messageId, text)
      return { message: updated }
    }
    case 'session.fork': {
      /** 会话 id。 */
      const sessionId = readString(record, 'sessionId')
      /** 消息 id。 */
      const messageId = readString(record, 'messageId')
      if (!sessionId || !messageId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 messageId')
      }
      /** fork 源会话。 */
      const source = await requireOwnedSession(dialogue, appId, sessionId)
      await requireOwnedMessage(dialogue, appId, sessionId, messageId)
      /** 会话记录。 */
      const session = await dialogue.forkSession(sessionId, messageId)
      rememberSessionOwner(session.id, appId)
      if (session.projectDir) {
        rememberPickedDirectory(webContentsId, session.projectDir)
      } else if (source.projectDir) {
        rememberPickedDirectory(webContentsId, source.projectDir)
      }
      return { session: toSdkSession(session) }
    }
    default:
      return undefined
  }
}
