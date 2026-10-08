<!-- 侧栏会话列表：搜索、滚动加载更多、新建对话、置顶与删除。 -->
<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Icon } from '@iconify/vue'
import type { NodeClient } from '../../api'
import { registerJiaorongAgentIcons } from '../jiaorongagentchat/lib/icons'
import { SESSION_LIST_LOAD_MORE_PX } from '../jiaorongagentchat/lib/windowPolicy'
import { useJiaorongAgentRuntime } from '../jiaorongagentchat/composables/useJiaorongAgentRuntime'
import SessionListItem from './SessionListItem.vue'

registerJiaorongAgentIcons()

const props = withDefaults(
  defineProps<{
    /** Host 应用 ID */
    appId?: string
    /** Agent ID */
    agentId?: string
    /** 侧栏标题 */
    agentName?: string
    /** 已有客户端，优先于自行创建 */
    client?: NodeClient | null
  }>(),
  {
    appId: '',
    agentId: '',
    agentName: '交融对话'
  }
)

const emit = defineEmits<{
  /** 点「新对话」，sessionId 已置空 */
  new: []
}>()

/** 当前选中会话，空表示新对话 */
const sessionId = defineModel<string | null>('sessionId', { default: null })
/** 标题搜索框 */
const searchQuery = shallowRef('')

const runtime = useJiaorongAgentRuntime({
  appId: () => props.appId,
  agentId: () => props.agentId,
  sessionId,
  client: () => props.client,
  surface: 'list',
  onSessionId: (next) => {
    sessionId.value = next
  }
})

/** 当前会话是否正在生成 */
const generating = computed(() => runtime.generating.value)
/** 首屏会话是否加载中 */
const loadingSessions = computed(() => runtime.loadingSessions.value)
/** 运行时会话全量（含已加载分页） */
const sessions = computed(() => runtime.sessions.value)
/** 小写去空白后的搜索词 */
const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase())
/** 按标题过滤后的可见会话 */
const visibleSessions = computed(() => {
  const items = sessions.value
  // 空搜索展示全部
  if (!normalizedSearch.value) return items
  return items.filter((item) =>
    (item.title?.trim() || '未命名对话').toLowerCase().includes(normalizedSearch.value)
  )
})

/** 接近底部时加载下一页。 */
function onListScroll(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLElement)) return
  // 离底部还远，不触发分页
  if (el.scrollHeight - el.scrollTop - el.clientHeight > SESSION_LIST_LOAD_MORE_PX) return
  void runtime.loadMoreSessions()
}

/** 清空当前会话并通知超级智能体打开新对话。 */
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
    <!-- 标题、新对话、搜索 -->
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
          class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
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
    <!-- 会话列表 -->
    <div class="session-list flex-1 overflow-y-auto px-1.5" @scroll.passive="onListScroll">
      <div v-if="loadingSessions" class="px-2 py-2 text-xs text-muted-foreground">加载中…</div>
      <SessionListItem
        v-for="session in visibleSessions"
        :key="session.id"
        :session="session"
        :active="session.id === sessionId"
        :generating="generating && session.id === sessionId"
        :search-query="searchQuery"
        @select="sessionId = session.id"
        @toggle-pin="runtime.togglePin(session.id)"
        @delete="runtime.removeSession(session.id)"
      />
    </div>
  </aside>
</template>
