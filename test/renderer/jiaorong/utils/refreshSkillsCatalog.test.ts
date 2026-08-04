import { beforeEach, describe, expect, it, vi } from 'vitest'

const discoverSkills = vi.fn()
const skillsRef = { value: [] as Array<{ name: string }> }

vi.mock('@api/legacy/presenters', () => ({
  useLegacyPresenter: () => ({
    discoverSkills
  })
}))

vi.mock('@/stores/skillsStore', () => ({
  useSkillsStore: () => ({
    get skills() {
      return skillsRef.value
    },
    set skills(next: Array<{ name: string }>) {
      skillsRef.value = next
    }
  })
}))

import { refreshSkillsCatalog } from '../../../../src/jiaorong_src/utils/refreshSkillsCatalog'

describe('refreshSkillsCatalog', () => {
  beforeEach(() => {
    discoverSkills.mockReset()
    skillsRef.value = []
  })

  it('discovers skills and writes them into skillsStore', async () => {
    discoverSkills.mockResolvedValue([
      {
        name: 'java-backend-dev',
        description: 'java',
        path: '/skills/java-backend-dev/SKILL.md',
        skillRoot: '/skills/java-backend-dev',
        category: null
      }
    ])

    const result = await refreshSkillsCatalog()

    expect(discoverSkills).toHaveBeenCalledTimes(1)
    expect(result.map((s) => s.name)).toEqual(['java-backend-dev'])
    expect(skillsRef.value.map((s) => s.name)).toEqual(['java-backend-dev'])
  })
})
