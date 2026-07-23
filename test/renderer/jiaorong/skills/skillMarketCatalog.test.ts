import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'

const discoverSkills = vi.fn()

vi.mock('@api/legacy/presenters', () => ({
  useLegacyPresenter: () => ({
    discoverSkills
  })
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

  it('merges remote and local with local winning on name conflict', () => {
    const local = [meta('shared')]
    local[0].description = 'local-desc'
    const remote = [
      { id: 'shared', name: 'Shared Remote', description: 'remote-desc' },
      { id: 'remote-only', name: 'Remote Only', description: 'only' }
    ]
    const merged = mergeSkillMarketCatalog(local, remote)
    expect(merged.find((s) => s.name === 'shared')?.description).toBe('local-desc')
    expect(merged.find((s) => s.name === 'remote-only')?.description).toBe('only')
  })

  it('loads remote and local in parallel then merges', async () => {
    const fetchLocal = vi.fn(async () => [meta('code-review'), meta('upload-a')])
    const fetchRemote = vi.fn(async () => [
      { id: 'remote-b', name: 'Remote B', description: 'from api' }
    ])

    const result = await buildSkillMarketCatalog({
      fetchLocal,
      fetchRemote
    })

    expect(fetchLocal).toHaveBeenCalledTimes(1)
    expect(fetchRemote).toHaveBeenCalledTimes(1)
    expect(result.merged.map((s) => s.name).sort()).toEqual(['code-review', 'remote-b', 'upload-a'])
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
