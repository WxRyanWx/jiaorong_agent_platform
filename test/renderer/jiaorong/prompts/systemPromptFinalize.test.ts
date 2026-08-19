import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT_LANGUAGE_TAIL } from '../../../../src/jiaorong_src/prompts/defaultSystemPrompt'
import { localizeHostSystemPromptSections } from '../../../../src/jiaorong_src/prompts/hostPromptLocalize'
import {
  buildJiaorongPinnedSkillsPrompt,
  buildJiaorongSkillsMetadataPrompt,
  finalizeJiaorongSystemPrompt
} from '../../../../src/jiaorong_src/prompts/systemPromptFinalize'

describe('jiaorong system prompt language finalize', () => {
  it('localizes Runtime / Permission / Verification without host changes', () => {
    const raw = [
      '## Base',
      'hello',
      '',
      '## Runtime Capabilities',
      '- Use exec(background: true) to explicitly detach long-running terminal commands; foreground exec may also return a running session after its yield window.',
      '',
      '## Permission Rules',
      'Do not assume approval for file writes or commands when the session asks for it.',
      '',
      '## Verification Policy',
      'If verification was not run, state the reason explicitly in the final response.'
    ].join('\n')

    const localized = localizeHostSystemPromptSections(raw)
    expect(localized).toContain('## 运行时能力')
    expect(localized).toContain('## 权限规则')
    expect(localized).toContain('## 验证策略')
    expect(localized).toContain('不要擅自假设已获准写文件')
    expect(localized).not.toContain('## Runtime Capabilities')
    expect(localized).not.toContain('## Permission Rules')
  })

  it('localizes the short YoBrowser runtime bullet and orchestration policy', () => {
    const raw = [
      '## Runtime Capabilities',
      '- YoBrowser tools are available for browser automation when needed.',
      '',
      '## Multi-Agent Orchestration Policy',
      'The session uses explicit multi-Agent collaboration. This revokes any earlier instruction to delegate proactively.',
      'Use `subagent` for bounded child tasks. Use `spawn` to start work, `send` for non-triggering context, and `follow_up` only to start another child turn.'
    ].join('\n')

    const localized = localizeHostSystemPromptSections(raw)
    expect(localized).toContain('## 运行时能力')
    expect(localized).toContain('- 需要浏览器自动化时使用 YoBrowser。')
    expect(localized).not.toContain('YoBrowser tools are available')
    expect(localized).toContain('## 多 Agent 编排策略')
    expect(localized).toContain('本会话使用显式多 Agent 协作')
    expect(localized).toContain('用 `subagent` 做有界子任务')
    expect(localized).not.toContain('## Multi-Agent Orchestration Policy')
  })

  it('appends language tail after host sections and keeps it last', () => {
    const withHost = [
      '## Base',
      'hello',
      '',
      '## Tape Handoff State',
      '{}',
      '',
      '## Runtime Capabilities',
      '- Use process(list|poll|log|write|kill|remove) to manage background terminal sessions.'
    ].join('\n')
    const out = finalizeJiaorongSystemPrompt(withHost)
    expect(out).toContain('## 运行时能力')
    expect(out).toContain('## 会话交接状态')
    expect(out.indexOf('运行时能力')).toBeLessThan(out.indexOf('语言强制约束'))
    expect(out.trim().endsWith(SYSTEM_PROMPT_LANGUAGE_TAIL.trim())).toBe(true)
    expect(out).toContain('用户**亲手输入的当前问题文本**')
    expect(out).toContain('没有分隔时，整段用户输入都是判定源')
    expect(out).toContain('Conversation Checkpoint')
  })

  it('is idempotent when called twice', () => {
    const once = finalizeJiaorongSystemPrompt('## Base\nhello')
    const twice = finalizeJiaorongSystemPrompt(once)
    expect(twice).toBe(once)
    expect(twice.split('语言强制约束').length - 1).toBe(1)
  })

  it('builds chinese skills metadata prompt', () => {
    const prompt = buildJiaorongSkillsMetadataPrompt(
      [{ name: 'demo', description: 'English desc' }],
      {
        canListSkills: true,
        canViewSkills: true,
        canManageDraftSkills: false,
        canRunSkillScripts: false
      },
      false
    )
    expect(prompt).toContain('## 技能（Skills）')
    expect(prompt).toContain('skill_view')
    expect(prompt).not.toContain('Before replying')
  })

  it('builds chinese pinned skills header with language disclaimer', () => {
    const prompt = buildJiaorongPinnedSkillsPrompt(['### demo\nbody'])
    expect(prompt).toContain('## 已固定技能')
    expect(prompt).toContain('亲手输入')
    expect(prompt).toContain('不是**用户语言')
  })

  it('does not break ## headings inside pinned skill bodies', () => {
    const raw = [
      '## Runtime Capabilities',
      '- Use process(list|poll|log|write|kill|remove) to manage background terminal sessions.',
      '',
      '## 已固定技能',
      '### demo',
      '## Installation',
      'Run npm install',
      '## Usage',
      'Hello'
    ].join('\n')

    const localized = localizeHostSystemPromptSections(raw)
    expect(localized).toContain('## 运行时能力')
    expect(localized).toContain('用 process(list|poll|log|write|kill|remove) 管理后台终端会话')
    expect(localized).toContain('## Installation')
    expect(localized).toContain('## Usage')
    expect(localized).toContain('Run npm install')
  })

  it('localizes a trailing host section with no following heading', () => {
    const raw = [
      '## Permission Rules',
      'Do not assume approval for file writes or commands when the session asks for it.'
    ].join('\n')
    const localized = localizeHostSystemPromptSections(raw)
    expect(localized).toBe('## 权限规则\n会话要求确认时，不要擅自假设已获准写文件或执行命令。')
  })
})
