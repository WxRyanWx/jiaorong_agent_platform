<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '../../types'
import { activityTitle, collectActivityGroup, type ActivityGroup } from '../lib/activity'
import { renderChatMarkdown } from '../lib/markdown'

const props = defineProps<{
  blocks: AssistantMessageBlock[]
  generating?: boolean
  liveTurn?: boolean
  showReasoning?: boolean
  showTools?: boolean
}>()

const now = shallowRef(Date.now())
const isExpanded = shallowRef(false)
const thinkOverride = shallowRef<Record<string, boolean>>({})
const toolOverride = shallowRef<Record<string, boolean>>({})
let timer: number | null = null
const liveTurn = computed(() => props.liveTurn === true)

const group = computed<ActivityGroup | null>(() => {
  const collected = collectActivityGroup(props.blocks, now.value)
  if (!collected) return null
  const blocks = collected.blocks.filter((block) => {
    if (block.type === 'tool_call') return props.showTools !== false
    return props.showReasoning !== false
  })
  if (blocks.length === 0) return null
  return {
    ...collected,
    blocks,
    reasoningCount: blocks.filter(
      (block) => block.type === 'reasoning_content' || block.type === 'artifact-thinking'
    ).length,
    toolCallCount: blocks.filter((block) => block.type === 'tool_call').length
  }
})

const titleText = computed(() => (group.value ? activityTitle(group.value) : ''))

function blockKey(block: AssistantMessageBlock, index: number) {
  return block.id || block.tool_call?.id || `${block.type}:${index}`
}

function thinkSeconds(block: AssistantMessageBlock) {
  const range = block.reasoning_time
  if (range && typeof range.start === 'number') {
    const end = typeof range.end === 'number' && range.end > range.start ? range.end : now.value
    return Math.max(0, Math.floor((end - range.start) / 1000))
  }
  if (typeof block.timestamp === 'number' && block.timestamp > 0) {
    return Math.max(0, Math.floor((now.value - block.timestamp) / 1000))
  }
  return 0
}

function thinkLabel(block: AssistantMessageBlock) {
  const seconds = thinkSeconds(block)
  if (block.status === 'loading') return `正在思考（第 ${seconds} 秒）`
  return `思考了 ${seconds} 秒`
}

function isThinkOpen(key: string) {
  if (Object.prototype.hasOwnProperty.call(thinkOverride.value, key)) {
    return thinkOverride.value[key] === true
  }
  return true
}

function isToolOpen(key: string) {
  if (Object.prototype.hasOwnProperty.call(toolOverride.value, key)) {
    return toolOverride.value[key] === true
  }
  return false
}

function toolName(block: AssistantMessageBlock) {
  return block.tool_call?.name || block.extra?.toolName || '工具调用'
}

