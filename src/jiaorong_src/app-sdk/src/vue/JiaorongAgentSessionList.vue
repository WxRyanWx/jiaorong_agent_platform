<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'
import { registerJiaorongAgentIcons } from './lib/icons'
import { SESSION_LIST_LOAD_MORE_PX } from './lib/windowPolicy'
import { sortSessionsByPin } from './lib/sessions'
import { useJiaorongAgentRuntime } from './composables/useJiaorongAgentRuntime'
import SessionListItem from './components/SessionListItem.vue'
import type { SessionWithState } from '../types'

registerJiaorongAgentIcons()

const props = withDefaults(
  defineProps<{
    appId?: string
    agentId?: string
    agentName?: string
    httpBase?: string
    /** 页面自己灌数据时打开。组件不再 connect SDK。 */
    external?: boolean
    sessions?: SessionWithState[]
    generating?: boolean
    loadingSessions?: boolean
  }>(),
  {
    appId: '',
    agentId: '',
    agentName: '交融对话',
    external: false
  }
)

const emit = defineEmits<{
  'toggle-pin': [sessionId: string]
  delete: [sessionId: string]
  'load-more': []
  new: []
}>()

const sessionId = defineModel<string | null>('sessionId', { default: null })
const searchQuery = shallowRef('')

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

const generating = computed(() => runtime?.generating.value ?? Boolean(props.generating))
const loadingSessions = computed(
  () => runtime?.loadingSessions.value ?? Boolean(props.loadingSessions)
)
const sessions = computed(() =>
  runtime ? runtime.sessions.value : sortSessionsByPin(props.sessions ?? [])
)

const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase())
const visibleSessions = computed(() => {
  const items = sessions.value
  if (!normalizedSearch.value) return items
  return items.filter((item) =>
    (item.title?.trim() || '未命名对话').toLowerCase().includes(normalizedSearch.value)
  )
})

function onListScroll(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLElement)) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight > SESSION_LIST_LOAD_MORE_PX) return
  if (runtime) {
    void runtime.loadMoreSessions()
    return
  }
  emit('load-more')
}

function onTogglePin(id: string) {
  if (runtime) {
    void runtime.togglePin(id)
    return
  }
  emit('toggle-pin', id)
}

function onDelete(id: string) {
  if (runtime) {
    void runtime.removeSession(id)
    return
  }
  emit('delete', id)
}

function onNewSession() {
  sessionId.value = null
  emit('new')
}
</script>

<template>
  <aside
    data-testid="window-sidebar-session-column"
    class="window-sidebar-session-column flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
  >
    <div class="shrink-0 px-3 pb-3 pt-3">
      <div class="flex items-center justify-between gap-2 px-2">
        <div class="min-w-0 truncate text-sm font-semibold text-foreground">{{ agentName }}</div>
        <button
          type="button"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          title="新对话"
          aria-label="新对话"
          @click="onNewSession"
        >
          <Icon icon="lucide:plus" class="size-4" />
        </button>
      </div>
      <div class="relative mt-3 px-2">
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          v-model="searchQuery"
          data-testid="sidebar-session-search-input"
          type="search"
          placeholder="搜索会话标题"
          aria-label="搜索会话标题"
          class="window-sidebar-search-input h-8 w-full rounded-xl pr-8 pl-8 text-sm outline-none"
          @keydown.esc.prevent="searchQuery = ''"
        />
      </div>
    </div>
    <div class="session-list flex-1 overflow-y-auto px-1.5" @scroll.passive="onListScroll">
      <div v-if="loadingSessions" class="px-2 py-2 text-xs text-muted-foreground">
        加载中…
      </div>
      <SessionListItem
        v-for="session in visibleSessions"
        :key="session.id"
        :session="session"
        :active="session.id === sessionId"
        :generating="generating && session.id === sessionId"
        :search-query="searchQuery"
        @select="sessionId = session.id"
        @toggle-pin="onTogglePin(session.id)"
        @delete="onDelete(session.id)"
      />
    </div>
  </aside>
</template>
