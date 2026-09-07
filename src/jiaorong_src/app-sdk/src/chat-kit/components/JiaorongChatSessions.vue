<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { isAbsoluteFsPath, normalizeFsDir } from '../lib/hostDialog'
import { SESSION_LIST_LOAD_MORE_PX } from '../lib/windowPolicy'
import type { JiaorongChatProject, JiaorongChatSession } from '../types'
import JiaorongChatSessionItem from './JiaorongChatSessionItem.vue'

const props = defineProps<{
  sessions: readonly JiaorongChatSession[]
  projects?: readonly JiaorongChatProject[]
  activeSessionId?: string | null
  agentName?: string
  generating?: boolean
  hasMore?: boolean
  loadingMore?: boolean
}>()

const emit = defineEmits<{
  select: [sessionId: string]
  create: []
  'add-workspace': []
  'open-workspace': [path: string]
  remove: [sessionId: string]
  pin: [sessionId: string]
  'load-more': []
}>()

const collapsedPaths = shallowRef<Set<string>>(new Set())
const chatSectionCollapsed = shallowRef(false)

const searchQuery = shallowRef('')

function folderName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path
}

function sessionDir(session: JiaorongChatSession) {
  const dir = session.projectDir?.trim() || ''
  return dir && isAbsoluteFsPath(dir) ? normalizeFsDir(dir) : ''
}

const listedSessions = computed(() =>
  props.sessions.map((session) => ({
    ...session,
    status:
      props.generating && session.id === props.activeSessionId
        ? 'working'
        : (session.status ?? 'idle')
  }))
)

const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase())

function matchesSearch(session: JiaorongChatSession) {
  if (!normalizedSearch.value) return true
  return (session.title?.trim() || '未命名对话').toLowerCase().includes(normalizedSearch.value)
}

const visibleSessions = computed(() => listedSessions.value.filter(matchesSearch))
const pinnedSessions = computed(() => visibleSessions.value.filter((item) => item.pinned))
const chatSessions = computed(() =>
  visibleSessions.value.filter((item) => !item.pinned && !sessionDir(item))
)
const workspaceGroups = computed(() => {
  const byPath = new Map<string, JiaorongChatSession[]>()
  for (const session of listedSessions.value) {
    if (session.pinned) continue
    if (!matchesSearch(session)) continue
    const dir = sessionDir(session)
    if (!dir) continue
    const list = byPath.get(dir) ?? []
    list.push(session)
    byPath.set(dir, list)
  }
  const groups: Array<{ path: string; name: string; sessions: JiaorongChatSession[] }> = []
  const seen = new Set<string>()
  for (const project of props.projects ?? []) {
    if (!isAbsoluteFsPath(project.path)) continue
    const path = normalizeFsDir(project.path)
    seen.add(path)
    groups.push({
      path,
      name: project.name || folderName(path),
      sessions: byPath.get(path) ?? []
    })
  }
  for (const [path, sessions] of byPath) {
    if (seen.has(path)) continue
    groups.push({ path, name: folderName(path), sessions })
  }
  if (!normalizedSearch.value) return groups
  return groups.filter((group) => group.sessions.length > 0)
})

function isCollapsed(path: string) {
  return collapsedPaths.value.has(path)
}

function toggleGroup(path: string) {
  const next = new Set(collapsedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsedPaths.value = next
}

function onWorkspaceHeaderClick(path: string) {
  toggleGroup(path)
}

function onWorkspaceNewChat(path: string) {
  emit('open-workspace', path)
}

const sessionListEl = shallowRef<HTMLElement | null>(null)

function maybeLoadMoreSessions() {
  const el = sessionListEl.value
  if (!el || props.loadingMore || !props.hasMore) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distance <= SESSION_LIST_LOAD_MORE_PX) emit('load-more')
}

function onSessionListScroll() {
  maybeLoadMoreSessions()
}

watch(
  () => [props.sessions.length, props.hasMore, props.loadingMore] as const,
  async () => {
    await nextTick()
    maybeLoadMoreSessions()
  }
)

onMounted(() => {
  void nextTick().then(maybeLoadMoreSessions)
})
</script>

