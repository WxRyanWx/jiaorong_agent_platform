/** 开放平台市场列表展示层融合：远端 mock 只参与展示，不写入本地安装配置。 */

import { getOpenPlatformClient } from '../api'
import {
  getOpenPlatformMockAppPackagePath,
  isMockOpenPlatformClient
} from '../api/mockOpenPlatformApi'
import type { JiaorongAppCenterItem } from '../../appHost/types'
import type { MCPServerConfig } from '@shared/types/mcp'
import type { SkillMetadata } from '@shared/types/skill'
import type { UnifiedSkillItem } from '@shared/types/skillManagement'

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
}): UnifiedSkillItem {
  const metadata = item.provider
    ? { displayName: item.name, provider: item.provider }
    : { displayName: item.name }
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

export async function listOpenPlatformMarketApps(): Promise<JiaorongAppCenterItem[]> {
  const client = getOpenPlatformClient()
  const page = await client.listApps('market')
  const isMockClient = isMockOpenPlatformClient(client)
  const publishedItems = page.items.filter((item) => item.status === 'published')
  const installedItems = await window.jiaorongApps?.getAppCenterInstallStatuses(
    publishedItems.map((item) => item.id)
  )
  const installedItemsById = new Map(
    (installedItems ?? []).map((installedItem) => [installedItem.id, installedItem])
  )
  return publishedItems.map((item) => {
    const installedItem = installedItemsById.get(item.id)
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      iconSrc: installedItem?.iconSrc ?? item.iconUrl,
      version: item.version ?? '0.0.0',
      installedVersion: installedItem?.installedVersion ?? null,
      installStatus: installedItem?.installStatus ?? 'not_installed',
      remotePackage: !isMockClient && Boolean(item.latestRelease.downloadUrl.trim()),
      localPackagePath: isMockClient ? getOpenPlatformMockAppPackagePath(item.id) || null : null,
      openable: installedItem?.openable ?? false,
      canUninstall: false,
      developerOnly: false,
      provider: item.provider?.trim() || ''
    }
  })
}

export async function listOpenPlatformMarketSkills(): Promise<UnifiedSkillItem[]> {
  const page = await getOpenPlatformClient().listSkills()
  return page.items.filter((item) => item.status === 'published').map(createRemoteSkill)
}

export async function listOpenPlatformMarketSkillMetadata(): Promise<SkillMetadata[]> {
  const page = await getOpenPlatformClient().listSkills()
  return page.items
    .filter((item) => item.status === 'published')
    .map((item) => ({
      name: item.id,
      description: item.description,
      path: `open-platform://${item.id}/SKILL.md`,
      skillRoot: '',
      metadata: {
        displayName: item.name,
        remoteId: item.id,
        openPlatform: true,
        ...(item.provider ? { provider: item.provider } : {})
      }
    }))
}

export async function listOpenPlatformMarketConnectors(): Promise<OpenPlatformMarketMcpServer[]> {
  const page = await getOpenPlatformClient().listConnectors('market')
  return page.items
    .filter((item) => item.status === 'published')
    .map((item) => ({
      name: item.id,
      ...(item.provider ? { provider: item.provider } : {}),
      command: '',
      args: [],
      env: {},
      descriptions: item.description,
      icons: '',
      enabled: false,
      type: item.connectorType ?? 'http',
      source: 'open-platform',
      sourceId: item.id,
      isRunning: false,
      lifecycleStatus: 'stopped',
      errorMessage: undefined,
      authStatus: undefined,
      isLoading: false
    }))
}