function formatToolText(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return ''
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
      return trimmed
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toolParams(block: AssistantMessageBlock) {
  return formatToolText(block.tool_call?.params ?? block.extra?.params)
}

function toolResponse(block: AssistantMessageBlock) {
  return formatToolText(
    block.tool_call?.response ?? block.extra?.response ?? block.extra?.result ?? block.content
  )
}

function toolStatus(block: AssistantMessageBlock) {
  if (block.status === 'error') return 'error'
  if (block.status === 'success') return 'success'
  if (block.status === 'loading' || block.status === 'pending') return 'running'
  return 'neutral'
}

function toolIcon(block: AssistantMessageBlock) {
  return toolStatus(block) === 'error' ? 'lucide:x' : 'lucide:circle-small'
}

function toolIconClass(block: AssistantMessageBlock) {
  const status = toolStatus(block)
  if (status === 'error') return 'text-destructive'
  if (status === 'success') return 'text-emerald-500'
  return 'text-muted-foreground'
}

function toggleThink(key: string) {
  thinkOverride.value = { ...thinkOverride.value, [key]: !isThinkOpen(key) }
}

function toggleTool(key: string) {
  toolOverride.value = { ...toolOverride.value, [key]: !isToolOpen(key) }
}

watch(
  liveTurn,
  (live) => {
    thinkOverride.value = {}
    toolOverride.value = {}
    isExpanded.value = live
  },
  { immediate: true }
)

watch(
  () => props.generating,
  (generating) => {
    if (timer != null) {
      window.clearInterval(timer)
      timer = null
    }
    if (generating) {
      if (liveTurn.value) isExpanded.value = true
      now.value = Date.now()
      timer = window.setInterval(() => {
        now.value = Date.now()
      }, 1000)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (timer != null) window.clearInterval(timer)
})
</script>

<template>
  <div v-if="group" class="flex w-full flex-col" data-testid="activity-group">
    <button
      type="button"
      data-testid="activity-group-toggle"
      class="inline-flex max-w-full min-w-0 items-center gap-1 self-start rounded-sm text-xs leading-4 text-[rgba(37,37,37,0.5)] select-none"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <Icon
        icon="lucide:chevron-right"
        class="h-[14px] w-[14px] shrink-0 text-[rgba(37,37,37,0.5)] transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
        :class="isExpanded ? 'rotate-90' : 'rotate-0'"
      />
      <span class="min-w-0 truncate">{{ titleText }}</span>
    </button>
    <div v-show="isExpanded" class="mt-1.5 flex w-full flex-col gap-1.5">
      <template v-for="(block, index) in group.blocks" :key="blockKey(block, index)">
        <div
          v-if="block.type !== 'tool_call'"
          class="flex flex-col gap-[6px] text-xs leading-4 text-[rgba(37,37,37,0.5)]"
        >
          <div
            class="inline-flex cursor-pointer items-center gap-[10px] self-start select-none"
            @click="toggleThink(blockKey(block, index))"
          >
            <span class="whitespace-nowrap">{{ thinkLabel(block) }}</span>
            <Icon
              v-if="block.status === 'loading' && !isThinkOpen(blockKey(block, index))"
              icon="lucide:ellipsis"
              class="h-[14px] w-[14px] animate-[pulse_1s_ease-in-out_infinite] text-[rgba(37,37,37,0.5)]"
            />
            <Icon
              v-else-if="isThinkOpen(blockKey(block, index))"
              icon="lucide:chevron-down"
              class="h-[14px] w-[14px] text-[rgba(37,37,37,0.5)]"
            />
            <Icon
              v-else
              icon="lucide:chevron-right"
              class="h-[14px] w-[14px] text-[rgba(37,37,37,0.5)]"
            />
          </div>
          <div
            v-show="isThinkOpen(blockKey(block, index))"
            class="think-prose jr-chat-md w-full max-w-full text-xs leading-5"
            v-html="renderChatMarkdown(block.content || '')"
          />
        </div>
        <div v-else class="flex w-full flex-col">
          <button
            type="button"
            data-testid="tool-call-trigger"
            class="tool-call-pill inline-flex min-h-7 w-fit items-center gap-2 overflow-hidden rounded-lg border border-border bg-accent px-2 py-1.5 text-left text-xs leading-4 select-none hover:bg-accent/40"
            :aria-expanded="isToolOpen(blockKey(block, index))"
            @click="toggleTool(blockKey(block, index))"
          >
            <span
              v-if="toolStatus(block) === 'running'"
              class="tool-call-status-ring shrink-0"
              aria-hidden="true"
            />
            <Icon
              v-else
              :icon="toolIcon(block)"
              class="h-3.5 w-3.5 shrink-0"
              :class="toolIconClass(block)"
            />
            <span class="shrink-0 font-mono text-xs leading-none text-foreground/80">
              {{ toolName(block) }}
            </span>
            <Icon
              icon="lucide:chevron-right"
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-[var(--dc-motion-fast)] ease-[var(--dc-ease-out-soft)]"
              :class="isToolOpen(blockKey(block, index)) ? 'rotate-90' : 'rotate-0'"
            />
          </button>
          <div v-show="isToolOpen(blockKey(block, index))" class="mt-2 mb-4 w-full">
            <div
              data-testid="tool-call-details"
              class="w-full rounded-lg border border-border bg-muted px-2 py-3 text-card-foreground"
            >
              <div class="flex flex-col gap-4">
                <div class="truncate font-mono text-xs font-medium text-foreground/75">
                  {{ toolName(block) }}
                </div>
                <div v-if="toolParams(block)" class="min-w-0 flex-1 space-y-2">
                  <h5
                    class="flex flex-row items-center gap-2 text-xs font-medium text-accent-foreground"
                  >
                    <Icon icon="lucide:arrow-up-from-dot" class="h-4 w-4 text-foreground" />
                    参数
                  </h5>
                  <div
                    class="max-h-20 min-h-0 overflow-auto rounded-md border border-border bg-background p-2 text-xs break-words whitespace-pre-wrap"
                  >
                    {{ toolParams(block) }}
                  </div>
                </div>
                <div v-if="toolResponse(block)" class="min-w-0 flex-1 space-y-2">
                  <h5
                    class="flex flex-row items-center gap-2 text-xs font-medium text-accent-foreground"
                  >
                    <Icon icon="lucide:arrow-down-to-dot" class="h-4 w-4 text-foreground" />
                    响应数据
                  </h5>
                  <div
                    class="max-h-40 min-h-0 overflow-auto rounded-md border border-border bg-background p-2 text-xs break-words whitespace-pre-wrap"
                  >
                    {{ toolResponse(block) }}
                  </div>
                </div>
                <div
                  v-if="!toolParams(block) && !toolResponse(block)"
                  class="text-xs text-muted-foreground"
                >
                  暂无参数或返回
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
