import { describe, expect, it } from 'vitest'
import {
  ensureSkillMarkdown,
  fallbackNameFromRemoteZipUrl,
  needsSkillMarkdownNormalize
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
})
