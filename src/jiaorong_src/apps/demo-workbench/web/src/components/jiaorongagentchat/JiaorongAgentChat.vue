<!--
  交融 Agent 对话壳：顶栏、消息列表、输入区、知识库选择与流式事件转发。
  给 demo-workbench 页面或宿主嵌入使用，状态由 useJiaorongAgentRuntime 驱动。
-->
<script setup lang="ts">
import { computed, onDeactivated, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { TOP_HISTORY_PREFETCH_PX } from './lib/windowPolicy'
import { registerJiaorongAgentIcons } from './lib/icons'
import { resolveAgentChatFeatures, type JiaorongAgentChatFeatures } from './lib/features'
import { readQuestion } from './lib/questions'
import { useJiaorongAgentRuntime } from './composables/useJiaorongAgentRuntime'
import { useChatAutoScroll } from './composables/useChatAutoScroll'
import ChatInputBox from './components/ChatInputBox.vue'
import ChatInteractionDock from './components/ChatInteractionDock.vue'
import ChatPendingQueue from './components/ChatPendingQueue.vue'
import ChatStatusBar from './components/ChatStatusBar.vue'
import ChatTopBar from './components/ChatTopBar.vue'
import MessageItemAssistant from './components/MessageItemAssistant.vue'
import MessageItemUser from './components/MessageItemUser.vue'
import KnowledgeBasePicker from './chat-kit/components/KnowledgeBasePicker.vue'
import { buildKnowledgeBaseContextFile } from './chat-kit/lib/kbContext'
import type { JiaorongKbSelection, JiaorongSlashItem } from './chat-kit/types'
import { type PendingAttachment } from './lib/messageFiles'
import { normalizeSlashCommands, type JiaorongSlashCommand } from './lib/slashCommands'
import { findPendingQuestion, findPendingToolPermission } from 'jiaorong-app-sdk'
import { isUserCanceledError, localizeErrorText } from 'jiaorong-app-sdk'
import type {
  AgentPlanItem,
  AssistantMessageBlock,
  CatalogModel,
  ChatStreamCompletedEvent,
  ChatStreamFailedEvent,
  ChatStreamUpdatedEvent,
  ChatPlanUpdatedEvent,
  HostContext,
  PermissionMode,
  SessionMessagesChangedEvent
} from 'jiaorong-app-sdk'
import type { JiaorongClient } from 'jiaorong-app-sdk'
import type { JiaorongToolbarAction } from './lib/toolbar'

registerJiaorongAgentIcons()

const props = withDefaults(
  defineProps<{
    /** 应用 id，connect / 斜杠技能名前缀。 */
    appId?: string
    /** 智能体 id，列会话与发消息。 */
    agentId?: string
    /** 助手气泡署名。 */
    agentName?: string
    /** 用户气泡署名。 */
    userName?: string
    /** 输入框占位文案。 */
    placeholder?: string
    /** 有值则走 HTTP runtime，否则走宿主桥。 */
    httpBase?: string
    /** 外部注入的客户端；不传则组件自己 connect。 */
    client?: JiaorongClient | null
    /** 旧版附件开关，会覆盖 features.attachments。 */
    attachments?: boolean
    /** 旧版工具栏动作，会覆盖 features.toolbar。 */
    toolbar?: JiaorongToolbarAction[]
    /** 功能开关集合；未写的项默认全开。 */
    features?: JiaorongAgentChatFeatures
    /** 斜杠菜单原始配置。 */
    slashItems?: JiaorongSlashCommand[]
  }>(),
  {
    appId: '',
    agentId: '',
    agentName: '交融对话',
    userName: 'You',
    // Vue 布尔 prop 未写属性时是 false，会盖掉 features 默认开附件
    attachments: true,
    slashItems: () => []
  }
)

const emit = defineEmits<{
  /** 流式块更新，给宿主同步预览。 */
  'stream-updated': [payload: ChatStreamUpdatedEvent]
  /** 本轮生成结束。 */
  'stream-completed': [payload: ChatStreamCompletedEvent]
  /** 本轮生成失败。 */
  'stream-failed': [payload: ChatStreamFailedEvent]
  /** 计划面板内容变化。 */
  'plan-updated': [payload: ChatPlanUpdatedEvent]
  /** 会话消息列表被宿主改写。 */
  'messages-changed': [payload: SessionMessagesChangedEvent]
  /** 宿主上下文（token / apiBaseUrl 等）。 */
  context: [payload: HostContext]
  /** 出现待回答追问，给页面自定义面板。 */
  question: [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
      options: Array<{ label: string; description?: string }>
    }
  ]
  /** 用户已选选项或提交自定义答案。 */
  'question-answered': [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock | undefined
      kind: 'option' | 'custom'
      value: string
    }
  ]
  /** 出现待审批的工具调用。 */
  approval: [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
    }
  ]
  /** 用户已批准或拒绝工具。 */
  'approval-answered': [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
      granted: boolean
    }
  ]
  /** 点击发送或入队；queued 为 true 表示只进队列没立刻发给宿主。 */
  send: [payload: { sessionId: string | null; text: string; queued?: boolean }]
  /** 客户端已连上且首次 ready。 */
  'runtime-ready': []
}>()

