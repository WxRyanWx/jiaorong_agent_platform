import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'

const { getAllSkills, interceptorGet } = vi.hoisted(() => ({
  getAllSkills: vi.fn(),
  interceptorGet: vi.fn(async () => ({ code: 200, data: [] }))
}))

vi.mock('@api/SkillClient', () => ({
  createSkillClient: () => ({
    getAllSkills
  })
}))

vi.mock('../../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: {
    get: interceptorGet
  },
  isAuthApiSuccessCode: (code: unknown) =>
    code != null && code !== '' && (Number(code) === 200 || Number(code) === 8000000)
}))

import {
  buildSkillMarketCatalog,
  mergeSkillMarketCatalog
} from '../../../../src/jiaorong_src/skills/lib/skillMarketCatalog'
import { fetchSkillMarketCatalog, getSkillDetail } from '../../../../src/jiaorong_src/api/skills'

function meta(name: string): SkillMetadata {
  return {
    name,
    description: name,
    path: `/skills/${name}/SKILL.md`,
    skillRoot: `/skills/${name}`,
    category: null
  }
}

describe('fetchSkillMarketCatalog', () => {
  afterEach(() => {
    getAllSkills.mockReset()
    interceptorGet.mockReset()
    interceptorGet.mockResolvedValue({ code: 200, data: [] })
  })

  it('merges remote and local preferring remote desc over local description', () => {
    const local = [meta('shared')]
    local[0].description = 'local-desc'
    const remote = [
      {
        id: 's1',
        name: 'shared',
        description: 'remote-desc',
        downloadUrl: 'https://example.com/a.zip'
      },
      {
        id: 's2',
        name: 'Remote Only',
        description: 'only',
        downloadUrl: 'https://example.com/b.zip'
      }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    const shared = merged.find((s) => s.name === 'shared')
    expect(shared?.description).toBe('remote-desc')
    expect(shared?.skillRoot).toBe('/skills/shared')
    expect(shared?.metadata?.remoteId).toBe('s1')
    expect(shared?.metadata?.downloadUrl).toBe('https://example.com/a.zip')
    expect(merged.find((s) => s.name === 'Remote Only')?.description).toBe('only')
    expect(merged.find((s) => s.name === 'Remote Only')?.metadata?.remoteId).toBe('s2')
    expect(merged.find((s) => s.name === 'Remote Only')?.metadata?.downloadUrl).toBe(
      'https://example.com/b.zip'
    )
  })

  it('loads remote and local in parallel then merges', async () => {
    const fetchLocal = vi.fn(async () => [meta('code-review'), meta('upload-a')])
    const fetchRemote = vi.fn(async () => [
      {
        id: 'remote-b',
        name: 'Remote B',
        description: 'from api',
        downloadUrl: 'https://example.com/c.zip'
      }
    ])

    const result = await buildSkillMarketCatalog({
      fetchLocal,
      fetchRemote
    })

    expect(fetchLocal).toHaveBeenCalledTimes(1)
    expect(fetchRemote).toHaveBeenCalledTimes(1)
    expect(result.merged.map((s) => s.name).sort()).toEqual(['Remote B', 'code-review', 'upload-a'])
  })

  it('keeps local skills and records remoteError when remote fails', async () => {
    const fetchLocal = vi.fn(async () => [meta('docx')])
    const fetchRemote = vi.fn(async () => {
      throw new Error('network')
    })

    const result = await buildSkillMarketCatalog({
      fetchLocal,
      fetchRemote
    })

    expect(result.remote).toEqual([])
    expect(result.remoteError).toBe('network')
    expect(result.merged.map((s) => s.name)).toEqual(['docx'])
  })

  it('treats non-success remote list as failure not empty catalog', async () => {
    getAllSkills.mockResolvedValue([meta('docx')])
    interceptorGet.mockResolvedValue({ code: 500, message: 'down', data: [] })

    const result = await fetchSkillMarketCatalog()

    expect(result.remote).toEqual([])
    expect(result.remoteError).toBe('down')
    expect(result.merged.map((s) => s.name)).toEqual(['docx'])
  })

  it('api entry scans local via SkillClient.getAllSkills', async () => {
    getAllSkills.mockResolvedValue([meta('a'), meta('b')])
    const result = await fetchSkillMarketCatalog()
    expect(getAllSkills).toHaveBeenCalledTimes(1)
    expect(result.local.map((s) => s.name).sort()).toEqual(['a', 'b'])
    expect(result.merged).toHaveLength(2)
  })

  it('does not merge by displayName; only exact name match', () => {
    const local = [
      {
        ...meta('critical-code-reviewer'),
        metadata: { displayName: '严格代码审查' }
      }
    ]
    const remote = [
      {
        id: 's31',
        name: '严格代码审查',
        description: '远程描述',
        downloadUrl: 'https://example.com/a.zip'
      }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    expect(merged).toHaveLength(2)
    expect(merged.map((s) => s.name).sort()).toEqual(['critical-code-reviewer', '严格代码审查'])
  })

  it('merges only when local name equals remote name', () => {
    const local = [
      {
        ...meta('严格代码审查'),
        description: 'local-desc',
        metadata: { displayName: '严格代码审查' }
      }
    ]
    const remote = [
      {
        id: 's31',
        name: '严格代码审查',
        description: '远程描述',
        downloadUrl: 'https://example.com/a.zip'
      }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.name).toBe('严格代码审查')
    expect(merged[0]?.description).toBe('远程描述')
    expect(merged[0]?.metadata?.remoteId).toBe('s31')
    expect(merged[0]?.metadata?.installedSkillName).toBe('严格代码审查')
  })

  it('keeps builtin and market cards separate when displayName collides', () => {
    const local = [
      {
        ...meta('frontend-design'),
        metadata: { displayName: '前端设计' }
      }
    ]
    const remote = [
      {
        id: 's32',
        name: '前端设计',
        description: '市场前端设计',
        downloadUrl: 'https://example.com/frontend-design-3-0.1.0.zip'
      }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    expect(merged).toHaveLength(2)
    expect(merged.map((s) => s.name).sort()).toEqual(['frontend-design', '前端设计'])
  })

  it('keeps separate cards when local has no displayName matching remote', () => {
    const local = [meta('construction-plan-review-output-spec')]
    const remote = [
      {
        id: 's9',
        name: '施工方案审核输出规范',
        description: '远程',
        downloadUrl: 'https://example.com/out.zip'
      }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    expect(merged).toHaveLength(2)
  })

  it('serializes concurrent catalog fetches that scan local', async () => {
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    getAllSkills
      .mockImplementationOnce(async () => {
        await firstGate
        return [meta('first')]
      })
      .mockImplementationOnce(async () => [meta('second')])

    const first = fetchSkillMarketCatalog()
    const second = fetchSkillMarketCatalog()

    releaseFirst()
    const [a, b] = await Promise.all([first, second])

    expect(getAllSkills).toHaveBeenCalledTimes(2)
    expect(a.local.map((s) => s.name)).toEqual(['first'])
    expect(b.local.map((s) => s.name)).toEqual(['second'])
  })
})

describe('getSkillDetail', () => {
  afterEach(() => {
    interceptorGet.mockReset()
    interceptorGet.mockResolvedValue({ code: 200, data: [] })
  })

  it('maps successful detail payload', async () => {
    interceptorGet.mockResolvedValue({
      code: 200,
      data: {
        id: 's51',
        name: '24清单',
        alias: '24-bills-pricing',
        desc: '计价标准',
        downloadUrl: 'https://example.com/a.zip',
        exampleTemplateList: ['查术语']
      }
    })

    await expect(getSkillDetail('s51')).resolves.toEqual({
      id: 's51',
      name: '24清单',
      description: '计价标准',
      tryPrompts: ['查术语'],
      downloadUrl: 'https://example.com/a.zip'
    })
  })

  it('throws when the auth api code is not success', async () => {
    interceptorGet.mockResolvedValue({ code: 500, message: 'down', data: { name: 'ghost' } })

    await expect(getSkillDetail('s51')).rejects.toThrow('down')
  })
})
