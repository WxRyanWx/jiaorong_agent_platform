import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getOpenPlatformClient, setOpenPlatformClient } from '@jiaorong/api/openPlatform'
import { listOpenPlatformMarketSkillListItems } from '@jiaorong/plugins/market/openPlatformMarket'
import { fetchSkillMarketCatalog } from '@jiaorong/api/skills'
import type { OpenPlatformAssetSummary, OpenPlatformClient } from '@jiaorong/api/openPlatform/types'
import type { SkillMetadata } from '@shared/types/skill'

const { getAllSkills } = vi.hoisted(() => ({ getAllSkills: vi.fn() }))

vi.mock('@api/SkillClient', () => ({
  createSkillClient: () => ({ getAllSkills })
}))

vi.mock('../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: { get: vi.fn(async () => ({ code: 200, data: [] })) },
  isAuthApiSuccessCode: (code: unknown) => Number(code) === 200
}))

/** 旧技能市场迁入的资产：没有 release，下载地址只在顶层。 */
const legacyAsset: OpenPlatformAssetSummary = {
  type: 'skill',
  id: 's51',
  name: '24清单',
  description: '计价标准',
  provider: null,
  version: null,
  status: 'published',
  iconUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  latestRelease: null,
  downloadUrl: 'https://oss.example.com/legacy/24-bills.zip',
  assetSource: 'legacy'
}

/** 开放平台发布的资产：release 与顶层下载地址同值，带版本号与发布组织。 */
const publishedAsset: OpenPlatformAssetSummary = {
  type: 'skill',
  id: 'frontend-design',
  name: '前端设计',
  description: '市场前端设计',
  provider: '信科集团',
  version: '1.2.0',
  status: 'published',
  iconUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  assetSource: 'open-platform',
  latestRelease: {
    version: '1.2.0',
    releaseId: 'r-1',
    downloadUrl: 'https://oss.example.com/open/frontend-design.zip',
    sha256: 'deadbeef',
    publishedAt: '2026-02-01T00:00:00Z'
  },
  downloadUrl: 'https://oss.example.com/open/frontend-design.zip'
}

const unpublishedAsset: OpenPlatformAssetSummary = {
  ...publishedAsset,
  id: 'draft-skill',
  name: '草稿技能',
  status: 'draft'
}

const installClient = (items: OpenPlatformAssetSummary[]) => {
  setOpenPlatformClient({
    listSkills: vi.fn(async () => ({
      items,
      page: 1,
      pageSize: 100,
      total: items.length,
      hasMore: false
    }))
  } as unknown as OpenPlatformClient)
}

const localMeta = (name: string, metadata?: Record<string, unknown>): SkillMetadata => ({
  name,
  description: `${name}-local`,
  path: `/skills/${name}/SKILL.md`,
  skillRoot: `/skills/${name}`,
  category: null,
  ...(metadata ? { metadata } : {})
})

describe('open platform skill market source', () => {
  const originalClient = getOpenPlatformClient()

  beforeEach(() => {
    getAllSkills.mockReset()
    getAllSkills.mockResolvedValue([])
  })

  afterEach(() => {
    setOpenPlatformClient(originalClient)
  })

  it('maps published assets only and falls back to the top level download url', async () => {
    installClient([legacyAsset, publishedAsset, unpublishedAsset])

    await expect(listOpenPlatformMarketSkillListItems()).resolves.toEqual([
      {
        id: 's51',
        name: '24清单',
        description: '计价标准',
        downloadUrl: 'https://oss.example.com/legacy/24-bills.zip',
        openPlatform: true,
        source: 'legacy'
      },
      {
        id: 'frontend-design',
        name: '前端设计',
        description: '市场前端设计',
        downloadUrl: 'https://oss.example.com/open/frontend-design.zip',
        version: '1.2.0',
        provider: '信科集团',
        openPlatform: true,
        source: 'open-platform'
      }
    ])
  })

  it('returns one card per asset after merging with the local scan', async () => {
    installClient([legacyAsset, publishedAsset])
    getAllSkills.mockResolvedValue([localMeta('24清单'), localMeta('other-local')])

    const catalog = await fetchSkillMarketCatalog()

    expect(catalog.remoteError).toBeUndefined()
    expect(catalog.merged.map((skill) => skill.name).sort()).toEqual([
      '24清单',
      'other-local',
      '前端设计'
    ])
  })

  it('pins market version and source flag against local frontmatter', async () => {
    installClient([publishedAsset])
    getAllSkills.mockResolvedValue([
      localMeta('前端设计', { version: '0.0.1', displayName: '前端设计' })
    ])

    const catalog = await fetchSkillMarketCatalog()
    const merged = catalog.merged.find((skill) => skill.name === '前端设计')

    expect(merged?.metadata).toMatchObject({
      remoteId: 'frontend-design',
      downloadUrl: 'https://oss.example.com/open/frontend-design.zip',
      provider: '信科集团',
      remoteVersion: '1.2.0',
      openPlatform: true,
      source: 'open-platform',
      installedSkillName: '前端设计'
    })
  })

  it('never treats the package frontmatter version as the market version', async () => {
    // legacy 资产没有市场版本；包内 SKILL.md 的 metadata.version 不能被当成市场版本，
    // 否则刚装好的技能会立刻出现「更新」按钮
    installClient([legacyAsset])
    getAllSkills.mockResolvedValue([localMeta('24清单', { version: '9.9.9' })])

    const catalog = await fetchSkillMarketCatalog()
    const merged = catalog.merged.find((skill) => skill.name === '24清单')

    expect(merged?.metadata?.remoteVersion).toBeUndefined()
    expect(merged?.metadata?.openPlatform).toBe(true)
    expect(merged?.metadata?.source).toBe('legacy')
  })

  it('renders one card per asset for the real market shape (20 legacy + 2 published)', async () => {
    const legacyItems = Array.from({ length: 20 }, (_, index) => ({
      ...legacyAsset,
      id: `s${index + 1}`,
      name: `旧市场技能${index + 1}`,
      downloadUrl: `https://oss.example.com/legacy/s${index + 1}.zip`
    }))
    installClient([...legacyItems, publishedAsset, unpublishedAsset])
    // 本地已装其中两条：目录名与市场展示名一致，应合并而不是各出一张卡
    getAllSkills.mockResolvedValue([localMeta('旧市场技能1'), localMeta('前端设计')])

    const catalog = await fetchSkillMarketCatalog()
    const names = catalog.merged.map((skill) => skill.name)

    expect(catalog.remote).toHaveLength(21)
    expect(names).toHaveLength(21)
    expect(new Set(names).size).toBe(21)
    expect(names).toContain('旧市场技能20')
  })
})