/** 当前会话 id，可 v-model:session-id。 */
const sessionId = defineModel<string | null>('sessionId', { default: null })
/** 合并 features 与旧版 attachments / toolbar 后的确定开关。 */
const flags = computed(() =>
  resolveAgentChatFeatures(props.features, {
    attachments: props.attachments,
    toolbar: props.toolbar
  })
)
/** 消息列表滚动容器，自动贴底和上翻预取都看它。 */
const viewport = useTemplateRef<HTMLElement>('viewport')
/** 用户关掉计划条后记下当时 JSON，相同内容不再浮出。 */
const dismissedPlanKey = shallowRef('')
/** 知识库选择弹层是否打开。 */
const kbOpen = shallowRef(false)
/** 输入区当前选中的知识库 / 文件夹 / 文件。 */
const kbSelections = ref<JiaorongKbSelection[]>([])
/** 输入区当前选中的斜杠技能芯片。 */
const activeSkills = ref<JiaorongSlashItem[]>([])
/** 生成中排队的下一轮：正文、附件、技能、知识库一起存。 */
const queuedTurns = ref<
  Array<{
    id: string
    text: string
    files: PendingAttachment[]
    skills: JiaorongSlashItem[]
    kb: JiaorongKbSelection[]
  }>
>([])
/** 防止 flushQueue 重入，避免同一条排队消息发两次。 */
let flushingQueue = false

/** 连接、会话、发消息、高级设置都走这个运行时。 */
const runtime = useJiaorongAgentRuntime({
  appId: () => props.appId,
  agentId: () => props.agentId,
  sessionId,
  httpBase: () => props.httpBase,
  client: () => props.client,
  onSessionId: (next) => {
    sessionId.value = next
  },
  onEvent: (event, payload) => {
    if (event === 'chat.stream.updated') {
      emit('stream-updated', payload as ChatStreamUpdatedEvent)
    }
    if (event === 'chat.stream.completed') {
      emit('stream-completed', payload as ChatStreamCompletedEvent)
    }
    if (event === 'chat.stream.failed') {
      emit('stream-failed', payload as ChatStreamFailedEvent)
    }
    if (event === 'chat.plan.updated') {
      emit('plan-updated', payload as ChatPlanUpdatedEvent)
    }
    if (event === 'sessions.messages.changed') {
      emit('messages-changed', payload as SessionMessagesChangedEvent)
    }
    if (event === 'context') emit('context', payload as HostContext)
  }
})

/** 输入框草稿，和 ChatInputBox v-model 绑定。 */
const draft = runtime.draft
/** 待发送附件列表，和输入框 chips 绑定。 */
const files = runtime.files

