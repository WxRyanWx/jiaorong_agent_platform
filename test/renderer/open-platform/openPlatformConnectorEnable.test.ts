import { beforeEach, describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createMockOpenPlatformClient } from './helpers/mockOpenPlatformClient'
import { setOpenPlatformClient } from '@jiaorong/api/openPlatform'
import {
  canEnableOpenPlatformConnector,
  listOpenPlatformMarketConnectors,
  toMcpServerConfig
} from '@jiaorong/plugins/market/openPlatformMarket'
import {
  collectInstalledConnectorSourceIds,
  findOutdatedConnectorServers,
  findRevokedConnectorServerNames,
  resolveConnectorServerName,
  toInstallableConnectorConfig,
  toUpdatableConnectorConfig
} from '@jiaorong/plugins/market/openPlatformConnectorInstall'
import { parseConnectorPackage } from '@jiaorong/open-platform/packages/parseOpenPlatformPackage'
import type {
  OpenPlatformConnectorConfig,
  OpenPlatformConnectorListItem
} from '@jiaorong/api/openPlatform/types'
import { isOpenPlatformConnectorMarketItem } from '@jiaorong/api/openPlatform/types'
import type { MCPServerConfig } from '@shared/types/mcp'

const client = createMockOpenPlatformClient()
const PUBLISH_PROVIDER = '信科集团'

function createConnectorZip(config: Record<string, unknown>, name = 'connector.zip'): File {
  const bytes = zipSync({
    'mcp.json': strToU8(JSON.stringify({ mcpServers: { 'jina-public-mcp': config } }))
  })
  return { name, arrayBuffer: async () => bytes.slice().buffer } as File
}

function createListItem(
  overrides: Partial<OpenPlatformConnectorListItem> = {}
): OpenPlatformConnectorListItem {
  return {
    type: 'connector',
    id: 'jina-public-mcp',
    name: 'jina-public-mcp',
    description: 'Jina 公共连接器',
    provider: PUBLISH_PROVIDER,
    version: null,
    status: 'published',
    iconUrl: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    latestRelease: {
      version: null,
      releaseId: 'mock_connector_jina-public-mcp',
      downloadUrl: 'https://mock.jiaorong.ai/connector/jina-public-mcp.zip',
      sha256: 'connector-jina-public-mcp',
      publishedAt: '2026-10-26T00:00:00.000Z'
    },
    connectorType: 'http',
    ...overrides
  }
}

const httpConfig: OpenPlatformConnectorConfig = {
  type: 'http',
  command: '',
  args: [],
  env: {},
  baseUrl: 'https://mcp.jina.ai/mcp',
  customHeaders: { Authorization: 'Bearer jina_token' },
  descriptions: 'Jina 公共连接器',
  icons: ''
}

const stdioConfig: OpenPlatformConnectorConfig = {
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'jina-mcp'],
  env: { JINA_API_KEY: 'key-value' },
  baseUrl: '',
  descriptions: 'Jina 本地连接器',
  icons: ''
}

describe('connector package config parsing', () => {
  it('normalizes url into baseUrl and keeps remote headers', async () => {
    const parsed = await parseConnectorPackage(
      createConnectorZip({
        type: 'http',
        url: 'https://mcp.jina.ai/mcp',
        descriptions: 'Jina 公共连接器',
        customHeaders: { Authorization: 'Bearer jina_token' }
      })
    )

    expect(parsed.config).toMatchObject({
      type: 'http',
      baseUrl: 'https://mcp.jina.ai/mcp',
      customHeaders: { Authorization: 'Bearer jina_token' },
      descriptions: 'Jina 公共连接器'
    })
  })

  it('keeps stdio command, args and env', async () => {
    const parsed = await parseConnectorPackage(
      createConnectorZip({
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'jina-mcp'],
        env: { JINA_API_KEY: 'key-value' }
      })
    )

    expect(parsed.config).toMatchObject({
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'jina-mcp'],
      env: { JINA_API_KEY: 'key-value' },
      baseUrl: ''
    })
  })

  it('rejects remote and stdio packages missing their endpoint', async () => {
    await expect(parseConnectorPackage(createConnectorZip({ type: 'http' }))).rejects.toThrow(
      'http、sse 连接器必须提供 url 或 baseUrl'
    )
    await expect(parseConnectorPackage(createConnectorZip({ type: 'stdio' }))).rejects.toThrow(
      'stdio 连接器必须提供 command'
    )
  })

  it('prefers url over baseUrl to match the manual json import path', async () => {
    const parsed = await parseConnectorPackage(
      createConnectorZip({
        type: 'http',
        url: 'https://from-url/mcp',
        baseUrl: 'https://from-base-url/mcp'
      })
    )

    expect(parsed.config.baseUrl).toBe('https://from-url/mcp')
  })

  it('stringifies scalar args and env values instead of dropping them', async () => {
    const parsed = await parseConnectorPackage(
      createConnectorZip({
        type: 'stdio',
        command: 'npx',
        args: ['-p', 3000, '--verbose', true],
        env: { PORT: 3000, DEBUG: true, JINA_API_KEY: 'key-value' },
        customHeaders: { 'X-Retry': 3 }
      })
    )

    expect(parsed.config.args).toEqual(['-p', '3000', '--verbose', 'true'])
    expect(parsed.config.env).toEqual({ PORT: '3000', DEBUG: 'true', JINA_API_KEY: 'key-value' })
    expect(parsed.config.customHeaders).toEqual({ 'X-Retry': '3' })
  })

  it('drops nested objects that cannot be passed through as strings', async () => {
    const parsed = await parseConnectorPackage(
      createConnectorZip({
        type: 'stdio',
        command: 'npx',
        args: ['-y', { nested: 'value' }, 'jina-mcp'],
        env: { BROKEN: { nested: 'value' }, KEEP: 'value' }
      })
    )

    expect(parsed.config.args).toEqual(['-y', 'jina-mcp'])
    expect(parsed.config.env).toEqual({ KEEP: 'value' })
  })
})

