import { describe, expect, it } from 'vitest'
import {
  applyPreferredDisplayName,
  deriveTechnicalSkillName,
  ensureSkillMarkdown,
  fallbackNameFromRemoteZipUrl,
  isGenericSkillParentDirName,
  needsSkillMarkdownNormalize,
  peekSkillDisplayName,
  sanitizeSkillName,
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

  it('does not use skill.zip / skill.md as tech name so zip matches md upload', () => {
    const raw = `# 知识库Mcp tools工具文档

**Description:** 根据类型查询知识库列表，支持按名称模糊搜索。

## 1.查询知识库
`
    expect(sanitizeSkillName('知识库Mcp tools工具文档')).toBe('mcp-tools')
    expect(isGenericSkillParentDirName('skill')).toBe(true)
    expect(deriveTechnicalSkillName(raw)).toBe('mcp-tools')
    expect(deriveTechnicalSkillName(raw, 'skill')).toBe('mcp-tools')
    expect(ensureSkillMarkdown(raw, deriveTechnicalSkillName(raw, 'skill'))).toContain(
      'name: mcp-tools'
    )
  })

  it('unifies chinese folder and zip path hint when frontmatter name needs normalize', () => {
    const raw = `---
name: Agnes_duomotai
description: Agnes AI handbook
---

# Agnes
`
    const pathHint = 'Agnes 多模态能力手册'
    // 旧 zip 仅 sanitize 路径 → agnes；文件夹走 derive → agnes_duomotai，会装成两条
    expect(sanitizeSkillName(pathHint)).toBe('agnes')
    const fromFolder = deriveTechnicalSkillName(raw, pathHint)
    const fromZip = deriveTechnicalSkillName(raw, pathHint)
    expect(fromFolder).toBe(fromZip)
    expect(fromFolder).toBe('agnes_duomotai')
    expect(fromFolder).not.toBe(sanitizeSkillName(pathHint))
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

  it('injects market Chinese name as displayName without dropping license', () => {
    const raw = `---
name: test-case-design
description: 编写测试用例
license: MIT
---

## 执行流程
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(false)
    const out = applyPreferredDisplayName(raw, '软件测试用例设计', 'test-case-design')
    expect(out).toContain('name: test-case-design')
    expect(out).toContain('license: MIT')
    expect(out).toContain('displayName: "软件测试用例设计"')
    expect(peekSkillDisplayName(out)).toBe('软件测试用例设计')
  })

  it('preserves inline JSON metadata when injecting market displayName', () => {
    const raw = `---
name: super-frontend-design
description: Expert frontend design guidelines for creating beautiful, modern UIs.
metadata: {"clawdbot":{"emoji":"🎨"}}
---

# Frontend Design Skill
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(false)
    const out = applyPreferredDisplayName(raw, '超级前端设计', 'super-frontend-design')
    expect(out).toContain('name: super-frontend-design')
    expect(out).toContain('displayName: "超级前端设计"')
    expect(out).toContain('clawdbot:')
    expect(out).not.toMatch(/^metadata:\n  displayName:.*\n\{/m)
    // 不得把 JSON 拆成裸行，否则宿主解析不到 name
    expect(out).not.toMatch(/\n\{"clawdbot"/)
    expect(peekSkillDisplayName(out)).toBe('超级前端设计')
  })

  it('preserves multiline flow JSON metadata when injecting market displayName', () => {
    const raw = `---
name: tencent-esign-contract
description: "腾讯电子签合同AI助手，支持合同起草、审查、对比、法条法规检索。"
version: 1.0.0
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["python3"], "env": ["ESIGN_TOKEN"] },
        "emoji": "📄"
      }
  }
---

# 腾讯电子签
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(false)
    const out = applyPreferredDisplayName(raw, '腾讯电子签Skill', 'tencent-esign-contract')
    expect(out).toContain('name: tencent-esign-contract')
    expect(out).toContain('displayName: "腾讯电子签Skill"')
    expect(out).toContain('openclaw:')
    expect(out).not.toMatch(/\n[ \t]*\{\n/)
    expect(peekSkillDisplayName(out)).toBe('腾讯电子签Skill')
  })

  it('ensureSkillMarkdown prefers market displayName over package displayName', () => {
    const raw = `---
name: demo-skill
description: demo
metadata:
  displayName: 包内中文名
---

body
`
    const out = ensureSkillMarkdown(raw, 'demo-skill', '市场中文名')
    expect(out).toContain('displayName: "市场中文名"')
  })

  it('ensureSkillMarkdown keeps nested metadata.displayName when normalizing without preferred', () => {
    const raw = `---
name: demo-skill
metadata:
  displayName: 包内中文名
---

body
`
    expect(needsSkillMarkdownNormalize(raw)).toBe(true)
    const out = ensureSkillMarkdown(raw, 'demo-skill')
    expect(out).toContain('displayName: "包内中文名"')
  })

  it('still writes metadata.displayName when markdown heading equals market name', () => {
    const raw = `---
name: ai-bid-assistant
description: 面向政企投标和商务办公场景的标书制作全能助手。
---

# AI标书助手

## Overview
`
    const out = applyPreferredDisplayName(raw, 'AI标书助手', 'ai-bid-assistant')
    expect(out).toMatch(/metadata:\s*\n\s*displayName:\s*"AI标书助手"/)
    expect(out).toContain('name: ai-bid-assistant')
    expect(peekSkillDisplayName(out)).toBe('AI标书助手')
  })

  it('renames zip skill.md to SKILL.md so restart discovery can find it', async () => {
    const { zipSync, unzipSync, strToU8 } = await import('fflate')
    const { installSkillFromZipBytesCompat } =
      await import('../../../../src/jiaorong_src/skills/lib/installLocalSkill')

    const zipBytes = zipSync({
      'skill.md': strToU8(`# 知识库Mcp tools工具文档

**Description:** 根据类型查询知识库列表。
`)
    })

    let captured: Uint8Array | null = null
    const result = await installSkillFromZipBytesCompat({
      zipBytes,
      fallbackName: 'skill',
      writeTemp: async ({ content }) => {
        if (content instanceof Uint8Array) {
          captured = content
        } else if (Buffer.isBuffer(content)) {
          captured = new Uint8Array(content)
        } else if (content instanceof ArrayBuffer) {
          captured = new Uint8Array(content)
        } else {
          throw new Error('unexpected writeTemp content')
        }
        return '/tmp/skill.zip'
      },
      installFromZip: async () => ({ success: true, skillName: 'mcp-tools' }),
      installFromFolder: async () => ({ success: false, error: 'unused' })
    })

    expect(result.success).toBe(true)
    expect(captured).toBeTruthy()
    const keys = Object.keys(unzipSync(captured!))
    expect(keys).toContain('SKILL.md')
    expect(keys).not.toContain('skill.md')
  })

  it('keeps docs/scripts siblings when market displayName patches flat zip', async () => {
    const { zipSync, unzipSync, strToU8, strFromU8 } = await import('fflate')
    const { installSkillFromZipBytesCompat } =
      await import('../../../../src/jiaorong_src/skills/lib/installLocalSkill')

    const zipBytes = zipSync({
      'SKILL.md': strToU8(`---
name: algorithmic-art
description: Algorithmic art helper.
---

# 算法技术
`),
      'docs/guide.md': strToU8('# guide\n'),
      'scripts/run.sh': strToU8('#!/bin/sh\necho hi\n')
    })

    let captured: Uint8Array | null = null
    const result = await installSkillFromZipBytesCompat({
      zipBytes,
      fallbackName: 'algorithmic-art',
      preferredDisplayName: '算法技术',
      writeTemp: async ({ content }) => {
        if (content instanceof Uint8Array) {
          captured = content
        } else if (Buffer.isBuffer(content)) {
          captured = new Uint8Array(content)
        } else if (content instanceof ArrayBuffer) {
          captured = new Uint8Array(content)
        } else {
          throw new Error('unexpected writeTemp content')
        }
        return '/tmp/algorithmic-art.zip'
      },
      installFromZip: async () => ({ success: true, skillName: 'algorithmic-art' }),
      installFromFolder: async () => ({ success: false, error: 'unused' })
    })

    expect(result.success).toBe(true)
    expect(captured).toBeTruthy()
    const entries = unzipSync(captured!)
    const keys = Object.keys(entries)
    expect(keys).toContain('SKILL.md')
    expect(keys).toContain('docs/guide.md')
    expect(keys).toContain('scripts/run.sh')
    expect(keys.some((k) => k.endsWith('/SKILL.md') && k !== 'SKILL.md')).toBe(false)
    expect(strFromU8(entries['SKILL.md'])).toContain('displayName:')
    expect(peekSkillDisplayName(strFromU8(entries['SKILL.md']))).toBe('算法技术')
  })
})