/** 客户端已连上，输入区可点。 */
const ready = computed(() => runtime.ready.value)
watch(ready, (value) => {
  if (value) emit('runtime-ready') // 只在连上时通知，断开不发
})
onDeactivated(() => {
  kbOpen.value = false
})
/** 本轮正在交给宿主发送（create / send / steer 飞行中）。 */
const sending = computed(() => runtime.sending.value)
/** 助手仍在流式输出。 */
const generating = computed(() => runtime.generating.value)
/** 用户主动停止不展示错误条；其它错误走本地化文案。 */
const errorText = computed(() => {
  const raw = runtime.errorText.value
  if (!raw || isUserCanceledError(raw)) return ''
  return localizeErrorText(raw)
})
/** 正在向上预取更早消息。 */
const loadingHistory = computed(() => runtime.loadingHistory.value)
/** 当前流式助手消息 id；还没回来时为空。 */
const liveMessageId = computed(() => runtime.liveMessageId.value)
/** 展示用消息列表：历史 + 正在流的助手气泡。 */
const transcript = computed(() => runtime.transcript.value)
/** 当前会话详情，顶栏标题和状态栏默认值都从这里读。 */
const currentSession = computed(() => runtime.currentSession.value)
/** 模型目录，状态栏下拉用。 */
const models = computed(() => runtime.models.value as CatalogModel[])
/** 气泡工具栏动作，受 features.toolbar 控制。 */
const toolbarActions = computed(() => flags.value.toolbar)
/** 最后一条助手消息 id，流式 id 尚未回来时用来标「正在生成」。 */
const lastAssistantId = computed(() => {
  const last = [...transcript.value].reverse().find((item) => item.role === 'assistant')
  return last?.id ?? null
})
/** 正在流的那条助手消息的块列表，用来找追问 / 审批。 */
const liveAssistantBlocks = computed(() => {
  const live = transcript.value.find((item) => item.id === liveMessageId.value)
  return live?.blocks ?? []
})
/** 当前流里待回答的追问块；没有则为 null。 */
const liveQuestion = computed(() => findPendingQuestion(liveAssistantBlocks.value) ?? null)
/** 当前流里待批准的工具调用块；没有则为 null。 */
const liveApproval = computed(() => findPendingToolPermission(liveAssistantBlocks.value) ?? null)
/** 开了 approvals 才把审批块交给浮层。 */
const pendingApproval = computed(() => (flags.value.approvals ? liveApproval.value : null))
/** 开了 questions 才把追问块交给浮层。 */
const pendingQuestion = computed(() => (flags.value.questions ? liveQuestion.value : null))
/** 计划浮层条目；关了开关或用户刚关掉同一份内容时返回空。 */
const planItems = computed(() => {
  if (!flags.value.plan) return [] as AgentPlanItem[] // 关了 plan 开关：浮层不出现
  const items = runtime.planItems.value
  const key = JSON.stringify(items)
  // 用户刚关掉且内容没变：继续隐藏
  if (dismissedPlanKey.value === key) return [] as AgentPlanItem[]
  return items
})
/** 顶栏标题：没有会话名就显示「新会话」。 */
const sessionTitle = computed(() => currentSession.value?.title?.trim() || '新会话')
/** 状态栏当前厂商：优先新会话未落库的选择。 */
const selectedProviderId = computed(
  () => runtime.pendingModel.value?.providerId || currentSession.value?.providerId || ''
)
/** 状态栏当前模型 id：优先新会话未落库的选择。 */
const selectedModelId = computed(
  () => runtime.pendingModel.value?.modelId || currentSession.value?.modelId || ''
)
/** 状态栏权限模式；新会话默认 full_access。 */
const selectedPermission = computed<PermissionMode>(
  () => runtime.pendingPermissionMode.value || currentSession.value?.permissionMode || 'full_access'
)
/** 状态栏编排策略：pending > 会话字段 > 默认 explicit。 */
const selectedOrchestration = computed<'explicit' | 'proactive'>(() => {
  if (runtime.pendingOrchestration.value) return runtime.pendingOrchestration.value // 新会话尚未落库
  const raw = currentSession.value?.orchestrationPolicy
  if (raw === 'proactive') return 'proactive' // 旧数据可能是裸字符串
  if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'proactive') {
    return 'proactive'
  }
  return 'explicit'
})
/** 高级设置里当前系统提示项：空内容是 empty，对不上目录是 __custom__。 */
const selectedSystemPromptId = computed(() => {
  const content = runtime.generationSettings.value?.systemPrompt ?? ''
  if (!content.trim()) return 'empty' // 空系统提示对应面板「无」项
  const matched = runtime.systemPrompts.value.find((item) => item.content === content)
  return matched?.id ?? '__custom__'
})
/** 工具模式覆盖；没有覆盖时按 agent。 */
const selectedToolMode = computed(() => runtime.toolModeOverride.value ?? 'agent')
/** 有追问或审批时藏输入框，避免和浮层抢焦点。 */
const hideComposer = computed(() => Boolean(pendingQuestion.value || pendingApproval.value))
/** 知识库弹层鉴权；关了开关或宿主没下发 token 则为 null。 */
const kbAuth = computed(() => {
  if (!flags.value.knowledgeBase) return null // 关了知识库：选择器不请求
  const ctx = runtime.hostContext.value
  const token = ctx?.token?.trim()
  const apiBaseUrl = ctx?.apiBaseUrl?.trim()
  if (!token || !apiBaseUrl) return null // 宿主还没下发鉴权，弹层无法列库
  return { token, apiBaseUrl, productId: ctx?.productId }
})
/** 队列条只展示 id 和正文预览，不把附件再渲染一遍。 */
const queuedPreview = computed(() =>
  queuedTurns.value.map((item) => ({ id: item.id, text: item.text }))
)
/** 规范化后的斜杠菜单；关了 slash 开关则空数组。 */
const slashItems = computed(() =>
  flags.value.slash ? normalizeSlashCommands(props.slashItems, props.appId) : []
)
/** 内容指纹：条数 / 流式长度 / 生成状态变化时通知自动滚动。 */
const followKey = computed(() => {
  const last = transcript.value[transcript.value.length - 1]
  const content =
    last?.role === 'assistant'
      ? last.blocks.map((block) => block.content || '').join('')
      : last?.text || ''
  return `${sessionId.value}:${transcript.value.length}:${liveMessageId.value}:${content.length}:${generating.value}`
})
/** 贴底跟随：用户上翻后暂停，再发消息时重新钉住。 */
const autoScroll = useChatAutoScroll({
  enabled: () => flags.value.autoScroll,
  viewport,
  followKey
})

