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
  rememberPickedDirectory,
  rememberSessionOwner
} from './guestBind'
import { readAuthToken } from './userIdentity'

/** 与超级智能体 `messageWindowPolicy` 对齐：首屏 10，单次最多 50。 */
const DEFAULT_RESTORE_LIMIT = 10
const DEFAULT_SESSION_LIST_LIMIT = 10
const MAX_PAGE_LIMIT = 50
const EXISTING_DIR_PAGE_SIZE = 50

export function readPageLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), MAX_PAGE_LIMIT)
}

type InvokeRecord = Record<string, unknown>

function asRecord(args: unknown): InvokeRecord {
  return args && typeof args === 'object' ? (args as InvokeRecord) : {}
}

function readString(record: InvokeRecord, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function requireDialogue(deps: JiaorongAppHostDeps): JiaorongAppDialoguePort {
  if (!deps.dialogue) {
    throw bridgeError('FORBIDDEN', '对话桥不可用')
  }
  return deps.dialogue
}

function requireToken(deps: JiaorongAppHostDeps): void {
  if (!readAuthToken(deps.getAuthSession())) {
    throw bridgeError('UNAUTHORIZED', '未登录')
  }
}

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

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

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
    const current =
      agent.config && typeof agent.config === 'object'
        ? agent.config
        : ({} as Record<string, unknown>)
    for (const [key, value] of Object.entries(patch.config)) {
      if (!jsonEqual(current[key], value)) return true
    }
  }
  return false
}

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

function rememberSessionDirs(webContentsId: number, sessions: JiaorongAppSessionRecord[]) {
  for (const session of sessions) {
    const dir = session.projectDir?.trim()
    if (dir) rememberPickedDirectory(webContentsId, dir)
  }
}

function sanitizeSkillNames(appId: string, names: unknown): string[] {
  if (!Array.isArray(names)) return []
  const prefix = `app.${appId}.`
  return names.filter(
    (name): name is string =>
      typeof name === 'string' &&
      name.trim().length > 0 &&
      (!name.startsWith('app.') || name.startsWith(prefix))
  )
}

function sanitizeGuestFiles(
  files: unknown,
  webContentsId: number,
  projectDir: string | null | undefined
): unknown[] | undefined {
  if (!Array.isArray(files)) return undefined
  const allowedRoot = typeof projectDir === 'string' ? canonicalizeGuestPath(projectDir) : ''
  const next: unknown[] = []
  for (const file of files) {
    if (!file || typeof file !== 'object') continue
    const row = file as Record<string, unknown>
    const filePath = typeof row.path === 'string' ? row.path.trim() : ''
    if (!filePath) {
      next.push(file)
      continue
    }
    const underProject = Boolean(allowedRoot) && isGuestPathInsideDir(allowedRoot, filePath)
    if (underProject || isGuestPathAllowed(webContentsId, filePath)) {
      next.push(file)
    }
  }
  return next
}

export function sanitizeCreateConfig(
  appId: string,
  config: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!config) return undefined
  const next: Record<string, unknown> = {}
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
    const model = config.assistantModel as Record<string, unknown>
    const providerId = typeof model.providerId === 'string' ? model.providerId.trim() : ''
    const modelId = typeof model.modelId === 'string' ? model.modelId.trim() : ''
    if (providerId && modelId) next.assistantModel = { providerId, modelId }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function isAbsoluteFsPath(value: string): boolean {
  return isAbsoluteGuestPath(value)
}

async function requireOwnedSession(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  sessionId: string
): Promise<JiaorongAppSessionRecord> {
  const session = await dialogue.getSession(sessionId)
  if (!session) {
    throw bridgeError('SESSION_NOT_FOUND', '未找到会话')
  }
  if (!appAgentIds(appId).has(session.agentId)) {
    throw bridgeError('FORBIDDEN', '会话不属于本应用')
  }
  return session
}

