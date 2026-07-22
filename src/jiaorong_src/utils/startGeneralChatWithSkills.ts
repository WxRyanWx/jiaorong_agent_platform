import type { Router } from 'vue-router'
import { useAgentStore } from '@/stores/ui/agent'
import { useDraftStore } from '@/stores/ui/draft'
import { useSessionStore } from '@/stores/ui/session'

export interface StartGeneralChatWithSkillsOptions {
  router: Router
  prompt: string
  skillNames: string[]
}

/**
 * 携带指定技能和预填提示词进入一个新的通用对话。
 *
 * 该方法统一完成以下操作：
 * 1. 写入一次性对话启动参数，将提示词预填到输入框，并将指定技能设为待激活状态；
 * 2. 将当前智能体切换为通用对话智能体 `deepchat`；
 * 3. 关闭当前会话并创建新的对话草稿；
 * 4. 跳转到通用对话页面。
 *
 * 提示词只会预填，不会自动发送。用户发送消息时，待激活技能会通过现有的
 * `activeSkills` 会话创建流程提交。
 *
 * @param options.router Vue Router 实例，用于跳转到通用对话页面
 * @param options.prompt 需要预填到新对话输入框的提示词
 * @param options.skillNames 新对话需要自动激活的技能名称列表
 */
export async function startGeneralChatWithSkills({
  router,
  prompt,
  skillNames
}: StartGeneralChatWithSkillsOptions): Promise<void> {
  const draftStore = useDraftStore()
  const agentStore = useAgentStore()
  const sessionStore = useSessionStore()

  draftStore.setPendingStartDeeplink({
    msg: prompt,
    modelId: null,
    systemPrompt: '',
    mentions: [],
    skills: skillNames,
    autoSend: false
  })
  agentStore.setSelectedAgent('deepchat')
  await sessionStore.startNewConversation({ refresh: true })
  await router.push({ name: 'chat' })
}