/** 发送成功或换会话时清掉输入区的知识库、技能和附件。 */
function clearComposerSelections() {
  kbSelections.value = []
  activeSkills.value = []
  runtime.files.value = []
}

watch(sessionId, (next, previous) => {
  autoScroll.pinToLatest()
  const createdDuringSend = !previous && Boolean(next) && (sending.value || generating.value)
  // 发送中刚创建会话：保留输入区选择与队列，不要清空正在用的草稿附件
  if (createdDuringSend) return
  queuedTurns.value = []
  clearComposerSelections()
})

watch(
  () => liveQuestion.value?.tool_call?.id,
  (id) => {
    const block = liveQuestion.value
    // 追问消失或块不完整：不重复对外抛 question
    if (!id || !block) return
    emit('question', {
      sessionId: sessionId.value,
      messageId: liveMessageId.value,
      block,
      options: readQuestion(block).options
    })
  }
)

watch(
  () => liveApproval.value?.tool_call?.id,
  (id) => {
    const block = liveApproval.value
    if (!id || !block) return
    emit('approval', {
      sessionId: sessionId.value,
      messageId: liveMessageId.value,
      block
    })
  }
)

/**
 * 消息列表滚动：先交给自动贴底判断用户是否上翻，靠近顶部再预取更早消息。
 * @param event 滚动事件，target 必须是视口元素
 */
async function onMessageScroll(event: Event) {
  autoScroll.onUserScroll()
  const el = event.target
  if (!(el instanceof HTMLElement)) return // 非元素 target（理论上不会），避免读 scrollTop 报错
  // 还没滚到顶部阈值：不预取，避免每次滚动打会话接口
  if (el.scrollTop > TOP_HISTORY_PREFETCH_PX) return
  await runtime.loadOlderMessages()
}

