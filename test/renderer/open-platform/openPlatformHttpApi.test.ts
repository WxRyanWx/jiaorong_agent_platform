import { afterEach, describe, expect, it, vi } from 'vitest'

const { interceptorGet, interceptorPost } = vi.hoisted(() => ({
  interceptorGet: vi.fn(),
  interceptorPost: vi.fn()
}))

// axios 响应拦截器已把响应解成 body，这里直接返回 { code, message, data }
vi.mock('../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: {
    get: interceptorGet,
    post: interceptorPost
  },
  isAuthApiSuccessCode: (code: unknown) =>
    code != null && code !== '' && (Number(code) === 200 || Number(code) === 8000000)
}))

import { createHttpOpenPlatformClient } from '@jiaorong/api/openPlatform/httpApi'
import type { OpenPlatformConnectorListItem } from '@jiaorong/api/openPlatform/types'

const ASSETS_PATH = 'deepchat-ext/assets'
const SILENT = { dontShowMessage: true }

const client = createHttpOpenPlatformClient()

function ok(data: unknown) {
  return { code: 200, message: 'success', data }
}

function page(items: unknown[], total = items.length, hasMore = false) {
  return ok({ items, page: 1, pageSize: 100, total, hasMore })
}

function connectorRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'connector',
    id: 'probe-connector',
    name: 'probe-connector',
    description: '探针连接器',
    version: '1.0.0',
    status: 'published',
    iconUrl: null,
    createdAt: '2026-10-27T09:00:00.000Z',
    updatedAt: '2026-10-27T09:00:00.000Z',
    latestRelease: {
      version: '1.0.0',
      releaseId: 'rel_1',
      downloadUrl:
        'http://106.63.7.106:10001/api/deepchat-ext/assets/connector/probe-connector/package',
      sha256: 'sha-1',
      publishedAt: '2026-10-27T09:00:00.000Z'
    },
    source: 'open-platform',
    sourceId: 'probe-connector',
    config: {
      type: 'http',
      command: '',
      args: [],
      env: {},
      descriptions: '探针连接器',
      icons: '',
      enabled: false,
      baseUrl: 'https://mcp.example.test/v1',
      customHeaders: {},
      customNpmRegistry: null,
      inheritEnv: null,
      authorization: null,
      source: 'open-platform',
      sourceId: 'probe-connector'
    },
    ...overrides
  }
}

function zipFile(name = 'pkg.zip'): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], name, { type: 'application/zip' })
}

const connectorMetadata = {
  id: 'probe-connector',
  name: 'probe-connector',
  description: '探针连接器',
  type: 'http' as const
}

const appManifest = {
  id: 'probe-app',
  name: '探针应用',
  version: '1.0.0',
  entry: 'web-ui/index.html',
  slot: 'app-center',
  icon: '',
  description: '探针应用描述',
  spawn: ''
}

afterEach(() => {
  interceptorGet.mockReset()
  interceptorPost.mockReset()
})