describe('connector market contract', () => {
  beforeEach(() => {
    localStorage.clear()
    setOpenPlatformClient(client)
  })

  it('returns config only for the market scope', async () => {
    await client.publishConnector({
      provider: PUBLISH_PROVIDER,
      version: '1.0.0',
      metadata: {
        id: 'jina-public-mcp',
        name: 'jina-public-mcp',
        description: 'Jina',
        type: 'http'
      },
      packageConfig: httpConfig
    })

    const market = await client.listConnectors('market')
    expect(market.items[0]).toMatchObject({
      id: 'jina-public-mcp',
      source: 'open-platform',
      sourceId: 'jina-public-mcp',
      config: httpConfig
    })
    expect(isOpenPlatformConnectorMarketItem(market.items[0])).toBe(true)

    const mine = await client.listConnectors('mine')
    expect(mine.items[0]?.config).toBeUndefined()
    expect(mine.items[0]?.source).toBeUndefined()
    expect(isOpenPlatformConnectorMarketItem(mine.items[0])).toBe(false)
  })

  it('keeps stored config when republishing without a new package', async () => {
    await client.publishConnector({
      provider: PUBLISH_PROVIDER,
      version: '1.0.0',
      metadata: { id: 'keep-mcp', name: 'keep-mcp', description: '保留配置', type: 'http' },
      packageConfig: httpConfig
    })
    await client.unpublishConnector('keep-mcp')
    await client.publishConnector({
      id: 'keep-mcp',
      provider: PUBLISH_PROVIDER,
      version: '1.0.1',
      metadata: { id: 'keep-mcp', name: 'keep-mcp', description: '保留配置', type: 'http' }
    })

    const market = await client.listConnectors('market')
    expect(market.items[0]?.config).toMatchObject({ baseUrl: 'https://mcp.jina.ai/mcp' })
  })

  it('maps market items into runnable local server configs', async () => {
    await client.publishConnector({
      provider: PUBLISH_PROVIDER,
      version: '1.0.0',
      metadata: {
        id: 'jina-public-mcp',
        name: 'jina-public-mcp',
        description: 'Jina',
        type: 'http'
      },
      packageConfig: httpConfig
    })

    const connectors = await listOpenPlatformMarketConnectors()
    expect(connectors).toMatchObject([
      {
        name: 'jina-public-mcp',
        baseUrl: 'https://mcp.jina.ai/mcp',
        type: 'http',
        source: 'open-platform',
        sourceId: 'jina-public-mcp',
        sourceVersion: '1.0.0',
        enabled: false
      }
    ])
    expect(canEnableOpenPlatformConnector(connectors[0])).toBe(true)
  })
})

