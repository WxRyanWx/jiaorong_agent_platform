/**
 * 开放平台市场列表展示层融合：应用与技能仅参与展示；
 * 连接器额外携带可落地的 MCP 配置，由插件中心开关触发写入本地并启动。
 */

import { getOpenPlatformClient } from '@jiaorong/api/openPlatform'
import type {
  JiaorongAppCenterItem,
  JiaorongAppInstallStatus,
  JiaorongAppUserIdentity
} from '../../appHost/types'
import { isAppAuthOpen, isAppVisibleToUser, readUserIdentityFromUserInfo } from '../../appHost/auth'
import type {
  OpenPlatformAssetSummary,
  OpenPlatformConnectorListItem
} from '@jiaorong/api/openPlatform/types'
import { needsOpenPlatformVersionSync } from '@jiaorong/api/openPlatform/version'
import type { MCPServerConfig } from '@shared/types/mcp'
import type { UnifiedSkillItem } from '@shared/types/skillManagement'
import type { RemoteSkillListItem } from '../../skills/lib/skillMarketCatalog'

export const OPEN_PLATFORM_CONNECTOR_SOURCE = 'open-platform'

/**
 * 市场没给版本号时的占位值（`legacy` 存量资产 `version` 为 null）。
 * 只用于满足 `version: string` 的契约，参与展示或更新判定前必须先识别它。
 */
export const UNKNOWN_OPEN_PLATFORM_VERSION = '0.0.0'

/** 身份对象里是否有可用于 auth 判定的字段。 */
function hasIdentityFields(identity: JiaorongAppUserIdentity): boolean {
  return Boolean(
    identity.userName ||
    identity.phone ||
    identity.orgNos.length > 0 ||
    (identity.orgPathNos?.length ?? 0) > 0
  )
}

/**
 * 渲染进程读当前登录身份：优先完整资料，缺失按未登录处理。
 * 只用于「尚未安装」的市场卡做 auth 过滤，已装卡片仍以主进程判定为准。
 */
function readCurrentUserIdentity(): JiaorongAppUserIdentity {
  /** 空身份兜底。 */
  const empty: JiaorongAppUserIdentity = { userName: null, orgNos: [], phone: null }
  try {
    if (typeof localStorage === 'undefined') return empty
    // 完整资料优先；某一份解析不出身份（或坏档）时继续看下一份
    for (const key of ['userFullInfo', 'userInfo'] as const) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const identity = readUserIdentityFromUserInfo(JSON.parse(raw))
        if (hasIdentityFields(identity)) return identity
      } catch {
        // 坏档跳过，继续下一份
      }
    }
    return empty
  } catch {
    return empty
  }
}

/** 渲染进程读登录 token；未登录或读不到时返回空串。 */
function readCurrentToken(): string {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem('xkaitoken')?.trim() ?? ''
  } catch {
    return ''
  }
}

/**
 * 资产下载地址：release 优先，legacy 资产（旧技能市场迁入）没有 release，只有顶层字段。
 * 后端两条来源同值时结果一致，接口收敛后无需再改。
 */
export function resolveAssetDownloadUrl(item: OpenPlatformAssetSummary): string {
  return item.latestRelease?.downloadUrl.trim() || item.downloadUrl.trim()
}

/** 资产市场版本号：顶层 version 优先，其次 release.version；都没有则为空串。 */
export function resolveAssetVersion(item: OpenPlatformAssetSummary): string {
  return item.version?.trim() || item.latestRelease?.version?.trim() || ''
}

/**
 * 市场版本高于已装版本时把状态抬成 `update_available`，其它状态原样保留。
 * 主进程只比对本地目录与 OSS 目录版本，开放平台的市场版本要在渲染侧补算。
 */
export function resolveMarketInstallStatus(
  status: JiaorongAppInstallStatus,
  installedVersion: string | null | undefined,
  marketVersion: string
): JiaorongAppInstallStatus {
  if (status !== 'installed' || !installedVersion) return status
  return needsOpenPlatformVersionSync(marketVersion, installedVersion) ? 'update_available' : status
}