describe('open platform http api 列表', () => {
  it('按 hasMore 循环翻页并收敛成一份完整快照', async () => {
    interceptorGet
      .mockResolvedValueOnce(page([connectorRaw({ id: 'c1', sourceId: 'c1' })], 3, true))
      .mockResolvedValueOnce(page([connectorRaw({ id: 'c2', sourceId: 'c2' })], 3, false))

    const result = await client.listConnectors('market')

    expect(result.items.map((item) => item.id)).toEqual(['c1', 'c2'])
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)
    expect(interceptorGet).toHaveBeenNthCalledWith(1, ASSETS_PATH, {
      params: { type: 'connector', scope: 'market', page: 1, pageSize: 100 },
      headers: SILENT
    })
    expect(interceptorGet).toHaveBeenNthCalledWith(2, ASSETS_PATH, {
      params: { type: 'connector', scope: 'market', page: 2, pageSize: 100 },
      headers: SILENT
    })
  })

  it('把市场连接器的 config 收成客户端可直接落地的形状', async () => {
    interceptorGet.mockResolvedValueOnce(page([connectorRaw()]))

    const result = await client.listConnectors('market')
    const item = result.items[0] as OpenPlatformConnectorListItem

    // customHeaders 空对象、customNpmRegistry / inheritEnv 为 null，都要收成缺省
    expect(item.config).toEqual({
      type: 'http',
      command: '',
      args: [],
      env: {},
      baseUrl: 'https://mcp.example.test/v1',
      descriptions: '探针连接器',
      icons: ''
    })
    expect(item.source).toBe('open-platform')
    expect(item.sourceId).toBe('probe-connector')
    expect(item.connectorType).toBe('http')
    expect(item.latestRelease?.releaseId).toBe('rel_1')
  })

  it('后端未落地的 provider 与草稿态 latestRelease 都保持 null', async () => {
    interceptorGet.mockResolvedValueOnce(
      page([
        {
          type: 'skill',
          id: 'draft-skill',
          name: '草稿技能',
          description: '描述',
          version: null,
          status: 'draft',
          iconUrl: null,
          createdAt: null,
          updatedAt: '2026-10-27T09:00:00.000Z',
          latestRelease: null
        }
      ])
    )

    const result = await client.listSkills('mine')

    expect(interceptorGet).toHaveBeenCalledWith(ASSETS_PATH, {
      params: { type: 'skill', scope: 'mine', page: 1, pageSize: 100 },
      headers: SILENT
    })
    expect(result.items[0]).toMatchObject({
      type: 'skill',
      id: 'draft-skill',
      provider: null,
      version: null,
      status: 'draft',
      latestRelease: null,
      createdAt: ''
    })
  })

  it('映射应用的 source / slot / auth，认不出的取值按默认', async () => {
    interceptorGet.mockResolvedValueOnce(
      page([
        {
          type: 'app',
          id: 'collaboration-platform',
          name: '协同平台',
          description: '协同平台',
          version: '1.0.9',
          status: 'published',
          iconUrl: null,
          createdAt: '2026-10-26T07:34:04.000Z',
          updatedAt: '2026-10-26T07:34:04.000Z',
          latestRelease: null,
          source: 'store',
          slot: 'menu',
          auth: null
        },
        {
          type: 'app',
          id: 'weird-app',
          name: '异常取值',
          description: '',
          version: '1.0.0',
          status: 'unknown-status',
          iconUrl: null,
          createdAt: '',
          updatedAt: '',
          latestRelease: null,
          source: 'something-else',
          slot: 'something-else',
          auth: { orgs: ['信科集团'], orgNames: '信科集团', userIds: [], phones: [] }
        }
      ])
    )

    const result = await client.listApps('market')

    expect(result.items[0]).toMatchObject({
      type: 'app',
      source: 'store',
      slot: 'menu',
      auth: null
    })
    expect(result.items[1]).toMatchObject({
      source: 'store',
      slot: 'app-center',
      status: 'draft',
      auth: { orgs: ['信科集团'], orgNames: '信科集团', userIds: [], phones: [] }
    })
  })

  it('丢掉缺 id 的脏数据，不让下游拿到空卡片', async () => {
    interceptorGet.mockResolvedValueOnce(page([{ type: 'skill', name: '没有 id' }]))

    await expect(client.listSkills('market')).resolves.toMatchObject({ items: [] })
  })

  it('把技能列表的 skillSource 收成 assetSource，域外取值按缺失', async () => {
    interceptorGet.mockResolvedValueOnce(
      page([
        { type: 'skill', id: 's38', name: '旧技能', skillSource: 'legacy' },
        { type: 'skill', id: 'dev-god', name: '新技能', skillSource: 'open-platform' },
        { type: 'skill', id: 'no-source', name: '缺字段' },
        // 应用的 source 是 builtin / store，不属于技能新旧标识的取值域
        { type: 'skill', id: 'weird', name: '脏数据', skillSource: 'store' }
      ])
    )

    const result = await client.listSkills('market')

    expect(result.items.map((item) => item.assetSource)).toEqual([
      'legacy',
      'open-platform',
      undefined,
      undefined
    ])
  })

  it('skillSource 与旧 source 同时存在时优先取 skillSource', async () => {
    interceptorGet.mockResolvedValueOnce(
      page([
        {
          type: 'skill',
          id: 's38',
          name: '旧技能',
          skillSource: 'open-platform',
          source: 'legacy'
        }
      ])
    )

    await expect(client.listSkills('market')).resolves.toMatchObject({
      items: [{ assetSource: 'open-platform' }]
    })
  })

  it('任一页失败即整体抛错，不返回半份快照', async () => {
    interceptorGet
      .mockResolvedValueOnce(page([connectorRaw()], 200, true))
      .mockResolvedValueOnce({ code: 500, message: '系统繁忙，请稍后重试', data: null })

    await expect(client.listConnectors('market')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: '系统繁忙，请稍后重试'
    })
  })

  it('hasMore 恒真时触发分页上限保护', async () => {
    interceptorGet.mockImplementation(async () => page([connectorRaw()], 99999, true))

    await expect(client.listConnectors('market')).rejects.toMatchObject({
      code: 'INTERNAL',
      message: '连接器列表加载失败：分页超出上限'
    })
    expect(interceptorGet).toHaveBeenCalledTimes(100)
  })
})

