<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import type { AssistantMessageBlock } from '../types'
import JiaorongChatApprovals from './components/JiaorongChatApprovals.vue'
import JiaorongChatEmpty from './components/JiaorongChatEmpty.vue'
import JiaorongChatItem from './components/JiaorongChatItem.vue'
import JiaorongChatQuestions from './components/JiaorongChatQuestions.vue'
import JiaorongChatSender from './components/JiaorongChatSender.vue'
import JiaorongChatSessions from './components/JiaorongChatSessions.vue'
import JiaorongChatStatusBar from './components/JiaorongChatStatusBar.vue'
import JiaorongChatTopBar from './components/JiaorongChatTopBar.vue'
import KnowledgeBasePicker from './components/KnowledgeBasePicker.vue'
import { resolveJiaorongChatFeatures } from './features'
import { filesToMessageFiles } from './lib/files'
import {
  allowHostProjectDir,
  isAbsoluteFsPath,
  normalizeFsDir,
  pickHostDirectory,
  setHostOrchestrationPolicy,
  setHostPermissionMode,
  setHostSessionPinned
} from './lib/hostDialog'
import { registerJiaorongChatIcons } from './lib/icons'
import { buildKnowledgeBaseContextFile, isJiaorongKbContextFile } from './lib/kbContext'
import { collectPendingApprovals, findPendingQuestion } from './lib/pending'
import { INITIAL_MESSAGE_RESTORE_COUNT, TOP_HISTORY_PREFETCH_PX } from './lib/windowPolicy'
import type {
  JiaorongChatFeatures,
  JiaorongChatKnowledgeBaseAuth,
  JiaorongChatMessage,
  JiaorongChatPermissionMode,
  JiaorongChatProject,
  JiaorongChatSendPayload,
  JiaorongChatSession,
  JiaorongKbSelection,
  JiaorongSlashItem
} from './types'

registerJiaorongChatIcons()

const PROJECTS_KEY = 'jiaorong-chat-recent-projects'

function readProjects(): JiaorongChatProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as JiaorongChatProject[]) : []
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item?.path && item?.name && isAbsoluteFsPath(item.path))
          .map((item) => ({ ...item, path: normalizeFsDir(item.path) }))
      : []
  } catch {
    return []
  }
}

const draft = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    messages: JiaorongChatMessage[]
    sessions?: readonly JiaorongChatSession[]
    activeSessionId?: string | null
    sessionTitle?: string
    generating?: boolean
    sending?: boolean
    disabled?: boolean
    agentName?: string
    userName?: string
    features?: JiaorongChatFeatures
    knowledgeBase?: JiaorongChatKnowledgeBaseAuth | null
    logoSrc?: string | null
    slashItems?: readonly JiaorongSlashItem[]
    appId?: string
    liveMessageId?: string | null
    sessionPermissionMode?: JiaorongChatPermissionMode | null
    hasMoreHistory?: boolean
    loadingHistory?: boolean
    hasMoreSessions?: boolean
    loadingSessions?: boolean
  }>(),
  {
    sessions: () => [],
    activeSessionId: null,
    sessionTitle: '',
    generating: false,
    sending: false,
    disabled: false,
    agentName: '交融对话',
    userName: 'You',
    knowledgeBase: null,
    logoSrc: '',
    slashItems: () => [],
    appId: '',
    liveMessageId: null,
    sessionPermissionMode: null,
    hasMoreHistory: false,
    loadingHistory: false,
    hasMoreSessions: false,
    loadingSessions: false
  }
)

const emit = defineEmits<{
  send: [payload: JiaorongChatSendPayload]
  stop: []
  grant: [block: AssistantMessageBlock]
  deny: [block: AssistantMessageBlock]
  'question-option': [label: string]
  'question-custom': [text: string]
  'select-session': [sessionId: string]
  'create-session': []
  'remove-session': [sessionId: string]
  'pin-session': [sessionId: string]
  'rename-session': [sessionId: string, title: string]
  'load-older': []
  'load-more-sessions': []
}>()

const flags = computed(() => resolveJiaorongChatFeatures(props.features))
const files = ref<File[]>([])
const kbSelections = ref<JiaorongKbSelection[]>([])
const pickerOpen = shallowRef(false)
const projects = ref<JiaorongChatProject[]>(readProjects())
const selectedProjectPath = shallowRef<string | null>(null)
const permissionMode = shallowRef<JiaorongChatPermissionMode>('full_access')
const lastAppliedPermission = shallowRef<JiaorongChatPermissionMode>('full_access')
const collaboration = shallowRef(false)
const activeSkills = ref<JiaorongSlashItem[]>([])
const messageListEl = ref<HTMLElement | null>(null)
let pendingPrepend: { height: number; top: number } | null = null
let stickToBottom = true
let olderLoadLock = false

