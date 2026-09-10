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
import KnowledgeBasePicker from '../chat-kit/components/KnowledgeBasePicker.vue'
import { buildKnowledgeBaseContextFile } from '../chat-kit/lib/kbContext'
import type { JiaorongKbSelection, JiaorongSlashItem } from '../chat-kit/types'
import { type PendingAttachment } from './lib/files'
import { normalizeSlashCommands, type JiaorongSlashCommand } from './lib/slashCommands'
import { findPendingQuestion, findPendingToolPermission } from '../helpers'
import { isUserCanceledError, localizeErrorText } from '../localize'
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
} from '../types'
import type { JiaorongClient } from '../client'
import type { JiaorongToolbarAction } from './lib/toolbar'

registerJiaorongAgentIcons()

const props = withDefaults(
  defineProps<{
    appId?: string
    agentId?: string
    agentName?: string
    userName?: string
    placeholder?: string
    httpBase?: string
    client?: JiaorongClient | null
    attachments?: boolean
    toolbar?: JiaorongToolbarAction[]
    features?: JiaorongAgentChatFeatures
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
  'stream-updated': [payload: ChatStreamUpdatedEvent]
  'stream-completed': [payload: ChatStreamCompletedEvent]
  'stream-failed': [payload: ChatStreamFailedEvent]
  'plan-updated': [payload: ChatPlanUpdatedEvent]
  'messages-changed': [payload: SessionMessagesChangedEvent]
  context: [payload: HostContext]
  question: [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
      options: Array<{ label: string; description?: string }>
    }
  ]
  'question-answered': [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock | undefined
      kind: 'option' | 'custom'
      value: string
    }
  ]
  approval: [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
    }
  ]
  'approval-answered': [
    payload: {
      sessionId: string | null
      messageId: string | null
      block: AssistantMessageBlock
      granted: boolean
    }
  ]
  send: [payload: { sessionId: string | null; text: string; queued?: boolean }]
  'runtime-ready': []
}>()

const sessionId = defineModel<string | null>('sessionId', { default: null })
const flags = computed(() =>
  resolveAgentChatFeatures(props.features, {
    attachments: props.attachments,
    toolbar: props.toolbar
  })
)
const viewport = useTemplateRef<HTMLElement>('viewport')
const dismissedPlanKey = shallowRef('')
const kbOpen = shallowRef(false)
const kbSelections = ref<JiaorongKbSelection[]>([])
const activeSkills = ref<JiaorongSlashItem[]>([])
const queuedTurns = ref<
  Array<{
    id: string
    text: string
    files: PendingAttachment[]
    skills: JiaorongSlashItem[]
    kb: JiaorongKbSelection[]
  }>
>([])
let flushingQueue = false

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

const draft = runtime.draft
const files = runtime.files

const ready = computed(() => runtime.ready.value)
watch(ready, (value) => {
  if (value) emit('runtime-ready')
})
onDeactivated(() => {
  kbOpen.value = false
})
const sending = computed(() => runtime.sending.value)
const generating = computed(() => runtime.generating.value)
const errorText = computed(() => {
  const raw = runtime.errorText.value
  if (!raw || isUserCanceledError(raw)) return ''
  return localizeErrorText(raw)
})
const loadingHistory = computed(() => runtime.loadingHistory.value)
const liveMessageId = computed(() => runtime.liveMessageId.value)
const transcript = computed(() => runtime.transcript.value)
const currentSession = computed(() => runtime.currentSession.value)
const models = computed(() => runtime.models.value as CatalogModel[])
const toolbarActions = computed(() => flags.value.toolbar)
const lastAssistantId = computed(() => {
  const last = [...transcript.value].reverse().find((item) => item.role === 'assistant')
  return last?.id ?? null
})
const liveAssistantBlocks = computed(() => {
  const live = transcript.value.find((item) => item.id === liveMessageId.value)
  return live?.blocks ?? []
})
const liveQuestion = computed(() => findPendingQuestion(liveAssistantBlocks.value) ?? null)
const liveApproval = computed(() => findPendingToolPermission(liveAssistantBlocks.value) ?? null)
const pendingApproval = computed(() => (flags.value.approvals ? liveApproval.value : null))
const pendingQuestion = computed(() => (flags.value.questions ? liveQuestion.value : null))
const planItems = computed(() => {
  if (!flags.value.plan) return [] as AgentPlanItem[]
  const items = runtime.planItems.value
  const key = JSON.stringify(items)
  if (dismissedPlanKey.value === key) return [] as AgentPlanItem[]
  return items
})
const sessionTitle = computed(() => currentSession.value?.title?.trim() || '新会话')
const selectedProviderId = computed(
  () => runtime.pendingModel.value?.providerId || currentSession.value?.providerId || ''
)
const selectedModelId = computed(
  () => runtime.pendingModel.value?.modelId || currentSession.value?.modelId || ''
)
const selectedPermission = computed<PermissionMode>(
  () => runtime.pendingPermissionMode.value || currentSession.value?.permissionMode || 'full_access'
)
const selectedOrchestration = computed<'explicit' | 'proactive'>(() => {
  if (runtime.pendingOrchestration.value) return runtime.pendingOrchestration.value
  const raw = currentSession.value?.orchestrationPolicy
  if (raw === 'proactive') return 'proactive'
  if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'proactive') {
    return 'proactive'
  }
  return 'explicit'
})
const selectedSystemPromptId = computed(() => {
  const content = runtime.generationSettings.value?.systemPrompt ?? ''
  if (!content.trim()) return 'empty'
  const matched = runtime.systemPrompts.value.find((item) => item.content === content)
  return matched?.id ?? '__custom__'
})
const selectedToolMode = computed(() => runtime.toolModeOverride.value ?? 'agent')
const hideComposer = computed(() => Boolean(pendingQuestion.value || pendingApproval.value))
const kbAuth = computed(() => {
  if (!flags.value.knowledgeBase) return null
  const ctx = runtime.hostContext.value
  const token = ctx?.token?.trim()
  const apiBaseUrl = ctx?.apiBaseUrl?.trim()
  if (!token || !apiBaseUrl) return null
  return { token, apiBaseUrl, productId: ctx?.productId }
})
const queuedPreview = computed(() =>
  queuedTurns.value.map((item) => ({ id: item.id, text: item.text }))
)
const slashItems = computed(() =>
  flags.value.slash ? normalizeSlashCommands(props.slashItems, props.appId) : []
)
const followKey = computed(() => {
  const last = transcript.value[transcript.value.length - 1]
  const content =
    last?.role === 'assistant'
      ? last.blocks.map((block) => block.content || '').join('')
      : last?.text || ''
  return `${sessionId.value}:${transcript.value.length}:${liveMessageId.value}:${content.length}:${generating.value}`
})
const autoScroll = useChatAutoScroll({
  enabled: () => flags.value.autoScroll,
  viewport,
  followKey
})

