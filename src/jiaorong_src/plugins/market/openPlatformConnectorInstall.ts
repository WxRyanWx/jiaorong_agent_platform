/**
 * 开放平台连接器与本地 MCP 列表的融合与落地逻辑。
 * 收敛在私有目录，上游 store 与组件只做最小接线，降低后续合并冲突面。
 */

import { OPEN_PLATFORM_CONNECTOR_SOURCE } from './openPlatformMarket'
import { needsOpenPlatformVersionSync } from '@jiaorong/api/openPlatform/version'
import type { MCPServerConfig } from '@shared/types/mcp'

type ServerConfigMap = Record<string, MCPServerConfig>

const MAX_SERVER_NAME_SUFFIX = 100

export function isOpenPlatformConnectorConfig(
  serverConfig?: Pick<MCPServerConfig, 'source'> | null
): boolean {
  return serverConfig?.source === OPEN_PLATFORM_CONNECTOR_SOURCE
}

/** 已落地连接器的 sourceId 集合，市场列表按它去重，重名追加后缀后依然能识别。 */
export function collectInstalledConnectorSourceIds(servers: ServerConfigMap): Set<string> {
  return new Set(
    Object.values(servers ?? {})
      .filter((serverConfig) => isOpenPlatformConnectorConfig(serverConfig))
      .map((serverConfig) => serverConfig.sourceId)
      .filter((sourceId): sourceId is string => Boolean(sourceId))
  )
}

/** 与本地已有服务器重名时依次追加 -2、-3，避免覆盖用户手动添加的配置。 */
export function resolveConnectorServerName(baseName: string, servers: ServerConfigMap): string {
  const normalizedBase = baseName.trim()
  if (!normalizedBase) return ''
  if (!servers?.[normalizedBase]) return normalizedBase

  for (let suffix = 2; suffix <= MAX_SERVER_NAME_SUFFIX; suffix += 1) {
    const candidate = `${normalizedBase}-${suffix}`
    if (!servers[candidate]) return candidate
  }

  return `${normalizedBase}-${Date.now()}`
}

/**
 * 把市场条目剥离展示字段，转成可写入本地配置的 MCPServerConfig。
 * enabled 固定为 false，由既有 toggleServer 链路置真并启动。
 */
export function toInstallableConnectorConfig(server: MCPServerConfig): MCPServerConfig {
  return {
    command: server.command,
    args: [...server.args],
    env: { ...server.env },
    descriptions: server.descriptions,
    icons: server.icons,
    enabled: false,
    ...(server.baseUrl ? { baseUrl: server.baseUrl } : {}),
    ...(server.customHeaders ? { customHeaders: { ...server.customHeaders } } : {}),
    ...(server.customNpmRegistry ? { customNpmRegistry: server.customNpmRegistry } : {}),
    ...(server.inheritEnv ? { inheritEnv: server.inheritEnv } : {}),
    type: server.type,
    source: OPEN_PLATFORM_CONNECTOR_SOURCE,
    sourceId: server.sourceId,
    ...(server.provider?.trim() ? { provider: server.provider.trim() } : {}),
    ...(server.sourceVersion ? { sourceVersion: server.sourceVersion } : {})
  }
}

/**
 * 更新已落地连接器的载荷：与安装一致但不带 enabled，
 * 主进程 {...current, ...config} 合并后保留原开关状态，更新不会把服务器改成停用。
 * sourceVersion 不参与 bindingHash，只抬版本号不会触发重连；
 * 连接参数真的变了才由 configGeneration 机制重启服务。
 */
export function toUpdatableConnectorConfig(server: MCPServerConfig): Partial<MCPServerConfig> {
  const config: Partial<MCPServerConfig> = { ...toInstallableConnectorConfig(server) }
  delete config.enabled
  return config
}

/**
 * 找出市场版本比本地已装版本新的连接器：serverName → 市场条目。
 * 本地缺 sourceVersion（历史安装）且市场带版本时视为可更新，点击后补写版本。
 * marketServers 必须来自一次成功的市场拉取；本地无对应 sourceId 的条目不参与判定。
 */
export function findOutdatedConnectorServers<T extends MCPServerConfig>(
  servers: ServerConfigMap,
  marketServers: T[]
): Map<string, T> {
  const marketBySourceId = new Map<string, T>()
  for (const marketServer of marketServers ?? []) {
    if (marketServer.sourceId) marketBySourceId.set(marketServer.sourceId, marketServer)
  }

  const outdated = new Map<string, T>()
  for (const [serverName, serverConfig] of Object.entries(servers ?? {})) {
    if (!isOpenPlatformConnectorConfig(serverConfig)) continue
    const marketServer = marketBySourceId.get(serverConfig.sourceId ?? '')
    if (!marketServer) continue
    if (needsOpenPlatformVersionSync(marketServer.sourceVersion, serverConfig.sourceVersion)) {
      outdated.set(serverName, marketServer)
    }
  }
  return outdated
}

/**
 * 找出远端已下架、需要从本地移除的开放平台连接器服务器名。
 * 只比对 source 为 open-platform 的条目，手动添加与插件拥有的服务器不受影响。
 * marketSourceIds 必须来自一次成功的市场拉取；拉取失败时不得调用本函数，否则会误删全部连接器。
 */
export function findRevokedConnectorServerNames(
  servers: ServerConfigMap,
  marketSourceIds: Set<string>
): string[] {
  return Object.entries(servers ?? {})
    .filter(([, serverConfig]) => isOpenPlatformConnectorConfig(serverConfig))
    .filter(([, serverConfig]) => !marketSourceIds.has(serverConfig.sourceId ?? ''))
    .map(([serverName]) => serverName)
}
