import { describe, expect, it } from 'vitest'
import { resolveSkillTryPrompts } from '../../../../src/jiaorong_src/skills/lib/resolveSkillTryPrompts'

const yamlWithPrompts = `---
name: contract-review
description: 合同审阅
metadata:
  displayName: 合同审阅助手
  tryPrompts:
    - YAML 问题一
    - YAML 问题二
    - YAML 问题三
---

# 正文
`

const yamlWithAlias = `---
name: contract-review
description: 合同审阅
metadata:
  exampleTemplateList:
    - 别名问题一
    - 别名问题二
---

# 正文
`

describe('resolveSkillTryPrompts', () => {
  it('prefers YAML tryPrompts over remote prompts', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: yamlWithPrompts,
        remoteTryPrompts: ['远程问题一', '远程问题二']
      })
    ).toEqual(['YAML 问题一', 'YAML 问题二', 'YAML 问题三'])
  })

  it('falls back to remote when YAML has no try prompts', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: `---
name: contract-review
description: 合同审阅
metadata:
  displayName: 合同审阅助手
---

# 正文
`,
        remoteTryPrompts: ['远程问题一']
      })
    ).toEqual(['远程问题一'])
  })

  it('falls back to remote when YAML tryPrompts is empty', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: `---
name: contract-review
description: 合同审阅
metadata:
  tryPrompts: []
---

# 正文
`,
        remoteTryPrompts: ['远程问题一']
      })
    ).toEqual(['远程问题一'])
  })

  it('reads exampleTemplateList alias from YAML', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: yamlWithAlias,
        remoteTryPrompts: ['远程问题一']
      })
    ).toEqual(['别名问题一', '别名问题二'])
  })

  it('reads tryPrompts from skill metadata when markdown is empty', () => {
    expect(
      resolveSkillTryPrompts({
        skillMetadata: {
          tryPrompts: ['元数据问题一', '元数据问题二']
        },
        remoteTryPrompts: ['远程问题一']
      })
    ).toEqual(['元数据问题一', '元数据问题二'])
  })

  it('returns empty when yaml and remote both missing', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: `---
name: contract-review
description: 合同审阅
---
`,
        remoteTryPrompts: []
      })
    ).toEqual([])
  })

  it('drops blank try prompt items', () => {
    expect(
      resolveSkillTryPrompts({
        skillMarkdown: `---
name: contract-review
description: 合同审阅
metadata:
  tryPrompts:
    - 有效问题
    - "  "
    - 另一条
---
`
      })
    ).toEqual(['有效问题', '另一条'])
  })
})