<template>
  <aside
    data-testid="window-sidebar-session-column"
    class="window-sidebar-session-column window-sidebar-shell flex h-full w-[240px] shrink-0 flex-col overflow-hidden"
  >
    <div class="shrink-0 px-3 pt-3 pb-3">
      <div class="truncate px-2 text-sm font-semibold text-foreground">
        {{ agentName || '交融对话' }}
      </div>
      <div class="mt-3 space-y-1">
        <div class="relative px-2">
          <Icon
            icon="lucide:search"
            class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            v-model="searchQuery"
            data-testid="sidebar-session-search-input"
            type="search"
            placeholder="搜索对话"
            aria-label="搜索对话"
            class="window-sidebar-search-input h-8 w-full rounded-xl pr-8 pl-8 text-sm outline-none"
            @keydown.esc.prevent="searchQuery = ''"
          />
        </div>
        <button
          data-testid="app-new-chat-button"
          type="button"
          class="window-sidebar-action-btn flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-foreground transition-colors hover:bg-accent/60"
          @click="emit('create')"
        >
          <Icon icon="lucide:square-pen" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate">新会话</span>
        </button>
      </div>
    </div>

    <div
      ref="sessionListEl"
      class="session-list flex-1 overflow-y-auto px-1.5"
      @scroll.passive="onSessionListScroll"
    >
      <div v-if="pinnedSessions.length > 0" class="pt-2">
        <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">置顶</div>
        <div class="space-y-0.5">
          <JiaorongChatSessionItem
            v-for="session in pinnedSessions"
            :key="`pinned-${session.id}`"
            :session="session"
            :active="session.id === activeSessionId"
            :search-query="searchQuery"
            @select="emit('select', session.id)"
            @pin="emit('pin', session.id)"
            @remove="emit('remove', session.id)"
          />
        </div>
      </div>

      <div class="mt-4 rounded-lg bg-muted/30 p-1">
        <div
          class="flex w-full items-center gap-1 rounded-md pr-1 text-xs font-semibold text-muted-foreground"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-accent/40 hover:text-foreground"
            :aria-expanded="!chatSectionCollapsed"
            @click="chatSectionCollapsed = !chatSectionCollapsed"
          >
            <Icon
              :icon="chatSectionCollapsed ? 'lucide:chevron-right' : 'lucide:chevron-down'"
              class="size-3.5 shrink-0"
            />
            <span class="min-w-0 flex-1 truncate">会话</span>
          </button>
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md hover:bg-accent/60"
            title="新会话"
            @click="emit('create')"
          >
            <Icon icon="lucide:plus" class="size-4" />
          </button>
        </div>
        <div v-show="!chatSectionCollapsed" class="space-y-0.5">
          <JiaorongChatSessionItem
            v-for="session in chatSessions"
            :key="session.id"
            :session="session"
            :active="session.id === activeSessionId"
            :search-query="searchQuery"
            @select="emit('select', session.id)"
            @pin="emit('pin', session.id)"
            @remove="emit('remove', session.id)"
          />
        </div>
      </div>

      <div
        class="flex items-center justify-between gap-2 px-2 pb-1"
        :class="
          pinnedSessions.length > 0 || chatSessions.length > 0
            ? 'mt-3 border-t border-border/60 pt-3'
            : 'pt-4'
        "
      >
        <div class="min-w-0 truncate text-xs font-semibold text-muted-foreground">工作区</div>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            title="添加工作区"
            @click="emit('add-workspace')"
          >
            <Icon icon="lucide:folder-plus" class="size-4" />
          </button>
        </div>
      </div>

      <div v-for="group in workspaceGroups" :key="group.path" class="mt-1">
        <div class="group flex w-full items-center gap-1 rounded-md pr-1">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            :aria-expanded="!isCollapsed(group.path)"
            @click="onWorkspaceHeaderClick(group.path)"
          >
            <Icon
              :icon="isCollapsed(group.path) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
              class="size-3.5 shrink-0"
            />
            <Icon icon="lucide:folder" class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ group.name }}</span>
            <span class="shrink-0 text-[10px] font-normal text-muted-foreground/70">
              {{ group.sessions.length || '空' }}
            </span>
          </button>
          <button
            type="button"
            class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            title="新会话"
            @click.stop="onWorkspaceNewChat(group.path)"
          >
            <Icon icon="lucide:plus" class="size-3.5" />
          </button>
        </div>
        <div
          v-show="!isCollapsed(group.path) && group.sessions.length > 0"
          class="space-y-0.5 pl-2"
        >
          <JiaorongChatSessionItem
            v-for="session in group.sessions"
            :key="session.id"
            :session="session"
            :active="session.id === activeSessionId"
            :search-query="searchQuery"
            @select="emit('select', session.id)"
            @pin="emit('pin', session.id)"
            @remove="emit('remove', session.id)"
          />
        </div>
      </div>
    </div>
  </aside>
</template>
