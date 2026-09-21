/** 应用桥 mcp.create：按 JSON 注册 MCP，默开，并限制到指定智能体。 */

import type { MCPServerConfig } from '@shared/types/mcp'
import { bridgeError } from '../bridgeErrors'
import { appAgentIds } from './agentMap'
import type { JiaorongAppHostDeps, JiaorongAppMcpPort } from './deps'
import type { JiaorongAppRuntime } from '../types'

/** 单条待写入的 MCP。 */
export type JiaorongParsedMcpServer = {
  /** 服务器名。 */
  name: string
  /** 写入 MCP 设置的配置。 */
  config: MCPServerConfig
}

const JSON_MAX_BYTES = 768 * 1024
const VALID_TYPES = new Set(['stdio', 'http', 'sse'])

/**
 * 解析 mcp.create 的 JSON。
 * 支持 `{ mcpServers: { name: config } }`，或带 `name` 的单条配置。
 */
export function parseJiaorongMcpCreateJson(raw: unknown): JiaorongParsedMcpServer[] {
  const parsed = parseJsonValue(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw bridgeError('VALIDATION_ERROR', 'json 必须是对象')
  }
  const record = parsed as Record<string, unknown>
  if (
    record.mcpServers &&
    typeof record.mcpServers === 'object' &&
    !Array.isArray(record.mcpServers)
  ) {
    return Object.entries(record.mcpServers as Record<string, unknown>).map(([name, config]) =>
      toStoredServer(name, config)
    )
  }
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  if (name) {
    return [toStoredServer(name, record)]
  }
  throw bridgeError('VALIDATION_ERROR', 'json 需要 mcpServers 或 name')
}

/**
 * mcp.create：写入全局 MCP 目录，默认启用；仅 agentId 对应智能体能看到并调用工具。
 */
export async function handleJiaorongMcpCreate(
  deps: JiaorongAppHostDeps,
  runtime: JiaorongAppRuntime,
  args: Record<string, unknown>
): Promise<{
  servers: Array<{ name: string; enabled: boolean; started: boolean }>
}> {
  const mcp = requireMcp(deps)
  const dialogue = deps.dialogue
  if (!dialogue) {
    throw bridgeError('FORBIDDEN', '对话桥不可用')
  }

  const agentId = typeof args.agentId === 'string' ? args.agentId.trim() : ''
  if (!agentId) {
    throw bridgeError('VALIDATION_ERROR', '需要提供 agentId')
  }
  if (!appAgentIds(runtime.id).has(agentId)) {
    throw bridgeError('FORBIDDEN', '智能体不属于本应用')
  }
  const agent = await dialogue.getAgent(agentId)
  if (!agent) {
    throw bridgeError('AGENT_NOT_FOUND', '未找到该智能体')
  }
  if (agent.type === 'acp') {
    throw bridgeError('FORBIDDEN', '仅支持交融智能体')
  }

  const enabled = args.enabled !== false
  const servers = parseJiaorongMcpCreateJson(readJsonInput(args)).map((item) => ({
    ...item,
    config: {
      ...item.config,
      enabled,
      source: 'jiaorong-app',
      sourceId: runtime.id,
      visibleToAgentIds: [agentId]
    }
  }))
  if (servers.length === 0) {
    throw bridgeError('VALIDATION_ERROR', 'json 中没有 MCP 服务器')
  }

  const existing = await mcp.getMcpServers()
  for (const item of servers) {
    const current = existing[item.name]
    if (!current) continue
    if (current.source === 'jiaorong-app' && current.sourceId === runtime.id) continue
    throw bridgeError('VALIDATION_ERROR', `MCP 名称已存在：${item.name}`)
  }

  const results: Array<{ name: string; enabled: boolean; started: boolean }> = []
  for (const item of servers) {
    const current = existing[item.name]
    if (current) {
      await mcp.updateMcpServer(item.name, item.config)
    } else {
      const added = await mcp.addMcpServer(item.name, item.config)
      if (added.status === 'duplicate') {
        throw bridgeError('VALIDATION_ERROR', `MCP 名称已存在：${item.name}`)
      }
    }
    let started = false
    if (enabled) {
      try {
        await mcp.setMcpServerEnabled(item.name, true)
      } catch (error) {
        console.warn('[jiaorong-app] mcp.create 启用失败', item.name, error)
      }
      started = await mcp.isServerRunning(item.name)
    }
    results.push({ name: item.name, enabled, started })
  }

  const config = agent.config && typeof agent.config === 'object' ? agent.config : {}
  const currentIds = config.enabledMcpServerIds
  if (Array.isArray(currentIds)) {
    const nextIds = Array.from(
      new Set(
        [...currentIds, ...servers.map((item) => item.name)].filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      )
    )
    await dialogue.updateDeepChatAgent(agentId, {
      config: { enabledMcpServerIds: nextIds }
    })
  }

  return { servers: results }
}