/**
 * 把当前知识库选择收成一条上下文附件；没选库则不附带。
 * @returns 0 或 1 个 MessageFile
 */
function extraSendFiles() {
  if (!flags.value.knowledgeBase || !kbSelections.value.length) return [] // 没选库：不要附带空上下文文件
  const file = buildKnowledgeBaseContextFile(runtime.draft.value, kbSelections.value)
  return file ? [file] : []
}

/** 当前技能芯片对应的宿主技能名，发给 session.send 的 activeSkills。 */
function skillNames() {
  return activeSkills.value
    .map((item) => item.skillName)
    .filter((name): name is string => Boolean(name))
}

/**
 * 从输入区去掉一条知识库芯片。
 * @param key 芯片稳定键
 */
function removeKb(key: string) {
  kbSelections.value = kbSelections.value.filter((item) => item.key !== key)
}

/**
 * 知识库弹层点确定：写入选择并关弹层。
 * @param items 弹层确认后的完整选择
 */
function onConfirmKb(items: JiaorongKbSelection[]) {
  kbSelections.value = items
  kbOpen.value = false
}

/**
 * 从队列里删掉一条，不发送。
 * @param id 排队项 id
 */
function removeQueued(id: string) {
  queuedTurns.value = queuedTurns.value.filter((item) => item.id !== id)
}

/** 把当前草稿推进队列，并清空输入区。空草稿不入队。 */
function enqueueDraft() {
  const text = runtime.draft.value.trim()
  if (!text && !runtime.files.value.length && !kbSelections.value.length) return // 空草稿不占队列槽
  queuedTurns.value = [
    ...queuedTurns.value,
    {
      id: `queue-${Date.now()}-${queuedTurns.value.length}`,
      text,
      files: [...runtime.files.value],
      skills: [...activeSkills.value],
      kb: [...kbSelections.value]
    }
  ]
  runtime.draft.value = ''
  clearComposerSelections()
  emit('send', { sessionId: sessionId.value, text, queued: true })
}

/**
 * 统一处理发送 / 插话 / 入队。
 * @param mode send 立刻发给宿主；steer 生成中插话；queue 只进队列
 */
async function submitTurn(mode: 'send' | 'steer' | 'queue') {
  // 显式入队，或生成中点发送且开了 queue：先进队列等本轮结束
  if (mode === 'queue' || (mode === 'send' && generating.value && flags.value.queue)) {
    enqueueDraft()
    return
  }
  const text = runtime.draft.value.trim()
  emit('send', { sessionId: sessionId.value, text })
  autoScroll.pinToLatest()
  const sent = await runtime.sendDraft({
    extraFiles: extraSendFiles(),
    activeSkills: skillNames(),
    steer: mode === 'steer' ? true : generating.value ? true : undefined
  })
  if (sent) clearComposerSelections() // 发送失败保留附件 / 技能，方便改完再发
}

/** 本轮结束后把队列头一条填回输入区并发送。 */
async function flushQueue() {
  // 还在生成 / 发送 / 已经在 flush：等当前 turn 结束，避免两条并行
  if (flushingQueue || generating.value || sending.value || !queuedTurns.value.length) return
  const next = queuedTurns.value[0]
  if (!next) return // 上一行已判空，收窄类型
  flushingQueue = true
  queuedTurns.value = queuedTurns.value.slice(1)
  runtime.draft.value = next.text
  runtime.files.value = next.files
  activeSkills.value = next.skills
  kbSelections.value = next.kb
  try {
    await submitTurn('send')
  } finally {
    flushingQueue = false
  }
}

/** 输入框点发送或回车。 */
async function onSend() {
  await submitTurn('send')
}

/** 生成中带草稿点引导，走 steer。 */
function onSteer() {
  void submitTurn('steer')
}

/** 生成中带草稿点排队。 */
function onQueue() {
  submitTurn('queue')
}

/** 输入框点停止，打断当前 turn。 */
function onStop() {
  void runtime.stopTurn()
}

watch(generating, (now, was) => {
  // 本轮刚结束：把队列头一条发出去
  if (was && !now) void flushQueue()
})