watch(
  () => props.activeSessionId,
  () => {
    stickToBottom = true
    pendingPrepend = null
    olderLoadLock = false
  }
)

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 80
}

function onMessageScroll() {
  const el = messageListEl.value
  if (!el) return
  if (!isNearBottom(el)) stickToBottom = false
  if (
    olderLoadLock ||
    props.loadingHistory ||
    !props.hasMoreHistory ||
    props.messages.length < INITIAL_MESSAGE_RESTORE_COUNT ||
    el.scrollTop > TOP_HISTORY_PREFETCH_PX
  ) {
    return
  }
  olderLoadLock = true
  pendingPrepend = { height: el.scrollHeight, top: el.scrollTop }
  emit('load-older')
}

watch(
  () => props.loadingHistory,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      olderLoadLock = false
      void nextTick().then(() => {
        const el = messageListEl.value
        if (el && pendingPrepend) {
          const delta = el.scrollHeight - pendingPrepend.height
          if (delta > 0) el.scrollTop = pendingPrepend.top + delta
          pendingPrepend = null
        }
        onMessageScroll()
      })
    }
  }
)

watch(
  () => props.messages.map((item) => item.id).join('\0'),
  async () => {
    await nextTick()
    const el = messageListEl.value
    if (!el) return
    if (pendingPrepend) {
      const delta = el.scrollHeight - pendingPrepend.height
      if (delta > 0) el.scrollTop = pendingPrepend.top + delta
      pendingPrepend = null
      return
    }
    if (stickToBottom || isNearBottom(el)) {
      el.scrollTop = el.scrollHeight
      stickToBottom = true
    }
  }
)

watch(
  () => props.sessionPermissionMode,
  (mode) => {
    if (!mode) return
    permissionMode.value = mode
    lastAppliedPermission.value = mode
  }
)

const isEmpty = computed(() => !props.activeSessionId && !props.generating)
const sessionItems = computed(() =>
  props.sessions.map((session) => ({
    ...session,
    pinned: session.pinned ?? false,
    status:
      props.generating && session.id === props.activeSessionId
        ? 'working'
        : (session.status ?? 'idle')
  }))
)
const resolvedTitle = computed(() => {
  if (props.sessionTitle.trim()) return props.sessionTitle
  const active = sessionItems.value.find((item) => item.id === props.activeSessionId)
  return active?.title?.trim() || '新会话'
})
const lastAssistantBlocks = computed(() => {
  const last = [...props.messages].reverse().find((item) => item.role === 'assistant')
  return last?.blocks ?? []
})
const pendingApprovals = computed(() =>
  flags.value.approvals ? collectPendingApprovals(lastAssistantBlocks.value) : []
)
const pendingQuestion = computed(() =>
  flags.value.questions ? (findPendingQuestion(lastAssistantBlocks.value) ?? null) : null
)
const lastAssistantId = computed(() => {
  const last = [...props.messages].reverse().find((item) => item.role === 'assistant')
  return last?.id ?? null
})
const kbAuth = computed(() =>
  flags.value.knowledgeBase && props.knowledgeBase?.token && props.knowledgeBase.apiBaseUrl
    ? props.knowledgeBase
    : null
)

function persistProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.value))
}

async function rememberProjectDir(path: string) {
  const dir = normalizeFsDir(path)
  if (!isAbsoluteFsPath(dir)) return false
  return allowHostProjectDir(dir, props.appId)
}

function addProject(project: JiaorongChatProject, moveToFront = true) {
  if (!isAbsoluteFsPath(project.path)) return
  const next = { ...project, path: normalizeFsDir(project.path) }
  const exists = projects.value.some((item) => item.path === next.path)
  if (exists && !moveToFront) return
  projects.value = [next, ...projects.value.filter((item) => item.path !== next.path)].slice(0, 12)
  persistProjects()
}

watch(
  () => props.sessions,
  (sessions) => {
    for (const session of sessions) {
      const dir = session.projectDir?.trim() || ''
      if (!isAbsoluteFsPath(dir)) continue
      addProject(
        {
          path: dir,
          name: dir.split(/[\\/]/).filter(Boolean).at(-1) || dir
        },
        false
      )
    }
  },
  { immediate: true }
)

function onAttach(next: File[]) {
  files.value = [...files.value, ...next]
}

function removeFile(index: number) {
  files.value = files.value.filter((_, i) => i !== index)
}

