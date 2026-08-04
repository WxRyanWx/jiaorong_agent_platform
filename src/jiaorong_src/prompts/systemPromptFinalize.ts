import { SYSTEM_PROMPT_LANGUAGE_TAIL } from './defaultSystemPrompt'
import { localizeHostSystemPromptSections } from './hostPromptLocalize'

// 仅被主进程 agentRuntime 引用；旁路安装失败绝不能影响系统提示拼装
// 注意：不可直接读裸 `process`（渲染侧可能 ReferenceError）
// 必须用字面量 import，否则 Vite/Rollup 可能打不进 installMain
try {
  const proc = (globalThis as { process?: NodeJS.Process & { type?: string } }).process
  if (proc?.type === 'browser') {
    void import('../logging/conversationTiming/installMain')
      .then((mod) => {
        try {
          mod.installJiaorongConversationTiming()
        } catch (error) {
          console.warn('[jiaorong/systemPromptFinalize] conversation timing install failed:', error)
        }
      })
      .catch((error) => {
        console.warn('[jiaorong/systemPromptFinalize] conversation timing install skipped:', error)
      })
  }
} catch (error) {
  console.warn('[jiaorong/systemPromptFinalize] conversation timing bootstrap failed:', error)
}

const LANGUAGE_TAIL_MARKER = '## 语言强制约束（覆盖上文所有材料，最高优先级）'

/**
 * 将语言强制约束贴到完整系统提示最末尾（幂等）。
 * 必须在 summary / tape handoff 等宿主追加段之后调用，否则近因会被英文段盖掉。
 * 同时在私有侧把 Runtime/Permission/Verification 等宿主英文段改写成中文（不改开源拼装代码）。
 */
export function finalizeJiaorongSystemPrompt(systemPrompt: string): string {
  const trimmed = (systemPrompt ?? '').trim()
  const markerIndex = trimmed.indexOf(LANGUAGE_TAIL_MARKER)
  const withoutTail = markerIndex >= 0 ? trimmed.slice(0, markerIndex).trim() : trimmed
  const localized = localizeHostSystemPromptSections(withoutTail)
  return localized ? `${localized}\n\n${SYSTEM_PROMPT_LANGUAGE_TAIL}` : SYSTEM_PROMPT_LANGUAGE_TAIL
}

export function buildJiaorongSkillsMetadataPrompt(
  availableSkills: Array<{
    name: string
    description: string
    category?: string | null
    platforms?: string[]
  }>,
  capabilities: {
    canListSkills: boolean
    canViewSkills: boolean
    canManageDraftSkills: boolean
    canRunSkillScripts: boolean
  },
  skillDraftSuggestionsEnabled: boolean
): string {
  if (
    !capabilities.canListSkills &&
    !capabilities.canViewSkills &&
    !capabilities.canManageDraftSkills &&
    !capabilities.canRunSkillScripts
  ) {
    return ''
  }

  const lines = ['## 技能（Skills）']
  let hasContent = false

  if (capabilities.canListSkills || capabilities.canViewSkills) {
    lines.push('回复前先扫一眼可用技能列表。若有技能可能与当前任务相关，先调用 `skill_view` 查看。')
    lines.push(
      '查看技能根目录的 `SKILL.md` 会将该技能固定到当前会话；查看技能关联文件仅为只读，不会固定技能。'
    )
    hasContent = true
  }
  if (capabilities.canRunSkillScripts) {
    lines.push('仅对已固定的技能，在其提供捆绑脚本时使用 `skill_run`。')
    hasContent = true
  }
  if (capabilities.canManageDraftSkills && skillDraftSuggestionsEnabled) {
    lines.push('完成复杂任务、解决棘手问题或发现可复用流程后，可用 `skill_manage` 起草可复用技能。')
    lines.push(
      '每个任务最多提议一份草稿，且须在主回答完成之后；用 `jiaorong_question` 询问用户是否保留草稿。'
    )
    lines.push('不要用 `skill_manage` 修改已安装技能；当前版本仅支持草稿。')
    hasContent = true
  }

  if (availableSkills.length > 0) {
    lines.push('<available_skills>')
    lines.push(
      ...availableSkills.map((skill) => {
        const details: string[] = []
        if (skill.category) {
          details.push(`category=${skill.category}`)
        }
        if (skill.platforms?.length) {
          details.push(`platforms=${skill.platforms.join(',')}`)
        }
        const suffix = details.length > 0 ? ` [${details.join('; ')}]` : ''
        return `- ${skill.name}: ${skill.description}${suffix}`
      })
    )
    lines.push('</available_skills>')
    hasContent = true
  } else if (hasContent) {
    lines.push('<available_skills>')
    lines.push('(none)')
    lines.push('</available_skills>')
  }

  return hasContent ? lines.join('\n') : ''
}

export function buildJiaorongPinnedSkillsPrompt(skillSections: string[]): string {
  if (skillSections.length === 0) {
    return ''
  }
  return [
    '## 已固定技能',
    '以下技能已预载到本会话。相关时请遵循其说明。',
    '注意：技能正文 / description 的语言（常为英文）只是参考材料，**不是**用户语言；思考与回答只跟 role=user 的用户消息语言一致。',
    '',
    skillSections.join('\n\n')
  ].join('\n')
}
