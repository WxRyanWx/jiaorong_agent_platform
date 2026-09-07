<template>
  <ThinkContent
    :label="headerText"
    :expanded="!collapse"
    :thinking="block.status === 'loading'"
    :content="block.content"
    @toggle="collapse = !collapse"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DisplayAssistantMessageBlock } from '../model/display'
import ThinkContent from './ThinkContent.vue'

const props = defineProps<{
  block: DisplayAssistantMessageBlock
  usage: { reasoning_start_time: number; reasoning_end_time: number }
}>()

// 思考标题和正文默认展开；详情组 / 工具参数保持收起。
const collapse = ref(false)
const displayedSeconds = ref(0)
let updateTimer: ReturnType<typeof setTimeout> | null = null

const reasoningDuration = computed(() => {
  const range = props.block.reasoning_time
  if (range && typeof range === 'object' && 'start' in range && 'end' in range) {
    return Math.max(0, (range.end - range.start) / 1000)
  }
  return Math.max(0, (props.usage.reasoning_end_time - props.usage.reasoning_start_time) / 1000)
})

const headerText = computed(() => {
  const seconds = displayedSeconds.value
  return props.block.status === 'loading' ? `正在思考（第 ${seconds} 秒）` : `思考了 ${seconds} 秒`
})

function tick() {
  displayedSeconds.value = Math.max(0, Math.floor(reasoningDuration.value))
  if (props.block.status === 'loading') {
    updateTimer = setTimeout(tick, 1000)
  }
}

watch(
  () => [props.block.status, reasoningDuration.value] as const,
  () => {
    if (updateTimer) clearTimeout(updateTimer)
    tick()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (updateTimer) clearTimeout(updateTimer)
})
</script>
