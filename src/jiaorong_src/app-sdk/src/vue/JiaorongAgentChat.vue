<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { TOP_HISTORY_PREFETCH_PX } from './lib/windowPolicy'
import { registerJiaorongAgentIcons } from './lib/icons'
import { filesToMessageFiles } from './lib/files'
import { buildTranscript } from './lib/transcript'
import { useJiaorongAgentRuntime } from './composables/useJiaorongAgentRuntime'
import ChatInputBox from './components/ChatInputBox.vue'
import MessageItemAssistant from './components/MessageItemAssistant.vue'
import MessageItemUser from './components/MessageItemUser.vue'
import { findPendingQuestion, findPendingToolPermission } from '../helpers'
import { isUserCanceledError, localizeErrorText } from '../localize'
import type { AssistantMessageBlock, ChatMessageRecord, MessageFile } from '../types'

registerJiaorongAgentIcons()

const props = withDefaults(
  defineProps<{
    appId?: string
    agentId?: string
    agentName?: string
    userName?: string
    /** 输入框占位文案。不传则组件按 agentName 拼默认提示。 */
    placeholder?: string
    httpBase?: string
    /** 页面自己灌数据时打开。组件不再 connect SDK。 */
    external?: boolean
    messages?: ChatMessageRecord[]
    liveBlocks?: AssistantMessageBlock[]
    liveMessageId?: string | null
    generating?: boolean
    sending?: boolean
    ready?: boolean
    errorText?: string
    loadingHistory?: boolean
  }>(),
  {
    appId: '',
    agentId: '',
    agentName: '交融对话',
    userName: 'You',
    external: false,
    ready: true
  }
)

const emit = defineEmits<{
  send: [payload: { text: string; files?: MessageFile[] }]
  stop: []
  'load-older': []
  'respond-approval': [payload: { block: AssistantMessageBlock; granted: boolean }]
  'respond-question': [payload: { kind: 'option' | 'custom'; value: string }]
}>()

const sessionId = defineModel<string | null>('sessionId', { default: null })
const localDraft = shallowRef('')
const localFiles = ref<File[]>([])

const runtime = props.external
  ? null
  : useJiaorongAgentRuntime({
      appId: () => props.appId,
      agentId: () => props.agentId,
      sessionId,
      httpBase: () => props.httpBase,
      onSessionId: (next) => {
        sessionId.value = next
      }
    })

const draft = runtime?.draft ?? localDraft
const files = runtime?.files ?? localFiles
const ready = computed(() => runtime?.ready.value ?? props.ready)
const sending = computed(() => runtime?.sending.value ?? Boolean(props.sending))
const generating = computed(() => runtime?.generating.value ?? Boolean(props.generating))
const errorText = computed(() => {
  const raw = runtime?.errorText.value ?? props.errorText ?? ''
  if (!raw || isUserCanceledError(raw)) return ''
  return localizeErrorText(raw)
})
const loadingHistory = computed(
  () => runtime?.loadingHistory.value ?? Boolean(props.loadingHistory)
)
const liveMessageId = computed(() => runtime?.liveMessageId.value ?? props.liveMessageId ?? null)
const transcript = computed(() =>
  runtime
    ? runtime.transcript.value
    : buildTranscript(props.messages ?? [], props.liveBlocks ?? [], props.liveMessageId ?? null)
)

const lastAssistantId = computed(() => {
  const last = [...transcript.value].reverse().find((item) => item.role === 'assistant')
  return last?.id ?? null
})

const pendingApproval = computed(() => {
  const live = transcript.value.find((item) => item.id === liveMessageId.value)
  return findPendingToolPermission(live?.blocks ?? [])
})

const pendingQuestion = computed(() => {
  const live = transcript.value.find((item) => item.id === liveMessageId.value)
  return findPendingQuestion(live?.blocks ?? [])
})

async function onMessageScroll(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLElement)) return
  if (el.scrollTop > TOP_HISTORY_PREFETCH_PX) return
  if (runtime) {
    await runtime.loadOlderMessages()
    return
  }
  emit('load-older')
}

async function onSend() {
  if (runtime) {
    await runtime.sendDraft()
    return
  }
  const text = draft.value.trim()
  if (!text || sending.value) return
  const messageFiles = files.value.length ? await filesToMessageFiles(files.value) : undefined
  emit('send', { text, files: messageFiles })
  draft.value = ''
  files.value = []
}

function onStop() {
  if (runtime) {
    void runtime.stopTurn()
    return
  }
  emit('stop')
}

function onAttach(next: File[]) {
  if (runtime) {
    runtime.attachFiles(next)
    return
  }
  files.value = [...files.value, ...next]
}

function onRemoveFile(index: number) {
  if (runtime) {
    runtime.removeFile(index)
    return
  }
  files.value = files.value.filter((_, current) => current !== index)
}

function onRespondApproval(block: AssistantMessageBlock, granted: boolean) {
  if (runtime) {
    void runtime.respondApproval(block, granted)
    return
  }
  emit('respond-approval', { block, granted })
}

function onRespondQuestion(kind: 'option' | 'custom', value: string) {
  if (runtime) {
    void runtime.respondQuestion(kind, value)
    return
  }
  emit('respond-question', { kind, value })
}

function questionOptions(block: AssistantMessageBlock | undefined) {
  const raw = block?.extra?.questionOptions
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { label?: unknown }).label === 'string'
    ) {
      return [(item as { label: string }).label]
    }
    return []
  })
}
</script>

<template>
  <section
    data-testid="chat-page-shell"
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
  >
    <p v-if="errorText" class="px-6 py-2 text-xs text-red-500">{{ errorText }}</p>
    <div data-testid="chat-viewport-region" class="relative min-h-0 min-w-0 flex-1">
      <div
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
                  :user-name="userName"
                  :timestamp="item.createdAt"
                  :text="item.text"
                  :files="item.files"
                  :skills="item.skills"
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
        <div class="mx-auto flex w-full max-w-4xl flex-col gap-2">
          <div
            v-if="pendingApproval"
            class="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-xs"
          >
            <span class="flex-1">需要批准工具调用</span>
            <button
              class="rounded-md bg-primary px-2 py-1 text-primary-foreground"
              type="button"
              @click="onRespondApproval(pendingApproval, true)"
            >
              允许
            </button>
            <button
              class="rounded-md border px-2 py-1"
              type="button"
              @click="onRespondApproval(pendingApproval, false)"
            >
              拒绝
            </button>
          </div>
          <div
            v-if="pendingQuestion"
            class="flex flex-col gap-2 rounded-lg border bg-muted px-3 py-2 text-xs"
          >
            <span>
              {{
                String(pendingQuestion.extra?.questionText || pendingQuestion.content || '请选择')
              }}
            </span>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="label in questionOptions(pendingQuestion)"
                :key="label"
                type="button"
                class="rounded-md border bg-background px-2 py-1"
                @click="onRespondQuestion('option', label)"
              >
                {{ label }}
              </button>
            </div>
          </div>
          <ChatInputBox
            v-model="draft"
            :sending="sending"
            :generating="generating"
            :disabled="!ready"
            :agent-name="agentName"
            :placeholder="placeholder"
            :files="files"
            @send="onSend()"
            @stop="onStop()"
            @attach="onAttach"
            @remove-file="onRemoveFile"
          />
        </div>
      </div>
    </div>
  </section>
</template>