/**
 * 用户批准或拒绝工具调用，并回写给宿主。
 * @param granted true 批准，false 拒绝
 */
function onRespondApproval(granted: boolean) {
  const block = pendingApproval.value
  if (!block) return // 浮层已关掉，重复点击不再打接口
  emit('approval-answered', {
    sessionId: sessionId.value,
    messageId: liveMessageId.value,
    block,
    granted
  })
  void runtime.respondApproval(block, granted)
}

/**
 * 用户回答追问：点选项或提交自定义文本。
 * @param kind option 点目录项；custom 自己打字
 * @param value 选项文案或自定义答案
 */
function onRespondQuestion(kind: 'option' | 'custom', value: string) {
  emit('question-answered', {
    sessionId: sessionId.value,
    messageId: liveMessageId.value,
    block: pendingQuestion.value ?? undefined,
    kind,
    value
  })
  void runtime.respondQuestion(kind, value)
}

defineExpose({
  stop: () => runtime.stopTurn(),
  getClient: (): JiaorongClient | null => runtime.getClient(),
  ready
})
</script>

<template>
  <section
    data-testid="chat-page-shell"
    class="relative grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background"
  >
    <!-- 顶栏：已有会话时可改标题 -->
    <ChatTopBar
      v-if="flags.topBar"
      :title="sessionTitle"
      :renamable="Boolean(sessionId)"
      @rename="(title) => void runtime.renameSession(title)"
    />
    <!-- 非用户取消的运行时错误 -->
    <p v-if="errorText" class="px-6 py-2 text-xs text-red-500">{{ errorText }}</p>
    <!-- 消息视口：上翻预取历史，贴底跟随流式输出 -->
    <div data-testid="chat-viewport-region" class="relative min-h-0 min-w-0">
      <div
        ref="viewport"
        data-testid="chat-page"
        class="message-list-container relative h-full min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto"
        @scroll.passive="onMessageScroll"
      >
        <div class="min-h-full min-w-0">
          <div data-testid="chat-message-list" class="chat-message-list w-full min-w-0 max-w-full">
            <div class="mx-auto w-full max-w-5xl min-w-0 px-6 py-6">
              <div v-if="loadingHistory" class="pb-3 text-center text-xs text-muted-foreground">
                加载更早消息…
              </div>
              <template v-for="item in transcript" :key="item.id">
                <MessageItemUser
                  v-if="item.role === 'user'"
                  :id="item.id"
                  :user-name="userName"
                  :timestamp="item.createdAt"
                  :text="item.text"
                  :files="item.files"
                  :knowledge-base-selections="item.knowledgeBaseSelections"
                  :skills="item.skills"
                  :slash-items="slashItems"
                  :app-id="appId"
                  :toolbar="toolbarActions"
                  @retry="runtime.retryMessage(item.id)"
                  @delete="runtime.deleteMessage(item.id)"
                  @save="(text) => runtime.editUserMessage(item.id, text)"
                />
                <MessageItemAssistant
                  v-else
                  :id="item.id"
                  :agent-name="agentName"
                  :timestamp="item.createdAt"
                  :updated-at="item.updatedAt"
                  :blocks="item.blocks"
                  :generating="generating && item.id === (liveMessageId || lastAssistantId)"
                  :streaming="Boolean(liveMessageId) && item.id === liveMessageId"
                  :status="item.status"
                  :thread-generating="generating"
                  :toolbar="toolbarActions"
                  @retry="runtime.retryMessage(item.id)"
                  @delete="runtime.deleteMessage(item.id)"
                  @fork="runtime.forkSession(item.id)"
                />
              </template>
              <div class="h-px w-full" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 底部：计划 / 追问 / 审批浮层 + 输入框 + 状态栏 -->
    <div data-testid="chat-composer-region" class="relative w-full min-w-0 px-6 pt-3 pb-3">
      <div class="mx-auto flex w-full max-w-5xl min-w-0 flex-col items-center">
        <div class="relative w-full">
          <div
            v-if="planItems.length || pendingQuestion || pendingApproval"
            class="pointer-events-none absolute inset-x-0 bottom-[calc(100%+0.75rem)] flex w-full flex-col items-center gap-2"
            data-testid="agent-progress-float-layer"
          >
            <ChatInteractionDock
              class="pointer-events-auto"
              :plan-items="planItems"
              :question="pendingQuestion"
              :approval="pendingApproval"
              @question-option="onRespondQuestion('option', $event)"
              @question-custom="onRespondQuestion('custom', $event)"
              @respond-approval="onRespondApproval"
              @dismiss-plan="dismissedPlanKey = JSON.stringify(runtime.planItems.value)"
            />
          </div>
          <div class="mx-auto flex w-full max-w-4xl flex-col">
            <div
              v-show="!hideComposer"
              class="flex w-full flex-col"
              :aria-hidden="hideComposer ? 'true' : undefined"
            >
              <ChatPendingQueue
                v-if="flags.queue"
                class="mb-2"
                :items="queuedPreview"
                @remove="removeQueued"
              />
              <ChatInputBox
                v-model="draft"
                v-model:active-skills="activeSkills"
                :sending="sending"
                :generating="generating"
                :disabled="!ready"
                :agent-name="agentName"
                :placeholder="placeholder"
                :files="files"
                :attachments="flags.attachments"
                :stop="flags.stop"
                :steer="flags.steer"
                :knowledge-base="flags.knowledgeBase"
                :slash="flags.slash"
                :queue="flags.queue"
                :slash-items="slashItems"
                :knowledge-base-selections="kbSelections"
                :app-id="appId"
                @send="onSend()"
                @steer="onSteer()"
                @queue="onQueue()"
                @stop="onStop()"
                @attach="runtime.attachFiles"
                @remove-file="runtime.removeFile"
                @open-knowledge-base="kbOpen = true"
                @remove-kb="removeKb"
              />
              <ChatStatusBar
                v-if="
                  flags.modelPicker ||
                  flags.permissionMode ||
                  flags.orchestration ||
                  flags.generationSettings
                "
                :models="models"
                :provider-id="selectedProviderId"
                :model-id="selectedModelId"
                :permission-mode="selectedPermission"
                :orchestration="selectedOrchestration"
                :occupancy="runtime.occupancy.value"
                :system-prompts="runtime.systemPrompts.value"
                :selected-system-prompt-id="selectedSystemPromptId"
                :tool-mode="selectedToolMode"
                :tool-mode-override="runtime.toolModeOverride.value"
                :agent-tools="runtime.agentTools.value"
                :disabled-tool-names="runtime.disabledToolNames.value"
                :tools-loading="runtime.toolsLoading.value"
                :generation-settings="runtime.generationSettings.value"
                :model-picker="flags.modelPicker"
                :permission-picker="flags.permissionMode"
                :orchestration-picker="flags.orchestration"
                :generation-settings-picker="flags.generationSettings"
                :disabled="!ready"
                @select-model="
                  (payload) => void runtime.setSessionModel(payload.providerId, payload.modelId)
                "
                @select-permission="(mode) => void runtime.setPermissionMode(mode)"
                @select-orchestration="(policy) => void runtime.setOrchestrationPolicy(policy)"
                @update-generation-settings="
                  (payload) => void runtime.updateGenerationSettings(payload)
                "
                @select-system-prompt="(id) => void runtime.selectSystemPrompt(id)"
                @select-tool-mode="(mode) => void runtime.setToolMode(mode)"
                @toggle-tool-group="(payload) => void runtime.toggleToolGroup(payload)"
                @toggle-tool="(name) => void runtime.toggleAgentTool(name)"
                @open-settings="void runtime.loadAdvancedPanel()"
                @open-collab="void runtime.loadGenerationSettings()"
                @open-models="void runtime.ensureModels()"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 知识库选择弹层：需要宿主 token 与 apiBaseUrl -->
    <KnowledgeBasePicker
      v-if="flags.knowledgeBase"
      :open="kbOpen"
      :auth="kbAuth"
      :selected="kbSelections"
      @update:open="kbOpen = $event"
      @confirm="onConfirmKb"
    />
  </section>
</template>