function clearComposerSelections() {
  kbSelections.value = []
  activeSkills.value = []
  runtime.files.value = []
}

watch(sessionId, (next, previous) => {
  autoScroll.pinToLatest()
  const createdDuringSend = !previous && Boolean(next) && (sending.value || generating.value)
  if (createdDuringSend) return
  queuedTurns.value = []
  clearComposerSelections()
})

watch(
  () => liveQuestion.value?.tool_call?.id,
  (id) => {
    const block = liveQuestion.value
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

async function onMessageScroll(event: Event) {
  autoScroll.onUserScroll()
  const el = event.target
  if (!(el instanceof HTMLElement)) return
  if (el.scrollTop > TOP_HISTORY_PREFETCH_PX) return
  await runtime.loadOlderMessages()
}

function extraSendFiles() {
  if (!flags.value.knowledgeBase || !kbSelections.value.length) return []
  const file = buildKnowledgeBaseContextFile(runtime.draft.value, kbSelections.value)
  return file ? [file] : []
}

function skillNames() {
  return activeSkills.value
    .map((item) => item.skillName)
    .filter((name): name is string => Boolean(name))
}

function removeKb(key: string) {
  kbSelections.value = kbSelections.value.filter((item) => item.key !== key)
}

function onConfirmKb(items: JiaorongKbSelection[]) {
  kbSelections.value = items
  kbOpen.value = false
}

function removeQueued(id: string) {
  queuedTurns.value = queuedTurns.value.filter((item) => item.id !== id)
}

function enqueueDraft() {
  const text = runtime.draft.value.trim()
  if (!text && !runtime.files.value.length && !kbSelections.value.length) return
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

async function submitTurn(mode: 'send' | 'steer' | 'queue') {
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
  if (sent) clearComposerSelections()
}

async function flushQueue() {
  if (flushingQueue || generating.value || sending.value || !queuedTurns.value.length) return
  const next = queuedTurns.value[0]
  if (!next) return
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

async function onSend() {
  await submitTurn('send')
}

function onSteer() {
  void submitTurn('steer')
}

function onQueue() {
  submitTurn('queue')
}

function onStop() {
  void runtime.stopTurn()
}

watch(generating, (now, was) => {
  if (was && !now) void flushQueue()
})

function onRespondApproval(granted: boolean) {
  const block = pendingApproval.value
  if (!block) return
  emit('approval-answered', {
    sessionId: sessionId.value,
    messageId: liveMessageId.value,
    block,
    granted
  })
  void runtime.respondApproval(block, granted)
}

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
    <ChatTopBar
      v-if="flags.topBar"
      :title="sessionTitle"
      :renamable="Boolean(sessionId)"
      @rename="(title) => void runtime.renameSession(title)"
    />
    <p v-if="errorText" class="px-6 py-2 text-xs text-red-500">{{ errorText }}</p>
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
