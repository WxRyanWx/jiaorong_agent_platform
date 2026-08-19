import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JIAORONG_SKILL_SWITCH_SETTING_KEY,
  SkillSwitchStatus
} from '../../../../src/jiaorong_src/utils/skillSwitchCore'

const { getSetting, setSetting, setSkillDisabled } = vi.hoisted(() => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
  setSkillDisabled: vi.fn()
}))

vi.mock('@api/ConfigClient', () => ({
  createConfigClient: () => ({
    getSetting,
    setSetting
  })
}))

vi.mock('@api/SkillClient', () => ({
  createSkillClient: () => ({
    setSkillDisabled,
    getActiveSkills: vi.fn(async () => []),
    setActiveSkills: vi.fn(async () => undefined)
  })
}))

import {
  _resetSkillSwitchHydrateForTests,
  ensureSkillSwitchHydrated,
  getSkillSwitchStatus,
  JIAORONG_SKILL_SWITCH_STORAGE_KEY,
  setSkillSwitchStatus
} from '../../../../src/jiaorong_src/utils/skillSwitch'

describe('skillSwitch hydrate', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetSkillSwitchHydrateForTests()
    getSetting.mockReset()
    setSetting.mockReset()
    setSkillDisabled.mockReset()
    getSetting.mockResolvedValue({})
    setSetting.mockResolvedValue(undefined)
    setSkillDisabled.mockResolvedValue(undefined)
  })

  afterEach(() => {
    localStorage.clear()
    _resetSkillSwitchHydrateForTests()
  })

  it('hydrates local cache from config before UI reads', async () => {
    getSetting.mockResolvedValue({ docx: SkillSwitchStatus.Off })

    await ensureSkillSwitchHydrated()

    expect(getSetting).toHaveBeenCalledWith(JIAORONG_SKILL_SWITCH_SETTING_KEY)
    expect(getSkillSwitchStatus('docx')).toBe(SkillSwitchStatus.Off)
    expect(JSON.parse(localStorage.getItem(JIAORONG_SKILL_SWITCH_STORAGE_KEY) || '{}')).toEqual({
      docx: SkillSwitchStatus.Off
    })
  })

  it('waits for hydrate then persists the user write', async () => {
    let releaseHydrate!: (value: unknown) => void
    getSetting.mockReturnValue(
      new Promise((resolve) => {
        releaseHydrate = resolve
      })
    )

    const pending = setSkillSwitchStatus('docx', SkillSwitchStatus.Off)
    await Promise.resolve()
    expect(setSetting).not.toHaveBeenCalled()

    releaseHydrate({ pdf: SkillSwitchStatus.Off })
    const result = await pending

    expect(result.success).toBe(true)
    expect(getSkillSwitchStatus('docx')).toBe(SkillSwitchStatus.Off)
    expect(getSkillSwitchStatus('pdf')).toBe(SkillSwitchStatus.Off)
    expect(setSetting).toHaveBeenCalledWith(JIAORONG_SKILL_SWITCH_SETTING_KEY, {
      pdf: SkillSwitchStatus.Off,
      docx: SkillSwitchStatus.Off
    })
  })

  it('awaits config persist before returning', async () => {
    let releasePersist!: () => void
    setSetting.mockReturnValue(
      new Promise<void>((resolve) => {
        releasePersist = resolve
      })
    )

    let finished = false
    const pending = setSkillSwitchStatus('xlsx', SkillSwitchStatus.Off).then((result) => {
      finished = true
      return result
    })

    await vi.waitFor(() => expect(setSetting).toHaveBeenCalled())
    expect(finished).toBe(false)

    releasePersist()
    await pending
    expect(finished).toBe(true)
  })

  it('does not rewrite Agent assignments when turning a Skill on', async () => {
    await setSkillSwitchStatus('docx', SkillSwitchStatus.On)

    expect(setSkillDisabled).not.toHaveBeenCalled()
  })
})
