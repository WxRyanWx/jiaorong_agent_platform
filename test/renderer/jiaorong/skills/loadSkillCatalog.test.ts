import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'
import {
  loadSkillCatalogResilient,
  loadSkillMarketCatalog,
  mergeSkillMarketCatalog,
  shouldRetrySkillCatalog
} from '../../../../src/jiaorong_src/skills/lib/loadSkillCatalog'

function meta(name: string): SkillMetadata {
  return {
    name,
    description: name,
    path: `/skills/${name}/SKILL.md`,
    skillRoot: `/skills/${name}`,
    category: null
  }
}

describe('loadSkillCatalog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries while catalog looks builtin-only then returns full list', async () => {
    const builtinOnly = [meta('code-review'), meta('docx')]
    const full = [...builtinOnly, meta('accounting-archive')]
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(builtinOnly)
      .mockResolvedValueOnce(builtinOnly)
      .mockResolvedValueOnce(full)

    const sleep = vi.fn(async () => undefined)
    const skills = await loadSkillCatalogResilient({
      fetch,
      sleep,
      maxRetries: 5,
      retryDelayMs: 10
    })

    expect(skills.map((s) => s.name)).toEqual(['code-review', 'docx', 'accounting-archive'])
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('shouldRetrySkillCatalog detects empty and builtin-only lists', () => {
    expect(shouldRetrySkillCatalog([])).toBe(true)
    expect(shouldRetrySkillCatalog([meta('pdf'), meta('xlsx')])).toBe(true)
    expect(shouldRetrySkillCatalog([meta('pdf'), meta('custom')])).toBe(false)
  })

  it('aborts retries when shouldAbort becomes true', async () => {
    const fetch = vi.fn(async () => [meta('code-review')])
    const sleep = vi.fn(async () => undefined)
    const skills = await loadSkillCatalogResilient({
      fetch,
      sleep,
      maxRetries: 5,
      retryDelayMs: 10,
      shouldAbort: () => true
    })
    expect(skills).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
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

    const result = await loadSkillMarketCatalog({
      fetchLocal,
      fetchRemote,
      maxRetries: 0
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

    const result = await loadSkillMarketCatalog({
      fetchLocal,
      fetchRemote,
      maxRetries: 0
    })

    expect(result.remote).toEqual([])
    expect(result.merged.map((s) => s.name)).toEqual(['docx'])
  })
})