async function onSend() {
  const text = draft.value.trim()
  if (!text || props.sending || props.disabled) return
  const uploaded = flags.value.attachments ? await filesToMessageFiles(files.value) : []
  const kbFile =
    flags.value.knowledgeBase && kbSelections.value.length
      ? buildKnowledgeBaseContextFile(text, kbSelections.value)
      : null
  const selectedDir =
    selectedProjectPath.value && isAbsoluteFsPath(selectedProjectPath.value)
      ? normalizeFsDir(selectedProjectPath.value)
      : ''
  if (selectedDir) await rememberProjectDir(selectedDir)
  emit('send', {
    text,
    files: kbFile
      ? [...uploaded.filter((file) => !isJiaorongKbContextFile(file)), kbFile]
      : uploaded,
    projectDir: selectedDir || undefined,
    permissionMode: permissionMode.value,
    collaboration: collaboration.value,
    activeSkills: activeSkills.value.map((item) => item.skillName?.trim() || '').filter(Boolean)
  })
  files.value = []
  activeSkills.value = []
}

function isProactive(session?: JiaorongChatSession) {
  const policy = session?.orchestrationPolicy
  if (policy === 'proactive') return true
  if (policy && typeof policy === 'object' && 'policy' in policy) {
    return (policy as { policy?: string }).policy === 'proactive'
  }
  return false
}

function onCreateChat() {
  selectedProjectPath.value = null
  emit('create-session')
}

async function onAddWorkspace() {
  const picked = await pickHostDirectory(props.appId)
  if (!picked) return
  addProject(picked)
  selectedProjectPath.value = normalizeFsDir(picked.path)
  emit('create-session')
}

async function onOpenWorkspace(path: string) {
  if (!isAbsoluteFsPath(path)) return
  const dir = normalizeFsDir(path)
  await rememberProjectDir(dir)
  selectedProjectPath.value = dir
  emit('create-session')
}

async function onSelectProject(path: string | null) {
  if (!path) {
    selectedProjectPath.value = null
    return
  }
  const dir = normalizeFsDir(path)
  if (!isAbsoluteFsPath(dir)) return
  await rememberProjectDir(dir)
  selectedProjectPath.value = dir
}

function onSelectSession(sessionId: string) {
  const session = sessionItems.value.find((item) => item.id === sessionId)
  const dir = session?.projectDir?.trim() || ''
  selectedProjectPath.value = dir && isAbsoluteFsPath(dir) ? normalizeFsDir(dir) : null
  collaboration.value = isProactive(session)
  if (session?.permissionMode) {
    permissionMode.value = session.permissionMode
    lastAppliedPermission.value = session.permissionMode
  }
  emit('select-session', sessionId)
}

async function onPermissionChange(mode: JiaorongChatPermissionMode) {
  if (!props.activeSessionId) {
    lastAppliedPermission.value = mode
    return
  }
  try {
    await setHostPermissionMode(props.activeSessionId, mode, props.appId)
    lastAppliedPermission.value = mode
  } catch {
    permissionMode.value = lastAppliedPermission.value
  }
}

async function onCollaborationChange(enabled: boolean) {
  if (!props.activeSessionId) return
  try {
    await setHostOrchestrationPolicy(
      props.activeSessionId,
      enabled ? 'proactive' : 'explicit',
      props.appId
    )
  } catch {
    collaboration.value = !enabled
  }
}

function removeKb(key: string) {
  kbSelections.value = kbSelections.value.filter((item) => item.key !== key)
}

function onConfirmKb(items: JiaorongKbSelection[]) {
  kbSelections.value = items
}

async function togglePin(sessionId: string) {
  const current = sessionItems.value.find((item) => item.id === sessionId)?.pinned ?? false
  const ok = await setHostSessionPinned(sessionId, !current, props.appId)
  if (!ok) return
  emit('pin-session', sessionId)
}

function onRename(title: string) {
  if (!props.activeSessionId) return
  emit('rename-session', props.activeSessionId, title)
}
</script>