async function resolveOwnedAgentId(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  record: InvokeRecord
): Promise<string> {
  const agentId = readString(record, 'agentId')
  const agentKey = readString(record, 'agentKey')
  if (agentId) {
    const binding = getAppAgentBindingByAgentId(appId, agentId)
    if (!binding) throw bridgeError('FORBIDDEN', '智能体不属于本应用')
    const agent = await dialogue.getAgent(agentId)
    if (!agent) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return agentId
  }
  if (agentKey) {
    const binding = getAppAgentBinding(appId, agentKey)
    if (!binding) throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
    return binding.agentId
  }
  throw bridgeError('VALIDATION_ERROR', '需要提供 agentId 或 agentKey')
}

function sanitizeSendContent(
  appId: string,
  webContentsId: number,
  projectDir: string | null | undefined,
  content: string | Record<string, unknown>
): string | Record<string, unknown> {
  if (typeof content === 'string') return content
  const files = Array.isArray(content.files)
    ? (sanitizeGuestFiles(content.files, webContentsId, projectDir) ?? [])
    : content.files
  const skills = sanitizeSkillNames(appId, content.activeSkills)
  return {
    ...content,
    files,
    activeSkills: skills.length > 0 ? skills : undefined
  }
}

function readSendContent(record: InvokeRecord): string | Record<string, unknown> {
  const content = record.content
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return content as Record<string, unknown>
  throw bridgeError('VALIDATION_ERROR', '需要提供 content')
}

function readMessageCursor(record: InvokeRecord): { orderSeq: number; id: string } | null {
  const cursor = record.cursor
  if (!cursor || typeof cursor !== 'object') return null
  const row = cursor as Record<string, unknown>
  const orderSeq = row.orderSeq
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (typeof orderSeq !== 'number' || Number.isNaN(orderSeq) || !id) return null
  return { orderSeq, id }
}

function readSessionCursor(record: InvokeRecord): { updatedAt: number; id: string } | null {
  const cursor = record.cursor
  if (!cursor || typeof cursor !== 'object') return null
  const row = cursor as Record<string, unknown>
  const updatedAt = row.updatedAt
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  if (typeof updatedAt !== 'number' || Number.isNaN(updatedAt) || !id) return null
  return { updatedAt, id }
}

async function directoryExistsOnOwnedSessions(
  dialogue: JiaorongAppDialoguePort,
  appId: string,
  dir: string
): Promise<boolean> {
  for (const agentId of appAgentIds(appId)) {
    let cursor: { updatedAt: number; id: string } | null = null
    for (;;) {
      const page = await dialogue.listLightweight({
        agentId,
        limit: EXISTING_DIR_PAGE_SIZE,
        cursor,
        includeSubagents: false
      })
      if (page.items.some((item) => canonicalizeGuestPath(item.projectDir ?? '') === dir)) {
        return true
      }
      if (!page.hasMore || !page.nextCursor) break
      cursor = page.nextCursor
    }
  }
  return false
}

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
  const dir = canonicalizeGuestPath(projectDir)
  if (!dir) return null
  if (hasPickedDirectory(webContentsId, dir)) return dir
  if (await directoryExistsOnOwnedSessions(dialogue, appId, dir)) {
    rememberPickedDirectory(webContentsId, dir)
    return dir
  }
  throw bridgeError('VALIDATION_ERROR', 'projectDir 不允许用于本应用')
}

