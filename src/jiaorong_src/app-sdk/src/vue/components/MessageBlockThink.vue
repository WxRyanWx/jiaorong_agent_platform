<template>
  <ThinkContent
    :label="headerText"
    :expanded="!collapse"
    :thinking="block.status === 'loading'"
    :content="block.content"
    @toggle="onToggle"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { DisplayAssistantMessageBlock } from '../model/display'
import ThinkContent from './ThinkContent.vue'

const props = defineProps<{
  block: DisplayAssistantMessageBlock
  usage: { reasoning_start_time: number; reasoning_end_time: number }
  /** 当前这条正在生成时展开；历史默认收起。 */
  live?: boolean
}>()

const collapse = ref(true)
const userToggled = ref(false)
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

function onToggle() {
  userToggled.value = true
  collapse.value = !collapse.value
}

watch(
  () => Boolean(props.live),
  (shouldExpand) => {
    if (userToggled.value) return
    collapse.value = !shouldExpand
  },
  { immediate: true }
)

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