describe('connector config adapter', () => {
  it('fills defaults and never injects host owned identity', () => {
    const mapped = toMcpServerConfig(
      createListItem({ config: { ...httpConfig, args: ['-y'], env: { A: 'b' } } })
    )

    expect(mapped).toMatchObject({
      command: '',
      args: ['-y'],
      env: { A: 'b' },
      baseUrl: 'https://mcp.jina.ai/mcp',
      type: 'http',
      source: 'open-platform',
      sourceId: 'jina-public-mcp',
      enabled: false
    })
    expect(mapped.serverId).toBeUndefined()
    expect(mapped.configGeneration).toBeUndefined()
    expect(mapped.bindingHash).toBeUndefined()
  })

  it('degrades legacy items without config into non enableable servers', () => {
    const mapped = toMcpServerConfig(createListItem())

    expect(mapped).toMatchObject({ command: '', baseUrl: '', enabled: false })
    expect(canEnableOpenPlatformConnector(mapped)).toBe(false)
  })

  it('validates the endpoint that matches the connector type', () => {
    const remoteWithoutBaseUrl = toMcpServerConfig(
      createListItem({ config: { ...httpConfig, baseUrl: '' } })
    )
    const stdioWithoutCommand = toMcpServerConfig(
      createListItem({
        config: { ...stdioConfig, command: '', baseUrl: 'https://mcp.jina.ai/mcp' }
      })
    )

    expect(canEnableOpenPlatformConnector(remoteWithoutBaseUrl)).toBe(false)
    expect(canEnableOpenPlatformConnector(stdioWithoutCommand)).toBe(false)
    expect(
      canEnableOpenPlatformConnector(toMcpServerConfig(createListItem({ config: stdioConfig })))
    ).toBe(true)
  })

  it('strips presentation fields when producing the installable config', () => {
    const server = {
      ...toMcpServerConfig(createListItem({ config: httpConfig })),
      name: 'jina-public-mcp',
      isRunning: false,
      lifecycleStatus: 'stopped' as const
    }

    const installable = toInstallableConnectorConfig(server)
    expect(installable).toEqual({
      command: '',
      args: [],
      env: {},
      descriptions: 'Jina 公共连接器',
      icons: '',
      enabled: false,
      baseUrl: 'https://mcp.jina.ai/mcp',
      customHeaders: { Authorization: 'Bearer jina_token' },
      type: 'http',
      source: 'open-platform',
      sourceId: 'jina-public-mcp'
    })
  })
})

describe('connector local merge rules', () => {
  const createServer = (overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
    command: '',
    args: [],
    env: {},
    descriptions: '',
    icons: '',
    enabled: true,
    type: 'http',
    ...overrides
  })

  it('appends a suffix when the connector id collides with a local server', () => {
    const servers = {
      'jina-public-mcp': createServer(),
      'jina-public-mcp-2': createServer()
    }

    expect(resolveConnectorServerName('jina-public-mcp', servers)).toBe('jina-public-mcp-3')
    expect(resolveConnectorServerName('tencent-meeting', servers)).toBe('tencent-meeting')
  })

  it('dedupes market entries by sourceId after a suffixed install', () => {
    const servers = {
      'jina-public-mcp': createServer({ command: 'npx' }),
      'jina-public-mcp-2': createServer({ source: 'open-platform', sourceId: 'jina-public-mcp' })
    }

    expect(collectInstalledConnectorSourceIds(servers)).toEqual(new Set(['jina-public-mcp']))
  })

  it('ignores manually added servers without an open platform source', () => {
    const servers = { 'tencent-meeting': createServer({ baseUrl: 'https://meeting.example/mcp' }) }

    expect(collectInstalledConnectorSourceIds(servers).size).toBe(0)
  })
})

