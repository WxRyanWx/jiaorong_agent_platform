import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllSkills = vi.fn()
const loadSkills = vi.fn()

vi.mock('@api/SkillClient', () => ({
  createSkillClient: () => ({
    getAllSkills
  })
}))

vi.mock('@/stores/skillsStore', () => ({
  useSkillsStore: () => ({
    loadSkills
  })
}))

import { refreshSkillsCatalog } from '../../../../src/jiaorong_src/utils/refreshSkillsCatalog'

describe('refreshSkillsCatalog', () => {
  beforeEach(() => {
    getAllSkills.mockReset()
    loadSkills.mockReset()
    loadSkills.mockResolvedValue(undefined)
  })

  it('scans local skills via SkillClient and reloads skillsStore', async () => {
    getAllSkills.mockResolvedValue([
      {
        name: 'java-backend-dev',
        description: 'java',
        path: '/skills/java-backend-dev/SKILL.md',
        skillRoot: '/skills/java-backend-dev',
        category: null
      }
    ])

    const result = await refreshSkillsCatalog()

    expect(getAllSkills).toHaveBeenCalledTimes(1)
    expect(loadSkills).toHaveBeenCalledTimes(1)
    expect(result.map((s) => s.name)).toEqual(['java-backend-dev'])
  })
})
