import { afterEach, describe, expect, it } from 'vitest'
import {
  applyMockSkillUninstalled,
  getMockSkill,
  getMockSkills,
  installMockSkill,
  setMockSkillEnabled
} from '@jiaorong/skills/services'

const TEST_SKILL_ID = 'algorithmic-art'

describe('技能中心 Mock 数据', () => {
  afterEach(() => {
    installMockSkill(TEST_SKILL_ID)
    setMockSkillEnabled(TEST_SKILL_ID, true)
  })

  it('使用应用技能目录中的全部唯一技能名称构造列表数据', () => {
    expect(getMockSkills().map((skill) => skill.id)).toEqual([
      'algorithmic-art',
      'bid-tender-master',
      'bigplan',
      'code-review',
      'construction-plan-reviewer',
      'doc-coauthoring',
      'docx',
      'frontend-design',
      'git-commit',
      'infographic-syntax-creator',
      'deepchat-settings',
      'mcp-builder',
      'pdf',
      'pptx',
      'prd-generator',
      'session-duration',
      'skill-creator',
      'summarize',
      'web-artifacts-builder',
      'xlsx'
    ])
  })

  it('区分技能广场和用户自行安装技能', () => {
    expect(getMockSkill('algorithmic-art')).toMatchObject({
      source: 'market',
      tryPrompts: expect.arrayContaining([expect.any(String), expect.any(String)])
    })
    expect(getMockSkill('code-review')).toMatchObject({
      source: 'local',
      installed: true,
      tryPrompts: []
    })
  })

  it('支持安装、启停和卸载状态切换', () => {
    installMockSkill(TEST_SKILL_ID)
    expect(getMockSkill(TEST_SKILL_ID)).toMatchObject({ installed: true, enabled: true })

    setMockSkillEnabled(TEST_SKILL_ID, false)
    expect(getMockSkill(TEST_SKILL_ID)?.enabled).toBe(false)

    expect(applyMockSkillUninstalled(TEST_SKILL_ID)).toBe('market')
    expect(getMockSkill(TEST_SKILL_ID)?.installed).toBe(false)
  })
})
