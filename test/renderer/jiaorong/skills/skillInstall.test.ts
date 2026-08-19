import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAllSkills, getMetadataList, storeSkills } = vi.hoisted(() => ({
  getAllSkills: vi.fn(),
  getMetadataList: vi.fn(),
  storeSkills: [] as Array<{ name: string; metadata?: { displayName?: string } }>
}))

vi.mock('@api/SkillClient', () => ({
  createSkillClient: () => ({
    getAllSkills,
    getMetadataList
  })
}))

vi.mock('@/stores/skillsStore', () => ({
  useSkillsStore: () => ({
    skills: storeSkills,
    loadSkills: vi.fn()
  })
}))

import {
  catalogHasInstalledSkill,
  expandSkillInstallLookupNames,
  isSkillInstalledAsync
} from '../../../../src/jiaorong_src/utils/skillInstall'
import { rememberRemoteInstall } from '../../../../src/jiaorong_src/skills/lib/sessionSkill'

describe('skill install lookup', () => {
  beforeEach(() => {
    localStorage.clear()
    getAllSkills.mockReset()
    getMetadataList.mockReset()
    storeSkills.length = 0
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('expands market display names to local directory names', () => {
    rememberRemoteInstall('24清单', '24-bills-pricing')
    expect(expandSkillInstallLookupNames('24清单')).toEqual(
      expect.arrayContaining(['24清单', '24-bills-pricing'])
    )
  })

  it('matches catalog by local name or displayName', () => {
    const skills = [{ name: '24-bills-pricing', metadata: { displayName: '24清单' } }]
    expect(catalogHasInstalledSkill(skills, ['24清单'])).toBe(true)
    expect(catalogHasInstalledSkill(skills, ['24-bills-pricing'])).toBe(true)
    expect(catalogHasInstalledSkill(skills, ['other'])).toBe(false)
  })

  it('uses getAllSkills so unassigned installed skills still count', async () => {
    getAllSkills.mockResolvedValue([
      { name: '24-bills-pricing', metadata: { displayName: '24清单' } }
    ])
    getMetadataList.mockResolvedValue([])

    await expect(isSkillInstalledAsync('24清单')).resolves.toBe(true)
    expect(getAllSkills).toHaveBeenCalledTimes(1)
    expect(getMetadataList).not.toHaveBeenCalled()
  })
})