describe('open platform http api 发布', () => {
  it('技能与连接器发布送 multipart：type / id / version / file', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'connector', id: 'probe-connector' }))

    await client.publishConnector({
      id: 'probe-connector',
      provider: '信科集团',
      version: '1.0.1',
      package: zipFile('probe-connector.zip'),
      metadata: connectorMetadata
    })

    const [url, form, config] = interceptorPost.mock.calls[0]
    expect(url).toBe(`${ASSETS_PATH}/publish`)
    expect(form.get('type')).toBe('connector')
    expect(form.get('id')).toBe('probe-connector')
    expect(form.get('version')).toBe('1.0.1')
    expect(form.get('provider')).toBe('信科集团')
    expect((form.get('file') as File).name).toBe('probe-connector.zip')
    expect(config.headers.dontShowMessage).toBe(true)
    expect(config.headers['Idempotency-Key']).toMatch(/^op-connector-publish-/)
  })

  it('缺省 id 时用包内 name 兜底，缺版本号直接报错不发请求', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'skill', id: 'probe-skill' }))

    await client.publishSkill({
      version: '0.2.0',
      package: zipFile(),
      metadata: { name: 'probe-skill', displayName: '探针技能', description: '描述' }
    })
    expect(interceptorPost.mock.calls[0][1].get('id')).toBe('probe-skill')
    expect(interceptorPost.mock.calls[0][1].get('type')).toBe('skill')

    interceptorPost.mockClear()
    await expect(
      client.publishSkill({
        package: zipFile(),
        metadata: { name: 'probe-skill', displayName: '探针技能', description: '描述' }
      })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST', message: '版本号不能为空' })
    expect(interceptorPost).not.toHaveBeenCalled()
  })

  it('技能发布携带非空 categoryId，空值与连接器发布都不送', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'skill', id: 'probe-skill' }))

    await client.publishSkill({
      version: '1.0.0',
      categoryId: 'rd',
      package: zipFile(),
      metadata: { name: 'probe-skill', displayName: '探针技能', description: '描述' }
    })
    expect(interceptorPost.mock.calls[0][1].get('categoryId')).toBe('rd')

    interceptorPost.mockClear()
    await client.publishSkill({
      version: '1.0.1',
      categoryId: '  ',
      package: zipFile(),
      metadata: { name: 'probe-skill', displayName: '探针技能', description: '描述' }
    })
    expect(interceptorPost.mock.calls[0][1].has('categoryId')).toBe(false)

    interceptorPost.mockClear()
    interceptorPost.mockResolvedValue(ok({ type: 'connector', id: 'probe-connector' }))
    await client.publishConnector({
      version: '1.0.0',
      package: zipFile(),
      metadata: connectorMetadata
    })
    expect(interceptorPost.mock.calls[0][1].has('categoryId')).toBe(false)
  })

  it('缺制品或制品超上限时不发请求', async () => {
    await expect(
      client.publishConnector({ version: '1.0.0', metadata: connectorMetadata })
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' })

    const oversized = { size: 201 * 1024 * 1024, name: 'big.zip' } as unknown as Blob
    await expect(
      client.publishConnector({ version: '1.0.0', package: oversized, metadata: connectorMetadata })
    ).rejects.toMatchObject({ message: '安装包超过 200MB 上限，请精简后重新打包' })

    expect(interceptorPost).not.toHaveBeenCalled()
  })

  it('Blob 没有文件名时按资产 id 兜底命名', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'connector', id: 'probe-connector' }))
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' })

    await client.publishConnector({
      id: 'probe-connector',
      version: '1.0.0',
      package: blob,
      metadata: connectorMetadata
    })

    expect((interceptorPost.mock.calls[0][1].get('file') as File).name).toBe('probe-connector.zip')
  })

  it('应用首次发布不带 id，更新发布带 id，manifest 只送非空字段', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'app', id: 'probe-app' }))

    await client.publishApp({ provider: '信科集团', manifest: appManifest, package: zipFile() })
    const createForm = interceptorPost.mock.calls[0][1]
    expect(interceptorPost.mock.calls[0][0]).toBe(`${ASSETS_PATH}/app/publish`)
    expect(createForm.has('id')).toBe(false)
    // icon / spawn 为空串，不能送出去：后端会拿 icon 当包内文件路径校验
    expect(JSON.parse(createForm.get('manifest'))).toEqual({
      id: 'probe-app',
      name: '探针应用',
      version: '1.0.0',
      entry: 'web-ui/index.html',
      slot: 'app-center',
      description: '探针应用描述'
    })

    await client.publishApp({
      id: 'probe-app',
      provider: '信科集团',
      manifest: { ...appManifest, version: '1.0.1' },
      package: zipFile()
    })
    expect(interceptorPost.mock.calls[1][1].get('id')).toBe('probe-app')
  })

  it('每次请求生成新的 Idempotency-Key', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'app', id: 'probe-app' }))

    await client.publishApp({ provider: '信科集团', manifest: appManifest, package: zipFile() })
    await client.publishApp({ provider: '信科集团', manifest: appManifest, package: zipFile() })

    const [first, second] = interceptorPost.mock.calls.map(
      (call) => call[2].headers['Idempotency-Key']
    )
    expect(first).toMatch(/^op-app-publish-/)
    expect(second).toMatch(/^op-app-publish-/)
    expect(first).not.toBe(second)
  })

  it('草稿只送清单，不要求制品', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'skill', id: 'probe-skill', status: 'draft' }))

    await client.createSkill({
      metadata: { name: 'probe-skill', displayName: '探针技能', description: '描述' }
    })
    const [url, form, config] = interceptorPost.mock.calls[0]
    expect(url).toBe(`${ASSETS_PATH}/draft`)
    expect(form.get('type')).toBe('skill')
    expect(JSON.parse(form.get('manifest'))).toEqual({
      name: 'probe-skill',
      displayName: '探针技能',
      description: '描述'
    })
    expect(form.has('file')).toBe(false)
    expect(config.headers['Idempotency-Key']).toMatch(/^op-skill-draft-/)

    interceptorPost.mockClear()
    interceptorPost.mockResolvedValue(ok({ type: 'connector', id: 'probe-connector' }))
    await client.createConnector({ metadata: connectorMetadata })
    expect(interceptorPost.mock.calls[0][1].get('type')).toBe('connector')
    expect(JSON.parse(interceptorPost.mock.calls[0][1].get('manifest'))).toEqual({
      id: 'probe-connector',
      name: 'probe-connector',
      description: '探针连接器',
      type: 'http'
    })
  })

  it('技能分类走 skillCategory/list，解析成 {id, categoryName} 并静默报错', async () => {
    interceptorGet.mockResolvedValueOnce(
      ok([
        { id: 'bidding', categoryName: '经营投标', createTime: null, updateTime: null },
        { id: 'rd', categoryName: '软件研发', createTime: null, updateTime: null },
        { id: 'bad', categoryName: '   ', createTime: null, updateTime: null }
      ])
    )

    await expect(client.listSkillCategories()).resolves.toEqual([
      { id: 'bidding', categoryName: '经营投标' },
      { id: 'rd', categoryName: '软件研发' }
    ])
    expect(interceptorGet).toHaveBeenCalledWith('deepchat-ext/skillCategory/list', {
      headers: SILENT
    })

    interceptorGet.mockClear()
    interceptorGet.mockResolvedValueOnce({ code: 500, message: '系统繁忙', data: null })
    await expect(client.listSkillCategories()).rejects.toMatchObject({ message: '系统繁忙' })
  })
})

