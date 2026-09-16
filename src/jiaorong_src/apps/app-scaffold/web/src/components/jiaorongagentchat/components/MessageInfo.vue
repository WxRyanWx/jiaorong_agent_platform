<!--
  消息头信息：展示发送者名称与本地时分。
  主要 props：name（显示名）、timestamp（毫秒时间戳）。
-->
<template>
  <!-- 名称 + 时间 -->
  <div class="flex flex-row items-center gap-2 h-4">
    <span class="text-xs font-bold text-foreground">{{ name }}</span>
    <span class="text-xs text-text-secondary-foreground">{{ formattedTime }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 消息头入参：发送者名称与时间戳 */
const props = defineProps<{
  /** 发送者显示名 */
  name: string
  /** 消息时间戳，单位毫秒 */
  timestamp: number
}>()

/** 格式化为中文环境的时:分；无时间戳则留空，避免显示 Invalid Date */
const formattedTime = computed(() => {
  if (!props.timestamp) return ''
  return new Date(props.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})
</script>
