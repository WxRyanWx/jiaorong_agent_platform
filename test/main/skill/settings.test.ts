import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { SkillSettings } from '@/skill/settings'

describe('SkillSettings', () => {
  const values = new Map<string, unknown>()
  const store = {
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => values.set(key, value))
  }

  beforeEach(() => {
    values.clear()
    vi.clearAllMocks()
    vi.mocked(app.getPath).mockReturnValue('/home/tester')
  })

  it('returns the Skill defaults', () => {
    const settings = new SkillSettings(store as never)

    expect(settings.isEnabled()).toBe(true)
    expect(settings.isDraftSuggestionsEnabled()).toBe(false)
    expect(settings.getPath()).toBe('/home/tester/.jiaorongchat/skills')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('repairs current-user legacy .deepchat skills paths and persists them', () => {
    const settings = new SkillSettings(store as never)
    values.set('skillsPath', '/home/tester/.deepchat/skills')

    expect(settings.getPath()).toBe('/home/tester/.jiaorongchat/skills')
    expect(values.get('skillsPath')).toBe('/home/tester/.jiaorongchat/skills')
    expect(store.set).toHaveBeenCalledWith('skillsPath', '/home/tester/.jiaorongchat/skills')
  })

  it('leaves custom skills paths unchanged', () => {
    const settings = new SkillSettings(store as never)
    values.set('skillsPath', '/opt/custom-skills')

    expect(settings.getPath()).toBe('/opt/custom-skills')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('reads and writes Skill-owned settings', () => {
    const settings = new SkillSettings(store as never)
    const managementState = {
      version: 2 as const,
      agents: { deepchat: { skills: {} } }
    }
    const scanCache = { timestamp: '2026-07-16T00:00:00.000Z', tools: [] }

    settings.setDraftSuggestionsEnabled(true)
    settings.setManagementState(managementState)
    settings.setScanCache(scanCache)

    expect(settings.isDraftSuggestionsEnabled()).toBe(true)
    expect(settings.getManagementState()).toEqual(managementState)
    expect(settings.getScanCache()).toEqual(scanCache)
  })

  it('freezes legacy Agent migration targets once while preserving v1 state', () => {
    const settings = new SkillSettings(store as never)
    values.set('skills.managementState', {
      version: 1,
      skills: {},
      sync: { skillsDirectory: '/sync', layout: 'multi-skill-repo' }
    })

    settings.freezeLegacyMigrationTargets(['writer', 'analyst', 'writer', 'deepchat'], {
      writer: [' skill-b ', 'skill-a', 'skill-b'],
      ignored: ['other']
    })

    expect(values.get('skills.managementState')).toEqual({
      version: 1,
      skills: {},
      sync: { skillsDirectory: '/sync', layout: 'multi-skill-repo' },
      migration: {
        targetAgentIds: ['analyst', 'writer'],
        completedAgentIds: [],
        legacySkillAllowLists: {
          writer: ['skill-a', 'skill-b']
        }
      }
    })

    settings.freezeLegacyMigrationTargets(['created-later'])
    expect(
      (values.get('skills.managementState') as { migration: { targetAgentIds: string[] } })
        .migration.targetAgentIds
    ).toEqual(['analyst', 'writer'])
    expect(store.set).toHaveBeenCalledTimes(1)
  })
})