export async function handleDialogueInvoke(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime,
  method: string,
  args: unknown,
  webContentsId: number
): Promise<unknown> {
  requireToken(deps)
  const dialogue = requireDialogue(deps)
  const record = asRecord(args)
  const appId = runtime.id

  switch (method) {
    case 'agent.create': {
      const key = readString(record, 'key')
      const name = readString(record, 'name')
      if (!key || !name) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 key 和 name')
      }
      return runAppAgentMapExclusive(appId, key, async () => {
        const existing = getAppAgentBinding(appId, key)
        if (existing) {
          const agent = await dialogue.getAgent(existing.agentId)
          if (agent) return toAppAgent(agent, existing, false)
        }
        const sanitized = sanitizeCreateConfig(
          appId,
          record.config && typeof record.config === 'object'
            ? (record.config as Record<string, unknown>)
            : null
        )
        const created = await dialogue.createDeepChatAgent({
          name,
          enabled: record.enabled !== false,
          description: readString(record, 'description') || undefined,
          icon: readString(record, 'icon') || undefined,
          avatar: record.avatar,
          config: {
            ...sanitized,
            jiaorongAppId: appId,
            jiaorongAppKey: key
          }
        })
        const binding = { appId, key, agentId: created.id }
        upsertAppAgentBinding(binding)
        return toAppAgent(created, binding, true)
      })
    }
    case 'agent.update': {
      const key = readString(record, 'key')
      const id = readString(record, 'id')
      const binding = id
        ? getAppAgentBindingByAgentId(appId, id)
        : key
          ? getAppAgentBinding(appId, key)
          : null
      if (!binding) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      const agent = await dialogue.getAgent(binding.agentId)
      if (!agent) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      const patch: JiaorongAppUpdateAgentInput = {}
      if ('name' in record) {
        const name = readString(record, 'name')
        if (!name) throw bridgeError('VALIDATION_ERROR', '需要提供 name')
        patch.name = name
      }
      if ('enabled' in record) patch.enabled = record.enabled !== false
      if ('description' in record) patch.description = readString(record, 'description')
      if ('icon' in record) patch.icon = readString(record, 'icon')
      if ('avatar' in record) patch.avatar = record.avatar
      if (record.config && typeof record.config === 'object') {
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
      const updated = await dialogue.updateDeepChatAgent(binding.agentId, patch)
      if (!updated) {
        throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
      }
      return toAppAgent(updated, binding, false, true)
    }
    case 'agent.get': {
      const key = readString(record, 'key')
      const id = readString(record, 'id')
      const binding = id
        ? getAppAgentBindingByAgentId(appId, id)
        : key
          ? getAppAgentBinding(appId, key)
          : null
      if (!binding) return null
      const agent = await dialogue.getAgent(binding.agentId)
      return agent ? toAppAgent(agent, binding, false) : null
    }
    case 'agent.list': {
      const agents = await dialogue.listAgents()
      const byId = new Map(agents.map((agent) => [agent.id, agent]))
      return {
        agents: listAppAgentBindings(appId).flatMap((binding) => {
          const agent = byId.get(binding.agentId)
          return agent ? [toAppAgent(agent, binding, false)] : []
        })
      }
    }
    case 'session.create': {
      const agentId = await resolveOwnedAgentId(dialogue, appId, record)
      const message = typeof record.message === 'string' ? record.message : ''
      const projectDir = await resolveAllowedProjectDir(
        dialogue,
        appId,
        webContentsId,
        record.projectDir
      )
      const created = await dialogue.createSession(
        {
          agentId,
          message,
          files: sanitizeGuestFiles(record.files, webContentsId, projectDir),
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
      const { initialTurn, ...session } = created
      return {
        session: toSdkSession(session),
        ...(initialTurn ? { initialTurn } : {})
      }
    }
    case 'session.list': {
      const requestedAgentId = readString(record, 'agentId')
      if (!requestedAgentId) throw bridgeError('VALIDATION_ERROR', '需要提供 agentId')
      if (!appAgentIds(appId).has(requestedAgentId)) {
        throw bridgeError('FORBIDDEN', '智能体不属于本应用')
      }
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
      const query = readString(record, 'query')
      if (!query) throw bridgeError('VALIDATION_ERROR', '需要提供 query')
      const ownedIds = [...appAgentIds(appId)]
      if (ownedIds.length === 0) return { hits: [] }
      const options =
        record.options && typeof record.options === 'object'
          ? (record.options as { limit?: number })
          : undefined
      const hits = await dialogue.searchHistory(query, {
        ...options,
        includeAgentIds: ownedIds
      })
      return { hits }
    }
    case 'session.get': {
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      rememberSessionOwner(sessionId, appId)
      let permissionMode = session.permissionMode
      if (!permissionMode && dialogue.getPermissionMode) {
        try {
          permissionMode = await dialogue.getPermissionMode(sessionId)
        } catch {
          permissionMode = undefined
        }
      }
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
      const sessionId = readString(record, 'sessionId')
      const title = readString(record, 'title')
      if (!sessionId || !title) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 title')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      const session = await dialogue.renameSession(sessionId, title)
      return { session: toSdkSession(session) }
    }
    case 'session.delete': {
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.deleteSession(sessionId)
      forgetSessionOwner(sessionId)
      return { deleted: true as const }
    }
    case 'session.send': {
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      rememberSessionOwner(sessionId, appId)
      const result = await dialogue.sendMessage(
        sessionId,
        sanitizeSendContent(appId, webContentsId, session.projectDir, readSendContent(record))
      )
      return {
        accepted: true,
        requestId: result.requestId,
        messageId: result.messageId,
        attachmentPreparation: result.attachmentPreparation
      }
    }
    case 'session.stop': {
      const sessionId = readString(record, 'sessionId')
      const requestId = readString(record, 'requestId')
      let targetId = sessionId
      if (!targetId && requestId) {
        const message = await dialogue.getMessage(requestId)
        targetId = message?.sessionId ?? ''
      }
      if (!targetId) return { stopped: false }
      await requireOwnedSession(dialogue, appId, targetId)
      await dialogue.cancelGeneration(targetId)
      return { stopped: true }
    }
    case 'session.steer': {
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      const session = await requireOwnedSession(dialogue, appId, sessionId)
      const result = await dialogue.steerActiveTurn(
        sessionId,
        sanitizeSendContent(appId, webContentsId, session.projectDir, readSendContent(record))
      )
      if (
        result.attachmentPreparation &&
        typeof result.attachmentPreparation === 'object' &&
        (result.attachmentPreparation as { status?: string }).status === 'needs_user_action'
      ) {
        return { accepted: false as const, message: null }
      }
      if (!result.userMessage) {
        throw bridgeError('STEER_NOT_ALLOWED', '当前不能插入追问')
      }
      return { accepted: true as const, message: result.userMessage }
    }
    case 'chat.respondToolInteraction': {
      const sessionId = readString(record, 'sessionId')
      const messageId = readString(record, 'messageId')
      const toolCallId = readString(record, 'toolCallId')
      if (!sessionId || !messageId || !toolCallId) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId、messageId 和 toolCallId')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      const result = await dialogue.respondToolInteraction({
        sessionId,
        messageId,
        toolCallId,
        response: record.response
      })
      return { accepted: true as const, ...result }
    }
    case 'session.setPermissionMode': {
      const sessionId = readString(record, 'sessionId')
      const mode = readString(record, 'mode')
      if (!sessionId || !mode) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 mode')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      await dialogue.setPermissionMode(sessionId, mode)
      return { ok: true as const, mode }
    }
    case 'session.setOrchestrationPolicy': {
      const sessionId = readString(record, 'sessionId')
      const policy =
        record.policy === 'proactive' || record.policy === 'explicit' ? record.policy : ''
      if (!sessionId || !policy) {
        throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId 和 policy')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      const next = await dialogue.updateOrchestrationPolicy(sessionId, policy)
      return { ok: true as const, policy: next }
    }
    case 'session.pin': {
      const sessionId = readString(record, 'sessionId')
      if (!sessionId) throw bridgeError('VALIDATION_ERROR', '需要提供 sessionId')
      if (typeof record.pinned !== 'boolean') {
        throw bridgeError('VALIDATION_ERROR', 'pinned 必须是布尔值')
      }
      if (!dialogue.toggleSessionPinned) {
        throw bridgeError('FORBIDDEN', '当前不能置顶会话')
      }
      await requireOwnedSession(dialogue, appId, sessionId)
      const session = await dialogue.toggleSessionPinned(sessionId, record.pinned)
      return { session: toSdkSession(session) }
    }
    default:
      return undefined
  }
}
