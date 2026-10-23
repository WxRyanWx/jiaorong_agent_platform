import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
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
import {
  useOpenPlatformApps,
  type OpenPlatformAppCard
} from '@jiaorong/open-platform/renderer/useOpenPlatformApps'
import type { OpenPlatformAppCapabilities } from '@jiaorong/open-platform/renderer/clientAppCapabilities'
import type { OpenPlatformClient } from '@jiaorong/open-platform/types'

vi.mock('@jiaorong/auth/host', () => ({
  JIAORONG_AUTH_SESSION_CHANGED_EVENT: 'jiaorong-auth-session-changed'
}))

const client = createMockOpenPlatformClient()
const PUBLISH_PROVIDER = '信科集团'
type MockAppPublishRequest = Parameters<typeof client.publishApp>[0] & {
  packagePath?: string
}

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
    const created = await client.publishApp({ provider: PUBLISH_PROVIDER, manifest: appManifest })
    expect(created.status).toBe('published')
    expect(created.version).toBe('0.0.1')

    await expect(
      client.publishApp({ provider: PUBLISH_PROVIDER, manifest: appManifest })
    ).rejects.toMatchObject({
      code: 'ASSET_ID_EXISTS'
    })

    const updated = await client.publishApp({
      id: 'my-app',
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, version: '0.0.2' }
    })
    expect(updated.version).toBe('0.0.2')

    await expect(
      client.publishApp({
        id: 'my-app',
        provider: PUBLISH_PROVIDER,
        manifest: { ...appManifest, version: '0.0.1' }
      })
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
    await client.publishSkill({ provider: PUBLISH_PROVIDER, metadata })
    await client.publishSkill({ id: 'my-skill', provider: PUBLISH_PROVIDER, metadata })
    const skills = await client.listSkills()
    expect(skills.items).toHaveLength(1)
    expect(skills.items[0]?.name).toBe('我的技能')
  })

  it('requires a publish provider for all asset types', async () => {
    await expect(client.publishApp({ manifest: appManifest })).rejects.toMatchObject({
      code: 'INVALID_REQUEST'
    })
    await expect(
      client.publishSkill({
        metadata: { name: 'provider-skill', displayName: '技能', description: '技能描述' }
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(
      client.publishConnector({
        metadata: { id: 'provider-mcp', name: 'provider-mcp', description: '描述', type: 'http' }
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
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

    await nextClient.publishSkill({
      id: 'draft-skill',
      provider: PUBLISH_PROVIDER,
      metadata: skillMetadata
    })
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
    await client.publishApp({ provider: PUBLISH_PROVIDER, manifest })
    await client.unpublishApp('republish-app')
    await expect(
      client.publishApp({ id: 'republish-app', provider: PUBLISH_PROVIDER, manifest })
    ).rejects.toMatchObject({
      code: 'VERSION_NOT_INCREASED'
    })
    await client.publishApp({
      id: 'republish-app',
      provider: PUBLISH_PROVIDER,
      manifest: { ...manifest, version: '1.0.1' }
    })

    await expect(client.listApps('mine')).resolves.toMatchObject({
      items: [{ id: 'republish-app', status: 'published', version: '1.0.1' }]
    })
  })

  it('removes unpublished apps from the mine list', async () => {
    await client.publishApp({
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'remove-app' }
    })
    await client.unpublishApp('remove-app')
    await client.removeApp('remove-app')

    await expect(client.listApps('mine')).resolves.toMatchObject({ items: [] })
  })

  it('maps published mock assets to plugin-center display models', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({ provider: PUBLISH_PROVIDER, manifest: appManifest })
    await client.publishSkill({
      provider: PUBLISH_PROVIDER,
      metadata: {
        name: 'market-skill',
        displayName: '市场技能',
        description: '市场技能描述'
      }
    })
    await client.publishConnector({
      provider: PUBLISH_PROVIDER,
      metadata: {
        id: 'market-mcp',
        name: 'market-mcp',
        description: '市场连接器描述',
        type: 'http'
      }
    })

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      { id: 'my-app', provider: PUBLISH_PROVIDER, openable: false }
    ])
    await expect(listOpenPlatformMarketSkills()).resolves.toMatchObject([
      {
        name: 'market-skill',
        mutable: false,
        assigned: true,
        metadata: { provider: PUBLISH_PROVIDER }
      }
    ])
    await expect(listOpenPlatformMarketConnectors()).resolves.toMatchObject([
      { name: 'market-mcp', source: 'open-platform', enabled: false, provider: PUBLISH_PROVIDER }
    ])
  })

  it('merges installed status into mock market app cards', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'installed-market-app' }
    })
    const originalJiaorongApps = window.jiaorongApps
    window.jiaorongApps = {
      getAppCenterInstallStatuses: vi.fn(async () => [
        {
          id: 'installed-market-app',
          name: '我的应用',
          description: '应用描述',
          iconSrc: 'file:///installed-market-app/icon.png',
          version: '0.0.1',
          installedVersion: '0.0.1',
          installStatus: 'installed',
          remotePackage: false,
          localPackagePath: null,
          openable: true,
          canUninstall: true,
          developerOnly: false,
          provider: ''
        }
      ])
    } as unknown as typeof window.jiaorongApps

    try {
      await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
        {
          id: 'installed-market-app',
          installStatus: 'installed',
          installedVersion: '0.0.1',
          openable: true,
          iconSrc: 'file:///installed-market-app/icon.png'
        }
      ])
    } finally {
      window.jiaorongApps = originalJiaorongApps
    }
  })

  it('maps mock app package paths for local installation', async () => {
    setOpenPlatformClient(client)
    const request: MockAppPublishRequest = {
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'local-package-app' },
      packagePath: '/tmp/local-package-app.zip'
    }
    await client.publishApp(request)
    await client.publishApp({
      id: 'local-package-app',
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'local-package-app', version: '0.0.2' }
    })

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      {
        id: 'local-package-app',
        localPackagePath: '/tmp/local-package-app.zip',
        remotePackage: false
      }
    ])
  })

  it('passes the selected zip path when updating a remote app', async () => {
    const publishApp = vi.fn(async () => ({}))
    const api = {
      listApps: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 100,
        total: 0,
        hasMore: false
      })),
      publishApp
    } as unknown as OpenPlatformClient
    const capabilities: OpenPlatformAppCapabilities = {
      syncLocalApps: vi.fn(async () => undefined),
      listLocalApps: vi.fn(async () => []),
      createLocalApp: vi.fn(async () => ({ ok: true })),
      publishLocalApp: vi.fn(async () => ({ ok: true })),
      pickZip: vi.fn(async () => null),
      peekZip: vi.fn(async () => null),
      openApp: vi.fn(async () => ({ ok: true })),
      onLocalAppsChanged: vi.fn(() => () => undefined)
    }
    const app = {
      id: 'remote-app',
      name: '远端应用',
      description: '远端应用描述',
      iconSrc: null,
      version: '0.0.1',
      installStatus: 'not_installed',
      openable: false,
      provider: '',
      dir: '',
      publishedVersion: '0.0.1',
      serverStatus: 'published',
      serverUpdatedAt: '',
      serverAuth: null,
      serverProvider: '信科集团'
    } as OpenPlatformAppCard
    let center: ReturnType<typeof useOpenPlatformApps> | undefined
    const wrapper = mount(
      defineComponent({
        render: () => null,
        setup() {
          center = useOpenPlatformApps({ api, capabilities })
        }
      })
    )
    await flushPromises()

    await center?.publishRemote(app, {
      fields: { ...appManifest, id: 'remote-app' },
      auth: null,
      provider: '信科集团',
      zipPath: '/tmp/remote-app-new.zip'
    })

    expect(publishApp).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'remote-app',
        packagePath: '/tmp/remote-app-new.zip'
      })
    )
    wrapper.unmount()
  })

  it('ignores mock package paths after the backend client replaces mock', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'backend-app' },
      auth: null,
      packagePath: '/tmp/backend-app.zip'
    })
    const backendClient = {
      listApps: vi.fn(async () => ({
        items: [
          {
            type: 'app',
            id: 'backend-app',
            name: '后端应用',
            description: '后端应用描述',
            provider: PUBLISH_PROVIDER,
            version: '0.0.1',
            status: 'published',
            iconUrl: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            latestRelease: {
              version: '0.0.1',
              releaseId: 'release-1',
              downloadUrl: 'https://backend.example.test/app.zip',
              sha256: 'sha256',
              publishedAt: '2026-01-01T00:00:00.000Z'
            },
            source: 'store',
            slot: 'app-center',
            auth: null
          }
        ],
        page: 1,
        pageSize: 100,
        total: 1,
        hasMore: false
      }))
    } as unknown as OpenPlatformClient
    setOpenPlatformClient(backendClient)

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      {
        id: 'backend-app',
        localPackagePath: null,
        remotePackage: true
      }
    ])
  })

  it('keeps own apps visible in the app center even when auth is configured', async () => {
    setOpenPlatformClient(client)
    await client.publishApp({
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'authed-app', name: '带权限应用' },
      auth: { orgs: [], userIds: [], phones: ['13000000000'] }
    })

    await expect(listOpenPlatformMarketApps()).resolves.toMatchObject([
      { id: 'authed-app', provider: PUBLISH_PROVIDER }
    ])
  })

  it('keeps organization names separate from organization ids', async () => {
    const created = await client.publishApp({
      provider: PUBLISH_PROVIDER,
      manifest: { ...appManifest, id: 'org-name-app', name: '组织名称应用' },
      auth: { orgs: [], orgNames: '信科集团', userIds: [], phones: [] }
    })

    expect(created.auth).toEqual({
      orgs: [],
      orgNames: '信科集团',
      userIds: [],
      phones: []
    })
  })

  it('keeps connector type and supports republish after unpublish', async () => {
    const metadata = {
      id: 'republish-mcp',
      name: 'republish-mcp',
      description: '重新发布连接器',
      type: 'sse' as const
    }
    await client.publishConnector({ provider: PUBLISH_PROVIDER, metadata })
    await client.unpublishConnector('republish-mcp')
    await client.publishConnector({ id: 'republish-mcp', provider: PUBLISH_PROVIDER, metadata })

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
    await client.publishSkill({ provider: PUBLISH_PROVIDER, metadata: skillMetadata })
    await client.publishConnector({ provider: PUBLISH_PROVIDER, metadata: connectorMetadata })
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
