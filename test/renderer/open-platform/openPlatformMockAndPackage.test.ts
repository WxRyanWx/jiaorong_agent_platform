import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createMockOpenPlatformClient } from '@jiaorong/open-platform/api/mockOpenPlatformApi'
import { setOpenPlatformClient } from '@jiaorong/open-platform/api'
import {
  listOpenPlatformMarketApps,
  listOpenPlatformMarketConnectors,
  listOpenPlatformMarketSkills
} from '@jiaorong/open-platform/renderer/openPlatformMarket'
import {
  parseConnectorPackage,
  parseSkillPackage
} from '@jiaorong/open-platform/packages/parseOpenPlatformPackage'
import type { AppManifestFormFields } from '@jiaorong/appHost/manifestRules'

const client = createMockOpenPlatformClient()

const appManifest: AppManifestFormFields = {
  id: 'my-app',
  name: '我的应用',
  version: '0.0.1',
  entry: 'web-ui/index.html',
  slot: 'app-center',
  icon: '',
  description: '应用描述',
  spawn: ''
}

function createZipFile(entries: Record<string, Uint8Array>, name: string): File {
  const bytes = zipSync(entries)
  return {
    name,
    arrayBuffer: async () => bytes.slice().buffer
  } as File
}

describe('open platform mock api', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('publishes, updates, unpublishes, and filters market apps', async () => {
    const created = await client.publishApp({ manifest: appManifest })
    expect(created.status).toBe('published')
    expect(created.version).toBe('0.0.1')

    await expect(client.publishApp({ manifest: appManifest })).rejects.toMatchObject({
      code: 'ASSET_ID_EXISTS'
    })

    const updated = await client.publishApp({
      id: 'my-app',
      manifest: { ...appManifest, version: '0.0.2' }
    })
    expect(updated.version).toBe('0.0.2')

    await expect(
      client.publishApp({ id: 'my-app', manifest: { ...appManifest, version: '0.0.1' } })
    ).rejects.toMatchObject({ code: 'VERSION_NOT_INCREASED' })

    await client.unpublishApp('my-app')
    const mine = await client.listApps('mine')
    const market = await client.listApps('market')
    expect(mine.items[0]?.status).toBe('unpublished')
    expect(market.items).toHaveLength(0)
  })

  it('publishes and updates skills without version checks', async () => {
    const metadata = {
      name: 'my-skill',
      displayName: '我的技能',
      description: '技能描述'
    }
    await client.publishSkill({ metadata })
    await client.publishSkill({ id: 'my-skill', metadata })
    const skills = await client.listSkills()
    expect(skills.items).toHaveLength(1)
    expect(skills.items[0]?.name).toBe('我的技能')
  })

  it('creates persistent drafts, publishes them, and filters them from market lists', async () => {
    const skillMetadata = {
      name: 'draft-skill',
      displayName: '草稿技能',
      description: '草稿技能描述'
    }
    const connectorMetadata = {
      id: 'draft-mcp',
      name: 'draft-mcp',
      description: '草稿连接器描述',
      type: 'http' as const
    }
    const skill = await client.createSkill({ metadata: skillMetadata })
    const connector = await client.createConnector({ metadata: connectorMetadata })
    expect(skill.status).toBe('draft')
    expect(connector.status).toBe('draft')

    const nextClient = createMockOpenPlatformClient()
    await expect(nextClient.listSkills()).resolves.toMatchObject({
      items: [{ id: 'draft-skill', status: 'draft' }]
    })
    await expect(nextClient.listConnectors('mine')).resolves.toMatchObject({
      items: [{ id: 'draft-mcp', status: 'draft' }]
    })

    setOpenPlatformClient(nextClient)
    await expect(listOpenPlatformMarketSkills()).resolves.toEqual([])
    await expect(listOpenPlatformMarketConnectors()).resolves.toEqual([])

    await nextClient.publishSkill({ id: 'draft-skill', metadata: skillMetadata })
    await expect(nextClient.listSkills()).resolves.toMatchObject({
      items: [{ id: 'draft-skill', status: 'published' }]
    })
    await nextClient.removeConnector('draft-mcp')
    await expect(nextClient.listConnectors('mine')).resolves.toMatchObject({ items: [] })
  })

  it('rejects duplicate draft ids', async () => {
    const metadata = {
      name: 'duplicate-skill',
      displayName: '重复技能',
      description: '重复技能描述'
    }
    await client.createSkill({ metadata })
    await expect(client.createSkill({ metadata })).rejects.toMatchObject({
      code: 'ASSET_ID_EXISTS'
    })
  })

  it('requires app version to increase when republishing after unpublish', async () => {
    const manifest = { ...appManifest, id: 'republish-app', version: '1.0.0' }
    await client.publishApp({ manifest })
    await client.unpublishApp('republish-app')
    await expect(client.publishApp({ id: 'republish-app', manifest })).rejects.toMatchObject({
      code: 'VERSION_NOT_INCREASED'
    })
    await client.publishApp({ id: 'republish-app', manifest: { ...manifest, version: '1.0.1' } })

    await expect(client.listApps('mine')).resolves.toMatchObject({
      items: [{ id: 'republish-app', status: 'published', version: '1.0.1' }]
    })
  })

  it('removes unpublished apps from the mine list', async () => {
    await client.publishApp({ manifest: { ...appManifest, id: 'remove-app' } })
    await client.unpublishApp('remove-app')
    await client.removeApp('remove-app')

    await expect(client.listApps('mine')).resolves.toMatchObject({ items: [] })
  })

  it('maps published mock assets to plugin-center display models', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({ manifest: appManifest })
    await client.publishSkill({
      metadata: {
        name: 'market-skill',
        displayName: '市场技能',
        description: '市场技能描述'
      }
    })
    await client.publishConnector({
      metadata: {
        id: 'market-mcp',
        name: 'market-mcp',
        description: '市场连接器描述',
        type: 'http'
      }
    })

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      { id: 'my-app', provider: '开放平台', openable: false }
    ])
    await expect(listOpenPlatformMarketSkills()).resolves.toMatchObject([
      { name: 'market-skill', mutable: false, assigned: true }
    ])
    await expect(listOpenPlatformMarketConnectors()).resolves.toMatchObject([
      { name: 'market-mcp', source: 'open-platform', enabled: false }
    ])
  })

  it('keeps own apps visible in the app center even when auth is configured', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({
      manifest: { ...appManifest, id: 'authed-app', name: '带权限应用' },
      auth: { orgs: [], userIds: [], phones: ['13000000000'] }
    })

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      { id: 'authed-app', provider: '开放平台' }
    ])
  })

  it('keeps connector type and supports republish after unpublish', async () => {
    const metadata = {
      id: 'republish-mcp',
      name: 'republish-mcp',
      description: '重新发布连接器',
      type: 'sse' as const
    }
    await client.publishConnector({ metadata })
    await client.unpublishConnector('republish-mcp')
    await client.publishConnector({ id: 'republish-mcp', metadata })

    const connectors = await client.listConnectors('market')
    expect(connectors.items[0]).toMatchObject({
      id: 'republish-mcp',
      status: 'published',
      connectorType: 'sse'
    })
  })

  it('removes unpublished skills and connectors from the mine list', async () => {
    const skillMetadata = { name: 'remove-skill', displayName: '移除技能', description: '移除技能' }
    const connectorMetadata = {
      id: 'remove-mcp',
      name: 'remove-mcp',
      description: '移除连接器',
      type: 'http' as const
    }
    await client.publishSkill({ metadata: skillMetadata })
    await client.publishConnector({ metadata: connectorMetadata })
    await client.unpublishSkill('remove-skill')
    await client.unpublishConnector('remove-mcp')
    await client.removeSkill('remove-skill')
    await client.removeConnector('remove-mcp')

    await expect(client.listSkills()).resolves.toMatchObject({ items: [] })
    await expect(client.listConnectors('mine')).resolves.toMatchObject({ items: [] })
  })
})

