import { describe, expect, it } from 'vitest'
import {
  deriveTechnicalSkillName,
  ensureSkillMarkdown,
  fallbackNameFromRemoteZipUrl,
  isGenericSkillParentDirName,
  needsSkillMarkdownNormalize,
  peekSkillDisplayName,
  stableAsciiSkillId,
  toFileUrlForTest
} from '../../../../src/jiaorong_src/skills/lib/installLocalSkill'

describe('installLocalSkill frontmatter compat', () => {
  it('detects **name:** pseudo frontmatter as needing normalize', () => {
    const raw = `# 房屋建筑与装饰工程工程量计算标准

**name:** 房屋建筑与装饰工程工程量计算标准
**description:** 基于 GB/T 50854-2024 提供计量规则查询。

---

## 适用范围
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(true)
    const out = ensureSkillMarkdown(raw, '24-bills-building-quantities')
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain('name: 24-bills-building-quantities')
    expect(out).toContain('description:')
    expect(out).toContain('displayName:')
    expect(out).not.toContain('**name:**')
  })

  it('derives fallback name from remote zip url', () => {
    expect(
      fallbackNameFromRemoteZipUrl(
        'https://huabei-2.zos.ctyun.cn/deepchat-service/24-bills-building-quantities-1.0.0.zip'
      )
    ).toBe('24-bills-building-quantities')
  })

  it('builds file URLs for posix and windows paths', () => {
    expect(toFileUrlForTest('/Users/me/skills 2/a.md')).toBe('file:///Users/me/skills%202/a.md')
    expect(toFileUrlForTest('C:\\Users\\me\\skill\\SKILL.md')).toBe(
      'file:///C:/Users/me/skill/SKILL.md'
    )
    expect(toFileUrlForTest('C:/Users/me/skill/SKILL.md')).toBe(
      'file:///C:/Users/me/skill/SKILL.md'
    )
  })

  it('ignores generic parent dir names when deriving tech name', () => {
    expect(isGenericSkillParentDirName('Downloads')).toBe(true)
    expect(isGenericSkillParentDirName('desktop')).toBe(true)
    expect(isGenericSkillParentDirName('24-bills-building-quantities')).toBe(false)
  })

  it('derives stable tech name from delayed Chinese YAML instead of Downloads', () => {
    const raw = `# 建设工程工程量清单计价标准111

---

name: 建设工程工程量清单计价标准123
description: |
  基于《建设工程工程量清单计价标准》（GB/T 50500-2024）的专业Skill。

---

## 适用范围
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(true)
    expect(peekSkillDisplayName(raw)).toBe('建设工程工程量清单计价标准123')

    // md 上传不传父目录 hint；即使误传 Downloads 也不应采用
    const tech = deriveTechnicalSkillName(raw, 'Downloads')
    expect(tech).toBe(stableAsciiSkillId('建设工程工程量清单计价标准123'))
    expect(tech).toMatch(/^skill-[a-z0-9]+$/)
    expect(tech).not.toBe('downloads')
    expect(deriveTechnicalSkillName(raw)).toBe(tech)

    const out = ensureSkillMarkdown(raw, tech)
    expect(out).toContain(`name: ${tech}`)
    expect(out).toContain('displayName: "建设工程工程量清单计价标准123"')
  })

  it('prefers valid path hint over display hash', () => {
    const raw = `# Demo

**name:** 中文技能
**description:** demo

---`
    expect(deriveTechnicalSkillName(raw, 'my-bill-skill')).toBe('my-bill-skill')
  })

  it('keeps legal english name and uses it as displayName fallback', () => {
    const raw = `---
name: my-cool-skill
description: A valid skill
license: MIT
---

body only
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(false)
    // 规范化路径下也不应把合法 name 的展示名落成 hash
    const out = ensureSkillMarkdown(raw, 'skill-deadbeef')
    expect(out).toContain('name: my-cool-skill')
    expect(out).toContain('displayName: my-cool-skill')
  })
})
