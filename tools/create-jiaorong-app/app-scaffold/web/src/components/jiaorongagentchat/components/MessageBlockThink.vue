<!--
  思考块适配层：把助手 reasoning 块转成 ThinkContent 所需的标题、展开态与计时。
  主要 props：block（思考块）、usage（推理起止时间）、live（当前是否正在生成）。
-->
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

/** 思考块入参，转成 ThinkContent 所需的标题与计时 */
const props = defineProps<{
  /** 思考 / 推理类型的助手消息块 */
  block: DisplayAssistantMessageBlock
  /** 消息级推理起止时间，块内没有 reasoning_time 时作兜底 */
  usage: { reasoning_start_time: number; reasoning_end_time: number }
  /** 当前这条正在生成时展开；历史默认收起。 */
  live?: boolean
}>()

/** true 表示收起思考正文 */
const collapse = ref(true)
/** 用户手动点过折叠后，不再跟 live 自动同步 */
const userToggled = ref(false)
/** 标题里展示的已思考秒数 */
const displayedSeconds = ref(0)
/** 思考中每秒刷新标题的定时器 */
let updateTimer: ReturnType<typeof setTimeout> | null = null

/** 优先用块内 reasoning_time，否则回退到 usage */
const reasoningDuration = computed(() => {
  const range = props.block.reasoning_time
  if (range && typeof range === 'object' && 'start' in range && 'end' in range) {
    return Math.max(0, (range.end - range.start) / 1000)
  }
  return Math.max(0, (props.usage.reasoning_end_time - props.usage.reasoning_start_time) / 1000)
})

/** 生成中显示「正在思考」，结束后显示「思考了 N 秒」 */
const headerText = computed(() => {
  const seconds = displayedSeconds.value
  return props.block.status === 'loading' ? `正在思考（第 ${seconds} 秒）` : `思考了 ${seconds} 秒`
})

/** 用户手动切换展开/收起，并锁定为用户控制 */
function onToggle() {
  userToggled.value = true
  collapse.value = !collapse.value
}

watch(
  () => Boolean(props.live),
  (shouldExpand) => {
    // 用户已手动操作过，不再被 live 覆盖
    if (userToggled.value) return
    collapse.value = !shouldExpand
  },
  { immediate: true }
)

/** 刷新展示秒数；仍在 loading 时 1 秒后再 tick */
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
