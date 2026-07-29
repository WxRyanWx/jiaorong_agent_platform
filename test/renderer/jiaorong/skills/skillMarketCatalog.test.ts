import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'

const discoverSkills = vi.fn()

vi.mock('@api/legacy/presenters', () => ({
  useLegacyPresenter: () => ({
    discoverSkills
  })
}))

vi.mock('../../../../src/jiaorong_src/api/auth/interceptors', () => ({
  default: {
    get: vi.fn(async () => ({ data: [] }))
  }
}))

import {
  buildSkillMarketCatalog,
  mergeSkillMarketCatalog
} from '../../../../src/jiaorong_src/skills/lib/skillMarketCatalog'
import { fetchSkillMarketCatalog } from '../../../../src/jiaorong_src/api/skills'

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
    discoverSkills.mockReset()
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

  it('degrades remote failure to empty list', async () => {
    const fetchLocal = vi.fn(async () => [meta('docx')])
    const fetchRemote = vi.fn(async () => {
      throw new Error('network')
    })

    const result = await buildSkillMarketCatalog({
      fetchLocal,
      fetchRemote
    })

    expect(result.remote).toEqual([])
    expect(result.merged.map((s) => s.name)).toEqual(['docx'])
  })

  it('api entry scans local via discoverSkills', async () => {
    discoverSkills.mockResolvedValue([meta('a'), meta('b')])
    const result = await fetchSkillMarketCatalog()
    expect(discoverSkills).toHaveBeenCalledTimes(1)
    expect(result.local.map((s) => s.name).sort()).toEqual(['a', 'b'])
    expect(result.merged).toHaveLength(2)
  })

  it('merges local english slug onto remote chinese name via displayName', () => {
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
    expect(merged).toHaveLength(1)
    expect(merged[0]?.name).toBe('严格代码审查')
    expect(merged[0]?.skillRoot).toBe('/skills/critical-code-reviewer')
    expect(merged[0]?.metadata?.displayName).toBe('严格代码审查')
    expect(merged[0]?.metadata?.installedSkillName).toBe('critical-code-reviewer')
    expect(merged[0]?.metadata?.remoteId).toBe('s31')
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

    discoverSkills
      .mockImplementationOnce(async () => {
        await firstGate
        return [meta('first')]
      })
      .mockImplementationOnce(async () => [meta('second')])

    const first = fetchSkillMarketCatalog()
    const second = fetchSkillMarketCatalog()

    releaseFirst()
    const [a, b] = await Promise.all([first, second])

    expect(discoverSkills).toHaveBeenCalledTimes(2)
    expect(a.local.map((s) => s.name)).toEqual(['first'])
    expect(b.local.map((s) => s.name)).toEqual(['second'])
  })
})