export type OpenPlatformMarketMcpServer = MCPServerConfig & {
  name: string
  provider?: string | null
  isRunning: false
  lifecycleStatus: 'stopped'
  errorMessage: undefined
  authStatus: undefined
  isLoading: false
}

function createRemoteSkill(item: {
  id: string
  name: string
  description: string
  provider?: string | null
  assetSource?: OpenPlatformAssetSummary['assetSource']
}): UnifiedSkillItem {
  const metadata = {
    displayName: item.name,
    ...(item.provider ? { provider: item.provider } : {}),
    // 新旧来源标识：插件中心的开放平台技能卡与技能市场共用同一份 metadata 语义
    ...(item.assetSource ? { source: item.assetSource } : {})
  }
  return {
    agentId: 'deepchat',
    name: item.id,
    description: item.description,
    path: `open-platform://${item.id}/SKILL.md`,
    skillRoot: `open-platform://${item.id}`,
    category: null,
    platforms: [],
    metadata,
    allowedTools: [],
    canonicalPath: `open-platform://${item.id}/SKILL.md`,
    sourceType: 'url-install',
    assigned: true,
    assignedAgentIds: ['deepchat'],
    disabled: false,
    deepchatDisabled: false,
    agentLinks: {},
    mutable: false
  }
}

/**
 * 远端连接器配置到本地 MCPServerConfig 的唯一映射点。
 * 后端接入后只要接口返回契约里的 ConnectorMarketItem，此函数与下游启动链路均无需改动。
 * 不注入 serverId、configGeneration、bindingHash，这三个字段由主进程 normalizeServerConfig 计算。
 */
export function toMcpServerConfig(item: OpenPlatformConnectorListItem): MCPServerConfig {
  const remoteConfig = item.config
  return {
    command: remoteConfig?.command ?? '',
    args: remoteConfig?.args ? [...remoteConfig.args] : [],
    env: remoteConfig?.env ? { ...remoteConfig.env } : {},
    descriptions: remoteConfig?.descriptions || item.description,
    icons: remoteConfig?.icons ?? '',
    enabled: false,
    baseUrl: remoteConfig?.baseUrl ?? '',
    ...(remoteConfig?.customHeaders ? { customHeaders: { ...remoteConfig.customHeaders } } : {}),
    ...(remoteConfig?.customNpmRegistry
      ? { customNpmRegistry: remoteConfig.customNpmRegistry }
      : {}),
    ...(remoteConfig?.inheritEnv ? { inheritEnv: remoteConfig.inheritEnv } : {}),
    type: remoteConfig?.type ?? item.connectorType ?? 'http',
    source: OPEN_PLATFORM_CONNECTOR_SOURCE,
    sourceId: item.sourceId ?? item.id,
    ...(item.version ? { sourceVersion: item.version } : {})
  }
}

/**
 * 按连接器类型校验可建连字段：stdio 必须有 command，http、sse 必须有 baseUrl。
 * 缺 config 的旧数据两者皆空，直接判定为不可启用，避免写入本地后启动失败。
 */
export function canEnableOpenPlatformConnector(server: MCPServerConfig): boolean {
  if (server.type === 'stdio') return Boolean(server.command?.trim())
  if (server.type === 'http' || server.type === 'sse') return Boolean(server.baseUrl?.trim())
  return Boolean(server.baseUrl?.trim() || server.command?.trim())
}