<template>
  <div class="jiaorong-chat-root flex h-full min-h-0 w-full min-w-0 overflow-hidden">
    <JiaorongChatSessions
      v-if="flags.sessions"
      :sessions="sessionItems"
      :projects="projects"
      :active-session-id="activeSessionId"
      :agent-name="agentName"
      :generating="generating"
      :has-more="hasMoreSessions"
      :loading-more="loadingSessions"
      @select="onSelectSession"
      @create="onCreateChat"
      @add-workspace="onAddWorkspace"
      @open-workspace="onOpenWorkspace"
      @remove="(id) => emit('remove-session', id)"
      @pin="togglePin"
      @load-more="emit('load-more-sessions')"
    />

    <section
      data-testid="chat-page-shell"
      class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <JiaorongChatEmpty
        v-if="isEmpty"
        :projects="projects"
        :selected-path="selectedProjectPath"
        :logo-src="logoSrc"
        :app-id="appId"
        @select-project="onSelectProject"
        @add-project="addProject"
      >
        <div class="flex w-full flex-col">
          <div v-if="messages.length" class="mb-4 w-full max-w-4xl">
            <JiaorongChatItem
              v-for="item in messages"
              :key="item.id"
              :item="item"
              :agent-name="agentName"
              :user-name="userName"
              :generating="false"
              :live-turn="false"
              :show-reasoning="flags.reasoning"
              :show-tools="flags.tools"
              :show-errors="flags.errors"
              :show-loading="flags.loading"
            />
          </div>
          <JiaorongChatSender
            v-if="flags.sender"
            v-model="draft"
            :sending="sending"
            :generating="generating"
            :disabled="disabled"
            :agent-name="agentName"
            :attachments="flags.attachments"
            :knowledge-base="flags.knowledgeBase"
            :stop="flags.stop"
            :files="files"
            :knowledge-base-selections="kbSelections"
            :slash="flags.slash"
            :slash-items="slashItems"
            :app-id="appId"
            v-model:active-skills="activeSkills"
            @send="onSend"
            @stop="emit('stop')"
            @attach="onAttach"
            @remove-file="removeFile"
            @remove-kb="removeKb"
            @open-knowledge-base="pickerOpen = true"
          />
          <JiaorongChatStatusBar
            v-model:permission-mode="permissionMode"
            v-model:collaboration="collaboration"
            @update:permission-mode="onPermissionChange"
            @update:collaboration="onCollaborationChange"
          />
        </div>
      </JiaorongChatEmpty>

      <template v-else>
        <JiaorongChatTopBar
          v-if="flags.topBar"
          :title="resolvedTitle"
          :renamable="Boolean(activeSessionId)"
          @rename="onRename"
        />
        <div data-testid="chat-viewport-region" class="relative min-h-0 min-w-0 flex-1">
          <div
            ref="messageListEl"
            data-testid="chat-page"
            class="message-list-container relative h-full min-h-0 w-full min-w-0 overflow-y-auto"
            @scroll.passive="onMessageScroll"
          >
            <div class="min-h-full">
              <div data-testid="chat-message-list" class="chat-message-list w-full min-w-0">
                <div class="mx-auto w-full max-w-5xl px-6 py-6">
                  <div v-if="loadingHistory" class="pb-3 text-center text-xs text-muted-foreground">
                    加载更早消息…
                  </div>
                  <JiaorongChatItem
                    v-for="item in messages"
                    :key="item.id"
                    :item="item"
                    :agent-name="agentName"
                    :user-name="userName"
                    :generating="generating && item.id === (liveMessageId || lastAssistantId)"
                    :live-turn="Boolean(liveMessageId) && item.id === liveMessageId"
                    :show-reasoning="flags.reasoning"
                    :show-tools="flags.tools"
                    :show-errors="flags.errors"
                    :show-loading="flags.loading"
                  />
                  <div class="h-px w-full" aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div data-testid="chat-composer-region" class="relative w-full min-w-0 px-6 pt-3 pb-3">
          <div class="mx-auto flex w-full max-w-5xl min-w-0 flex-col items-center">
            <div class="mx-auto flex w-full max-w-4xl flex-col">
              <JiaorongChatApprovals
                v-if="flags.approvals"
                :items="pendingApprovals"
                @grant="(block) => emit('grant', block)"
                @deny="(block) => emit('deny', block)"
              />
              <JiaorongChatQuestions
                v-if="flags.questions"
                :block="pendingQuestion"
                @option="(label) => emit('question-option', label)"
                @custom="(text) => emit('question-custom', text)"
              />
              <JiaorongChatSender
                v-if="flags.sender"
                v-model="draft"
                :sending="sending"
                :generating="generating"
                :disabled="disabled"
                :agent-name="agentName"
                :attachments="flags.attachments"
                :knowledge-base="flags.knowledgeBase"
                :stop="flags.stop"
                :files="files"
                :knowledge-base-selections="kbSelections"
                :slash="flags.slash"
                :slash-items="slashItems"
                :app-id="appId"
                v-model:active-skills="activeSkills"
                @send="onSend"
                @stop="emit('stop')"
                @attach="onAttach"
                @remove-file="removeFile"
                @remove-kb="removeKb"
                @open-knowledge-base="pickerOpen = true"
              />
              <JiaorongChatStatusBar
                v-model:permission-mode="permissionMode"
                v-model:collaboration="collaboration"
                @update:permission-mode="onPermissionChange"
                @update:collaboration="onCollaborationChange"
              />
            </div>
          </div>
        </div>
      </template>

      <KnowledgeBasePicker
        v-if="flags.knowledgeBase"
        :open="pickerOpen"
        :auth="kbAuth"
        :selected="kbSelections"
        @update:open="pickerOpen = $event"
        @confirm="onConfirmKb"
      />
    </section>
  </div>
</template>