describe('open platform http api 动作', () => {
  it('下架 / 重新上架 / 移除都走 actions 的 JSON body', async () => {
    interceptorPost.mockResolvedValue(ok({ type: 'skill', id: 'probe-skill' }))

    await client.unpublishSkill('probe-skill')
    expect(interceptorPost).toHaveBeenNthCalledWith(
      1,
      `${ASSETS_PATH}/actions`,
      { type: 'skill', id: 'probe-skill', action: 'unpublish' },
      { headers: SILENT }
    )

    await client.republishSkill('probe-skill')
    expect(interceptorPost).toHaveBeenNthCalledWith(
      2,
      `${ASSETS_PATH}/actions`,
      { type: 'skill', id: 'probe-skill', action: 'republish' },
      { headers: SILENT }
    )

    await client.republishConnector('probe-connector')
    expect(interceptorPost).toHaveBeenNthCalledWith(
      3,
      `${ASSETS_PATH}/actions`,
      { type: 'connector', id: 'probe-connector', action: 'republish' },
      { headers: SILENT }
    )

    await client.removeApp('probe-app')
    expect(interceptorPost).toHaveBeenNthCalledWith(
      4,
      `${ASSETS_PATH}/actions`,
      { type: 'app', id: 'probe-app', action: 'remove' },
      { headers: SILENT }
    )
  })

  it('动作响应缺 AssetSummary 时按非法数据报错', async () => {
    interceptorPost.mockResolvedValue(ok(null))

    await expect(client.unpublishConnector('probe-connector')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: '连接器下架失败'
    })
  })

  it('后端状态机拒绝时把原文透出，remove 已发布记录报 400', async () => {
    interceptorPost.mockResolvedValue({
      code: 400,
      message: '仅草稿或已下架记录可移除，发布中的记录需先下架',
      data: null
    })

    await expect(client.removeSkill('probe-skill')).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      message: '仅草稿或已下架记录可移除，发布中的记录需先下架'
    })
  })
})

describe('open platform http api 错误码映射', () => {
  const cases: Array<[number, string]> = [
    [400, 'INVALID_REQUEST'],
    [403, 'FORBIDDEN'],
    [404, 'ASSET_NOT_FOUND'],
    [409, 'ASSET_ID_EXISTS'],
    [500, 'INTERNAL'],
    [418, 'HTTP_418']
  ]

  it.each(cases)('业务码 %i 映射成 %s', async (code, expected) => {
    interceptorGet.mockResolvedValue({ code, message: '后端原文', data: null })

    await expect(client.listApps('mine')).rejects.toMatchObject({
      code: expected,
      message: '后端原文'
    })
  })

  it('后端没给 message 时用调用方兜底文案', async () => {
    interceptorGet.mockResolvedValue({ code: 409, message: '  ', data: null })

    await expect(client.listSkills('mine')).rejects.toMatchObject({
      code: 'ASSET_ID_EXISTS',
      message: '技能列表加载失败'
    })
  })
})