export async function listOpenPlatformMarketApps(): Promise<JiaorongAppCenterItem[]> {
  const client = getOpenPlatformClient()
  const page = await client.listApps('market')
  // 内置应用统一由左侧菜单承载，不再出现在交融应用市场卡片里
  const publishedItems = page.items.filter(
    (item) => item.status === 'published' && item.source !== 'builtin'
  )
  const installedItems = await window.jiaorongApps?.getAppCenterInstallStatuses(
    publishedItems.map((item) => item.id)
  )
  const installedItemsById = new Map(
    (installedItems ?? []).map((installedItem) => [installedItem.id, installedItem])
  )
  /** 当前登录身份，用于未安装卡片的 auth 过滤。 */
  const currentUser = readCurrentUserIdentity()
  /** 是否已登录：未登录时市场接口本身会返回空，不做本地判断。 */
  const hasToken = Boolean(readCurrentToken())
  /** 身份是否已就绪（userName / 手机号 / 组织任一非空）。 */
  const hasIdentity = hasIdentityFields(currentUser)
  // 已装的以主进程判定为准（含开发者自测放行）；
  // 未安装的本地没有卡片，只能按市场接口返回的 auth 过滤，否则无权应用也会出现在市场里。
  const visibleItems = publishedItems.filter((item) => {
    const installedItem = installedItemsById.get(item.id)
    if (installedItem) return installedItem.visibleToCurrentUser !== false
    // 未登录：交给接口与安装时校验
    if (!hasToken) return true
    // 已登录但 userInfo 还没落盘：带权限的应用先不展示，避免无权应用闪现
    if (!hasIdentity) return isAppAuthOpen(item.auth)
    return isAppVisibleToUser(item.auth, currentUser)
  })
  return visibleItems.map((item) => {
    const installedItem = installedItemsById.get(item.id)
    const downloadUrl = resolveAssetDownloadUrl(item)
    const marketVersion = resolveAssetVersion(item)
    const installedVersion = installedItem?.installedVersion ?? null
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      iconSrc: installedItem?.iconSrc ?? item.iconUrl,
      // legacy 存量没有市场版本：已装卡沿用目录版本展示，未装卡才用占位版本兜底
      version: marketVersion || installedItem?.version || UNKNOWN_OPEN_PLATFORM_VERSION,
      installedVersion,
      installStatus: resolveMarketInstallStatus(
        installedItem?.installStatus ?? 'not_installed',
        installedVersion,
        marketVersion
      ),
      remotePackage: Boolean(downloadUrl),
      localPackagePath: null,
      // 开放平台包下载需要鉴权头，主进程的裸 fetch 拿不到，安装改由渲染进程下载
      downloadUrl: downloadUrl || null,
      packageSha256: item.latestRelease?.sha256.trim() || null,
      openable: installedItem?.openable ?? false,
      canUninstall: installedItem?.canUninstall ?? false,
      developerOnly: false,
      visibleToCurrentUser: true,
      provider: item.provider?.trim() || ''
    }
  })
}

export async function listOpenPlatformMarketSkills(): Promise<UnifiedSkillItem[]> {
  const page = await getOpenPlatformClient().listSkills('market')
  return page.items.filter((item) => item.status === 'published').map(createRemoteSkill)
}

/**
 * 技能市场的唯一远程源：开放平台资产列表映射成技能市场条目。
 * `name` 取资产展示名（中文），`ensureDefaultSkills` 按它精确匹配默认技能清单；
 * 资产 id 走 `remoteId`，详情页据此拉取接口。
 */
export async function listOpenPlatformMarketSkillListItems(): Promise<RemoteSkillListItem[]> {
  const page = await getOpenPlatformClient().listSkills('market')
  return page.items
    .filter((item) => item.status === 'published')
    .map((item) => {
      const version = resolveAssetVersion(item)
      const provider = item.provider?.trim() ?? ''
      return {
        id: item.id,
        name: item.name.trim() || item.id,
        description: item.description,
        downloadUrl: resolveAssetDownloadUrl(item),
        ...(item.categoryId ? { categoryId: item.categoryId } : {}),
        ...(version ? { version } : {}),
        ...(provider ? { provider } : {}),
        openPlatform: true,
        ...(item.assetSource ? { source: item.assetSource } : {})
      }
    })
}

export async function listOpenPlatformMarketConnectors(): Promise<OpenPlatformMarketMcpServer[]> {
  const page = await getOpenPlatformClient().listConnectors('market')
  return page.items
    .filter((item) => item.status === 'published')
    .map((item) => ({
      name: item.id,
      ...(item.provider ? { provider: item.provider } : {}),
      ...toMcpServerConfig(item),
      isRunning: false,
      lifecycleStatus: 'stopped',
      errorMessage: undefined,
      authStatus: undefined,
      isLoading: false
    }))
}