function requireMcp(deps: JiaorongAppHostDeps): JiaorongAppMcpPort {
  if (!deps.mcp) {
    throw bridgeError('FORBIDDEN', 'MCP 桥不可用')
  }
  return deps.mcp
}

function readJsonInput(args: Record<string, unknown>): unknown {
  if ('json' in args) return args.json
  if (args.mcpServers) return args
  throw bridgeError('VALIDATION_ERROR', '需要提供 json')
}

function parseJsonValue(raw: unknown): unknown {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) throw bridgeError('VALIDATION_ERROR', 'json 不能为空')
    if (Buffer.byteLength(text, 'utf8') > JSON_MAX_BYTES) {
      throw bridgeError('VALIDATION_ERROR', 'json 过大')
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw bridgeError('VALIDATION_ERROR', 'json 无法解析')
    }
  }
  if (raw && typeof raw === 'object') {
    try {
      if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > JSON_MAX_BYTES) {
        throw bridgeError('VALIDATION_ERROR', 'json 过大')
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) throw error
      throw bridgeError('VALIDATION_ERROR', 'json 过大')
    }
    return raw
  }
  throw bridgeError('VALIDATION_ERROR', 'json 必须是对象或 JSON 字符串')
}

function resolveTransportType(input: Record<string, unknown>): string {
  const incomingType = typeof input.type === 'string' ? input.type.trim().toLowerCase() : ''
  if (incomingType) return incomingType
  const transport = typeof input.transport === 'string' ? input.transport.trim().toLowerCase() : ''
  if (transport === 'streamable-http' || transport === 'streamable_http' || transport === 'http') {
    return 'http'
  }
  if (transport === 'sse' || transport === 'stdio') return transport
  return ''
}

function toStoredServer(name: string, raw: unknown): JiaorongParsedMcpServer {
  const trimmed = name.trim()
  if (!trimmed) {
    throw bridgeError('VALIDATION_ERROR', 'MCP 名称不能为空')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw bridgeError('VALIDATION_ERROR', `MCP 配置无效：${trimmed}`)
  }
  const input = raw as Record<string, unknown>
  const baseUrl =
    (typeof input.baseUrl === 'string' && input.baseUrl.trim()) ||
    (typeof input.url === 'string' && input.url.trim()) ||
    ''
  const incomingType = resolveTransportType(input)
  const type = VALID_TYPES.has(incomingType) ? incomingType : baseUrl ? 'http' : 'stdio'
  if (incomingType === 'inmemory' || type === 'inmemory') {
    throw bridgeError('VALIDATION_ERROR', `不能创建内置 MCP：${trimmed}`)
  }

  const descriptions = typeof input.descriptions === 'string' ? input.descriptions : ''
  const icons = typeof input.icons === 'string' ? input.icons : ''
  const env =
    input.env && typeof input.env === 'object' && !Array.isArray(input.env)
      ? (input.env as Record<string, unknown>)
      : {}
  const headersRaw = input.customHeaders ?? input.headers
  const customHeaders =
    headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)
      ? Object.fromEntries(
          Object.entries(headersRaw as Record<string, unknown>).flatMap(([key, value]) =>
            typeof value === 'string' ? [[key, value] as const] : []
          )
        )
      : undefined
  const args = Array.isArray(input.args)
    ? input.args.filter((item): item is string => typeof item === 'string')
    : []

  if (type === 'stdio') {
    const command = typeof input.command === 'string' ? input.command.trim() : ''
    if (!command) {
      throw bridgeError('VALIDATION_ERROR', `stdio MCP 需要 command：${trimmed}`)
    }
    return {
      name: trimmed,
      config: {
        command,
        args,
        env,
        descriptions,
        icons,
        enabled: true,
        type: 'stdio',
        inheritEnv: input.inheritEnv === 'legacy' ? 'legacy' : 'minimal',
        ...(typeof input.customNpmRegistry === 'string'
          ? { customNpmRegistry: input.customNpmRegistry }
          : {})
      }
    }
  }

  if (!baseUrl) {
    throw bridgeError('VALIDATION_ERROR', `远程 MCP 需要 url：${trimmed}`)
  }
  return {
    name: trimmed,
    config: {
      command: '',
      args: [],
      env,
      descriptions,
      icons,
      enabled: true,
      type: type as 'http' | 'sse',
      baseUrl,
      ...(customHeaders ? { customHeaders } : {}),
      ...(input.authorization && typeof input.authorization === 'object'
        ? { authorization: input.authorization as MCPServerConfig['authorization'] }
        : {})
    }
  }
}
