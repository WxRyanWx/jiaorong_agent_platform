<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { JiaorongChatSession } from '../types'

const props = defineProps<{
  session: JiaorongChatSession
  active: boolean
  searchQuery?: string
}>()

const emit = defineEmits<{
  select: []
  pin: []
  remove: []
}>()

const title = computed(() => props.session.title?.trim() || '未命名对话')
const isWorking = computed(() => props.session.status === 'working')
const pinState = computed(() => (props.session.pinned ? 'docked' : 'overlay'))
const statusIcon = computed(() => {
  if (props.session.status === 'completed')
    return { icon: 'lucide:check', className: 'text-green-500' }
  if (props.session.status === 'error')
    return { icon: 'lucide:alert-circle', className: 'text-destructive' }
  return null
})

const titleSegments = computed(() => {
  const query = props.searchQuery?.trim()
  if (!query) return [{ text: title.value, match: false }]
  const source = title.value
  const lower = source.toLowerCase()
  const needle = query.toLowerCase()
  const segments: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  while (cursor < source.length) {
    const index = lower.indexOf(needle, cursor)
    if (index < 0) {
      segments.push({ text: source.slice(cursor), match: false })
      break
    }
    if (index > cursor) segments.push({ text: source.slice(cursor, index), match: false })
    segments.push({ text: source.slice(index, index + needle.length), match: true })
    cursor = index + needle.length
  }
  return segments
})
</script>

<template>
  <div
    data-testid="sidebar-session-item"
    class="session-item no-drag flex w-full select-none items-center rounded-lg px-2.5 text-left transition-colors duration-150"
    :class="active ? 'bg-accent text-accent-foreground' : 'text-foreground/80 hover:bg-accent/50'"
    :data-pin-state="pinState"
    :data-active="String(active)"
    :data-session-id="session.id"
    @click="emit('select')"
  >
    <button
      type="button"
      class="session-action-button pin-button flex h-7 w-7 items-center justify-center rounded-lg"
      :class="session.pinned ? 'pin-button--active' : 'pin-button--idle'"
      title="置顶"
      @click.stop="emit('pin')"
    >
      <Icon icon="lucide:pin" class="pin-button__icon h-4 w-4" />
    </button>

    <div class="session-content flex min-w-0 flex-1 items-center gap-1.5">
      <span
        class="session-title min-w-0 flex-1 text-sm"
        :class="{ 'session-title--loading': isWorking }"
      >
        <span class="session-title__label">
          <template v-for="(segment, index) in titleSegments" :key="`${index}-${segment.text}`">
            <mark v-if="segment.match" class="session-title__highlight">{{ segment.text }}</mark>
            <template v-else>{{ segment.text }}</template>
          </template>
        </span>
        <span v-if="isWorking" aria-hidden="true" class="session-title__sheen">{{ title }}</span>
      </span>
      <span v-if="statusIcon" class="session-status shrink-0">
        <Icon :icon="statusIcon.icon" class="h-3.5 w-3.5" :class="statusIcon.className" />
      </span>
    </div>

    <span class="right-button flex items-center">
      <button
        type="button"
        class="session-action-button right-button__action flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground"
        title="删除"
        @click.stop="emit('remove')"
      >
        <Icon icon="lucide:trash-2" class="h-4 w-4" />
      </button>
    </span>
  </div>
</template>