describe('connector update detection', () => {
  const createServer = (overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
    command: '',
    args: [],
    env: {},
    descriptions: '',
    icons: '',
    enabled: true,
    type: 'http',
    ...overrides
  })

  const createMarketServer = (version: string | null) =>
    toMcpServerConfig(createListItem({ version, config: httpConfig }))

  it('flags installed connectors whose market version is newer', () => {
    const servers = {
      'jina-public-mcp': createServer({
        source: 'open-platform',
        sourceId: 'jina-public-mcp',
        sourceVersion: '1.0.0'
      })
    }

    const outdated = findOutdatedConnectorServers(servers, [createMarketServer('1.0.1')])
    expect([...outdated.keys()]).toEqual(['jina-public-mcp'])
    expect(outdated.get('jina-public-mcp')?.sourceVersion).toBe('1.0.1')
  })

  it('does not flag equal or versionless market entries', () => {
    const servers = {
      same: createServer({ source: 'open-platform', sourceId: 'same', sourceVersion: '1.0.0' }),
      legacy: createServer({ source: 'open-platform', sourceId: 'legacy' })
    }
    const marketSame = { ...createMarketServer('1.0.0'), sourceId: 'same' }
    const marketNoVersion = { ...createMarketServer(null), sourceId: 'none' }
    const serversNoMatch = {
      ...servers,
      none: createServer({ source: 'open-platform', sourceId: 'none', sourceVersion: '1.0.0' })
    }

    expect(findOutdatedConnectorServers(serversNoMatch, [marketSame, marketNoVersion]).size).toBe(0)
  })

  it('flags local source versions recorded ahead of the market (reset version history)', () => {
    // 后端重置过版本号后，本地 sourceVersion 会高于市场版本；
    // 不提示的话按钮永久消失，用户只能删了重装。
    const servers = {
      reset: createServer({ source: 'open-platform', sourceId: 'reset', sourceVersion: '2.0.0' })
    }
    const marketOlder = { ...createMarketServer('1.9.9'), sourceId: 'reset' }

    expect(findOutdatedConnectorServers(servers, [marketOlder]).size).toBe(1)
  })

  it('flags legacy installs without a recorded source version', () => {
    const servers = {
      legacy: createServer({ source: 'open-platform', sourceId: 'legacy' })
    }
    const market = { ...createMarketServer('1.0.0'), sourceId: 'legacy' }

    expect([...findOutdatedConnectorServers(servers, [market]).keys()]).toEqual(['legacy'])
  })

  it('ignores manual servers and unmatched source ids', () => {
    const servers = {
      manual: createServer({ sourceVersion: '0.0.1', baseUrl: 'https://manual.example/mcp' }),
      missing: createServer({ source: 'open-platform', sourceId: 'gone', sourceVersion: '1.0.0' })
    }

    expect(findOutdatedConnectorServers(servers, [createMarketServer('9.9.9')]).size).toBe(0)
  })

  it('produces an update payload without enabled and with the new version', () => {
    const payload = toUpdatableConnectorConfig(
      Object.assign(createMarketServer('1.1.0'), { name: 'jina-public-mcp' })
    )

    expect(payload).toMatchObject({
      baseUrl: 'https://mcp.jina.ai/mcp',
      source: 'open-platform',
      sourceId: 'jina-public-mcp',
      sourceVersion: '1.1.0'
    })
    expect(payload.enabled).toBeUndefined()
  })
})

describe('connector revoke detection', () => {
  const createServer = (overrides: Partial<MCPServerConfig> = {}): MCPServerConfig => ({
    command: '',
    args: [],
    env: {},
    descriptions: '',
    icons: '',
    enabled: true,
    type: 'http',
    ...overrides
  })

  it('flags installed connectors that disappeared from the market', () => {
    const servers = {
      'jina-public-mcp': createServer({ source: 'open-platform', sourceId: 'jina-public-mcp' }),
      'tencent-meeting': createServer({ source: 'open-platform', sourceId: 'tencent-meeting' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set(['tencent-meeting']))).toEqual([
      'jina-public-mcp'
    ])
  })

  it('keeps suffixed installs because they are matched by sourceId', () => {
    const servers = {
      'jina-public-mcp': createServer({ baseUrl: 'https://manual.example/mcp' }),
      'jina-public-mcp-2': createServer({ source: 'open-platform', sourceId: 'jina-public-mcp' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set(['jina-public-mcp']))).toEqual([])
  })

  it('flags every installed connector when the market becomes empty', () => {
    const servers = {
      'jina-public-mcp': createServer({ source: 'open-platform', sourceId: 'jina-public-mcp' }),
      'tencent-meeting': createServer({ source: 'open-platform', sourceId: 'tencent-meeting' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set())).toEqual([
      'jina-public-mcp',
      'tencent-meeting'
    ])
  })

  it('keeps open platform entries without a source id', () => {
    const servers = {
      legacy: createServer({ source: 'open-platform' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set())).toEqual([])
  })

  it('never flags plugin owned or in-memory servers even with an open platform source', () => {
    const servers = {
      'plugin-server': createServer({
        source: 'open-platform',
        sourceId: 'plugin-server',
        ownerPluginId: 'demo-plugin'
      }),
      memory: createServer({ source: 'open-platform', sourceId: 'memory', type: 'inmemory' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set())).toEqual([])
  })

  it('never flags manually added, plugin owned or built-in servers', () => {
    const servers = {
      'tencent-meeting': createServer({ baseUrl: 'https://meeting.example/mcp' }),
      'plugin-server': createServer({ source: 'plugin', sourceId: 'plugin-server' }),
      memory: createServer({ type: 'inmemory' })
    }

    expect(findRevokedConnectorServerNames(servers, new Set())).toEqual([])
  })
})
