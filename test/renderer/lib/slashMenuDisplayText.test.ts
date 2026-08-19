import { describe, expect, it } from 'vitest'
import type { SkillMetadata } from '@shared/types/skill'
import {
  buildDisplayLabelOptions,
  getDisplayLabel,
  getSkillDisplayLabel,
  localizeThinkingContent,
  mergeToolDisplaySources,
  resolveSkillDisplay,
  resolveToolDisplay
} from '@/lib/slashMenuDisplayText'

const sampleSkill: SkillMetadata = {
  name: 'jiaorong-settings',
  description: '交融AI应用程序设置修改技能',
  path: '/tmp/jiaorong-settings/SKILL.md',
  skillRoot: '/tmp/jiaorong-settings',
  metadata: {
    displayName: '设置'
  }
}

describe('slashMenuDisplayText', () => {
  it('reads skill labels from SKILL.md metadata', () => {
    expect(resolveSkillDisplay(sampleSkill)).toEqual({
      label: '设置',
      description: '交融AI应用程序设置修改技能'
    })
    expect(getSkillDisplayLabel('jiaorong-settings', sampleSkill.metadata)).toBe('设置')
  })

  it('reads MCP and agent tool labels from tool definitions', () => {
    expect(
      resolveToolDisplay({
        name: 'reminders',
        displayName: '提醒',
        description: '在 Apple 提醒中搜索、创建和打开提醒'
      }).label
    ).toBe('提醒')

    expect(
      getDisplayLabel('jiaorong_settings_set_theme', {
        tools: [{ name: 'jiaorong_settings_set_theme', displayName: '设置主题' }]
      })
    ).toBe('设置主题')
  })

  it('falls back to the static Chinese tool name table', () => {
    expect(
      resolveToolDisplay({
        name: 'knowledge_base_retrieve',
        description: '根据用户选中的知识库检索相关内容'
      }).label
    ).toBe('知识库检索')

    expect(
      resolveToolDisplay({
        name: 'jiaorong-knowledge-base_knowledge_base_retrieve'
      }).label
    ).toBe('知识库检索')

    expect(
      resolveToolDisplay({
        name: 'calendar',
        displayName: '日历'
      }).label
    ).toBe('日历')

    expect(getDisplayLabel('knowledge_base_retrieve')).toBe('知识库检索')
  })

  it('prefers runtime displayName over the static table', () => {
    expect(
      resolveToolDisplay({
        name: 'knowledge_base_retrieve',
        displayName: '自定义检索'
      }).label
    ).toBe('自定义检索')
  })

  it('ignores a runtime displayName that just repeats the function id', () => {
    expect(
      resolveToolDisplay({
        name: 'knowledge_base_retrieve',
        displayName: 'knowledge_base_retrieve'
      }).label
    ).toBe('知识库检索')
  })

  it('merges MCP and agent tool labels with MCP precedence', () => {
    const merged = mergeToolDisplaySources(
      [{ name: 'reminders', displayName: '提醒' }],
      [
        { name: 'reminders', displayName: '旧提醒' },
        { name: 'skill_view', displayName: '查看技能' }
      ]
    )

    expect(merged).toEqual([
      { name: 'reminders', displayName: '提醒' },
      { name: 'skill_view', displayName: '查看技能' }
    ])

    const options = buildDisplayLabelOptions(
      [],
      [{ function: { name: 'reminders', displayName: '提醒', description: '' } }],
      [{ name: 'jiaorong_settings_set_theme', displayName: '设置主题' }]
    )
    expect(getDisplayLabel('jiaorong_settings_set_theme', options)).toBe('设置主题')
  })

  it('localizes legacy skill and tool identifiers in thinking prose', () => {
    const input =
      'Let me view the deepchat-settings skill and call deepchat_settings_set_theme with light.'
    const output = localizeThinkingContent(
      input,
      [sampleSkill],
      [{ name: 'jiaorong_settings_set_theme', displayName: '设置主题' }]
    )

    expect(output).toContain('设置')
    expect(output).toContain('设置主题')
    expect(output).not.toContain('deepchat-settings')
    expect(output).not.toContain('deepchat_settings_set_theme')
  })

  it('resolves legacy tool labels from canonical tool metadata', () => {
    expect(
      getDisplayLabel('deepchat_settings_set_theme', {
        tools: [{ name: 'jiaorong_settings_set_theme', displayName: '设置主题' }]
      })
    ).toBe('设置主题')
  })

  it('localizes jiaorong skill and tool identifiers in thinking prose', () => {
    const input =
      'Let me view the jiaorong-settings skill and call jiaorong_settings_set_theme with light.'
    const output = localizeThinkingContent(
      input,
      [sampleSkill],
      [{ name: 'jiaorong_settings_set_theme', displayName: '设置主题' }]
    )

    expect(output).toContain('设置')
    expect(output).toContain('设置主题')
    expect(output).not.toContain('jiaorong-settings')
    expect(output).not.toContain('jiaorong_settings_set_theme')
  })

  it('skips fenced code blocks in thinking content', () => {
    const input = 'Use `jiaorong-settings` then:\n```ts\nconst x = "jiaorong-settings"\n```\nDone.'
    const output = localizeThinkingContent(input, [sampleSkill])

    expect(output).toContain('`设置`')
    expect(output).toContain('const x = "jiaorong-settings"')
  })
})
