<!--
  工具批准面板：展示待批准的工具调用，让用户允许或拒绝。
  主要 props：block（含 tool_call 的助手消息块）。
-->
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { AssistantMessageBlock } from '../model/host'

/** 批准面板入参：待批准的助手消息块 */
defineProps<{
  /** 待批准的助手消息块，读取 tool_call.name 或 content 作为说明 */
  block: AssistantMessageBlock
}>()

/** 向父级抛出的批准结果 */
const emit = defineEmits<{
  /** granted 为 true 表示允许，false 表示拒绝 */
  respond: [granted: boolean]
}>()
</script>

<template>
  <div class="flex min-h-0 w-full flex-col gap-3 p-4">
    <!-- 标题：工具批准 -->
    <div class="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon icon="lucide:shield" class="h-4 w-4" />
      <span>工具批准</span>
    </div>
    <!-- 工具名或兜底文案 -->
    <p class="text-sm break-words">
      {{ block.tool_call?.name || block.content || '需要批准工具调用' }}
    </p>
    <!-- 允许 / 拒绝 -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        @click="emit('respond', true)"
      >
        允许
      </button>
      <button
        type="button"
        class="rounded-md border px-3 py-1.5 text-xs"
        @click="emit('respond', false)"
      >
        拒绝
      </button>
    </div>
  </div>
</template>
