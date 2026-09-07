<template>
  <div class="flex flex-col w-full" data-testid="activity-group">
    <button
      type="button"
      data-testid="activity-group-toggle"
      class="inline-flex max-w-full min-w-0 items-center gap-1 self-start text-xs leading-4 text-[rgba(37,37,37,0.5)] dark:text-white/50 select-none rounded-sm"
      :aria-expanded="isExpanded"
      :aria-label="titleText"
      @click="toggleExpanded"
    >
      <Icon
        icon="lucide:chevron-right"
        class="w-[14px] h-[14px] shrink-0 text-[rgba(37,37,37,0.5)] dark:text-white/50 transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
        :class="isExpanded ? 'rotate-90' : 'rotate-0'"
      />
      <span class="min-w-0 truncate">{{ titleText }}</span>
    </button>
    <div
      class="grid w-full overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-[var(--dc-motion-default)] ease-[var(--dc-ease-out-express)]"
      :class="
        isExpanded
          ? 'mt-1.5 grid-rows-[1fr] opacity-100'
          : 'mt-0 grid-rows-[0fr] opacity-0 pointer-events-none'
      "
    >
      <div
        v-if="shouldRenderBody"
        class="min-h-0 flex flex-col w-full gap-1.5 overflow-hidden"
        data-testid="activity-group-body"
      >
        <template v-for="(block, index) in blocks" :key="buildActivityBlockKey(block, index)">
          <MessageBlockThink
            v-if="
              (block.type === 'reasoning_content' || block.type === 'artifact-thinking') &&
              block.content
            "
            :block="block"
            :usage="usage"
          />
          <MessageBlockToolCall
            v-else-if="block.type === 'tool_call'"
            :block="block"
            :permission-status="
              block.tool_call?.id ? permissionStatusByToolCallId?.[block.tool_call.id] : undefined
            "
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Icon } from '@iconify/vue'
import type { DisplayAssistantMessageBlock, DisplayMessageUsage, ResolvedPermissionStatus } from '../model/display'
import { buildActivityBlockKey, formatActivityDuration } from '../model/activityGroups'
import MessageBlockThink from './MessageBlockThink.vue'
import MessageBlockToolCall from './MessageBlockToolCall.vue'

const props = defineProps<{
  blocks: DisplayAssistantMessageBlock[]
  usage: DisplayMessageUsage
  durationMs: number
  reasoningCount: number
  toolCallCount: number
  permissionStatusByToolCallId?: Record<string, ResolvedPermissionStatus>
}>()

const isExpanded = ref(false)
const shouldRenderBody = ref(false)
let bodyUnmountTimer: number | null = null

const durationText = computed(() => formatActivityDuration(props.durationMs))
const titleText = computed(() => {
  const segments: string[] = [`已经工作了 ${durationText.value}`]
  if (props.reasoningCount > 0) segments.push(`${props.reasoningCount} 段思考`)
  if (props.toolCallCount > 0) segments.push(`${props.toolCallCount} 次工具调用`)
  return segments.join(' · ')
})

function toggleExpanded() {
  if (!isExpanded.value) {
    if (bodyUnmountTimer !== null) window.clearTimeout(bodyUnmountTimer)
    shouldRenderBody.value = true
    isExpanded.value = true
    return
  }
  isExpanded.value = false
  bodyUnmountTimer = window.setTimeout(() => {
    bodyUnmountTimer = null
    if (!isExpanded.value) shouldRenderBody.value = false
  }, 240)
}

onBeforeUnmount(() => {
  if (bodyUnmountTimer !== null) window.clearTimeout(bodyUnmountTimer)
})
</script>
