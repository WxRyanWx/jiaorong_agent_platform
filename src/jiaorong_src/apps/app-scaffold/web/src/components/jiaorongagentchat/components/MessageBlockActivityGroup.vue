<!--
  活动分组：把一段思考与工具调用收成可折叠摘要，展开后再渲染子块。
  主要 props：blocks、usage、durationMs、reasoningCount、toolCallCount、
  permissionStatusByToolCallId。
-->
<template>
  <div class="flex flex-col w-full" data-testid="activity-group">
    <!-- 摘要标题：点击展开 / 收起 -->
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
    <!-- 折叠动画容器；收起后延迟卸载正文以保住过渡 -->
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
            live
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
import type {
  DisplayAssistantMessageBlock,
  DisplayMessageUsage,
  ResolvedPermissionStatus
} from '../model/display'
import { buildActivityBlockKey, formatActivityDuration } from '../model/activityGroups'
import MessageBlockThink from './MessageBlockThink.vue'
import MessageBlockToolCall from './MessageBlockToolCall.vue'

/** 活动分组入参，供摘要标题与子块渲染使用 */
const props = defineProps<{
  /** 分组内的思考 / 工具调用块 */
  blocks: DisplayAssistantMessageBlock[]
  /** 传给思考块的推理耗时 */
  usage: DisplayMessageUsage
  /** 整段活动耗时，毫秒 */
  durationMs: number
  /** 思考段数 */
  reasoningCount: number
  /** 工具调用次数 */
  toolCallCount: number
  /** 按 tool_call.id 解析后的批准结果 */
  permissionStatusByToolCallId?: Record<string, ResolvedPermissionStatus>
}>()

/** 分组是否展开 */
const isExpanded = ref(false)
/** 是否挂载正文；收起动画结束后才卸掉 */
const shouldRenderBody = ref(false)
/** 收起后延迟卸载正文的定时器 */
let bodyUnmountTimer: number | null = null

/** 人类可读的活动耗时 */
const durationText = computed(() => formatActivityDuration(props.durationMs))
/** 摘要标题：耗时 + 思考段数 + 工具次数 */
const titleText = computed(() => {
  const segments: string[] = [`已经工作了 ${durationText.value}`]
  if (props.reasoningCount > 0) segments.push(`${props.reasoningCount} 段思考`)
  if (props.toolCallCount > 0) segments.push(`${props.toolCallCount} 次工具调用`)
  return segments.join(' · ')
})

/** 展开立即挂载正文；收起先播动画，240ms 后再卸载 */
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