describe('open platform package parser', () => {
  it('parses root SKILL.md frontmatter', async () => {
    const file = createZipFile(
      {
        'SKILL.md': strToU8(
          '---\nname: my-skill\ndescription: 技能描述\nmetadata:\n  displayName: 我的技能\n---\n\n正文\n'
        )
      },
      'skill.zip'
    )
    await expect(parseSkillPackage(file)).resolves.toEqual({
      name: 'my-skill',
      displayName: '我的技能',
      description: '技能描述'
    })
  })

  it('parses one root MCP service and infers http from url', async () => {
    const file = createZipFile(
      {
        'mcp.json': strToU8(
          JSON.stringify({
            mcpServers: {
              我的连接器: {
                url: 'https://example.com/mcp',
                descriptions: '示例连接器'
              }
            }
          })
        )
      },
      'connector.zip'
    )
    await expect(parseConnectorPackage(file)).resolves.toMatchObject({
      id: '我的连接器',
      type: 'http',
      description: '示例连接器'
    })
  })

  it('rejects multiple MCP services', async () => {
    const file = createZipFile(
      {
        'mcp.json': strToU8(
          JSON.stringify({
            mcpServers: {
              one: { type: 'stdio', command: 'npx' },
              two: { type: 'stdio', command: 'npx' }
            }
          })
        )
      },
      'connector.zip'
    )
    await expect(parseConnectorPackage(file)).rejects.toThrow(
      '一个连接器 zip 只能包含一个 MCP 服务'
    )
  })
})
